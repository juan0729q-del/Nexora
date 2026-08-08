import "server-only";

import { createHash } from "crypto";
import { getUsdToCopRate, usdToCop } from "@/lib/commerce-finance";
import type { Product } from "@/lib/products";
import type { ProviderVariant } from "@/lib/provider-product-details";
import { CjQuotaError, CjRequestError, createCjClient, getCjCredentialConfiguration, type CjClient } from "@/lib/automation/cj-client";
import type { CjShippingQuoteOption, ShippingDestinationInput } from "./types";

const cjOrigin = "https://developers.cjdropshipping.com";
const variantQueryEndpoint = `${cjOrigin}/api2.0/v1/product/variant/query`;
const variantByIdEndpoint = `${cjOrigin}/api2.0/v1/product/variant/queryByVid`;
const freightTipEndpoint = `${cjOrigin}/api2.0/v1/logistic/freightCalculateTip`;

function checkoutPointsReserve() {
  const configured = Number(process.env.CJ_CHECKOUT_MINIMUM_POINTS_RESERVE || 0);
  return Number.isFinite(configured) && configured >= 0 ? Math.min(200, Math.floor(configured)) : 0;
}

/**
 * El checkout comparte una sola sesión CJ entre todas las líneas del carrito.
 * La importación conserva una reserva propia; el checkout puede usar el saldo
 * restante solo cuando cubre los costes preventivos de toda la cotización.
 */
export function createCjShippingClient() {
  return createCjClient({ minimumPointsReserve: checkoutPointsReserve() });
}

type CjInventory = {
  countryCode?: unknown;
  totalInventory?: unknown;
  cjInventory?: unknown;
  factoryInventory?: unknown;
  stock?: Array<{ inventory?: unknown; factoryInventory?: unknown }>;
};

type CjVariant = {
  vid?: unknown;
  pid?: unknown;
  variantSku?: unknown;
  variantLength?: unknown;
  variantWidth?: unknown;
  variantHeight?: unknown;
  variantVolume?: unknown;
  variantWeight?: unknown;
  variantSellPrice?: unknown;
  inventories?: CjInventory[];
};

type CjVariantListResponse = { data?: CjVariant[] };
type CjVariantByIdResponse = { data?: CjVariant };

type CjFreightRule = { msgEn?: unknown; type?: unknown; interceptType?: unknown; expression?: unknown };
type CjFreightItem = {
  error?: unknown;
  errorEn?: unknown;
  optionId?: unknown;
  channelId?: unknown;
  arrivalTime?: unknown;
  postage?: unknown;
  taxesFee?: unknown;
  clearanceOperationFee?: unknown;
  tariff?: unknown;
  remoteFee?: unknown;
  totalPostageFee?: unknown;
  recommendLogisticsTypeList?: unknown;
  ruleTips?: CjFreightRule[];
  allRuleTips?: CjFreightRule[];
  message?: unknown;
  tip?: unknown;
  option?: { id?: unknown; enName?: unknown; arrivalTime?: unknown };
  channel?: { id?: unknown; enName?: unknown };
  srcArea?: { shortCode?: unknown };
};
type CjFreightResponse = { data?: CjFreightItem[] };

export class CjShippingConfigurationError extends Error {}
export class CjShippingQuoteError extends Error {}

export type ResolvedCjShippingQuote = {
  productSlug: string;
  variantSku: string;
  quantity: number;
  supplierCostUsd: number;
  exchangeRateCopPerUsd: number;
  inventoryVerifiedAt: string;
  verifiedStock: number;
  quotedAt: string;
  expiresAt: string;
  options: CjShippingQuoteOption[];
};

type CacheEntry = { expiresAtMs: number; quote: ResolvedCjShippingQuote };
const quoteCache = new Map<string, CacheEntry>();

function quoteTtlMs() {
  const configured = Number(process.env.CJ_SHIPPING_QUOTE_TTL_SECONDS || 300);
  const seconds = Number.isFinite(configured) ? Math.max(60, Math.min(600, Math.floor(configured))) : 300;
  return seconds * 1000;
}

function text(value: unknown, maximum = 200) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined;
}

function number(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function positive(value: unknown) {
  const parsed = number(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function optionalMoney(value: unknown) {
  const parsed = number(value);
  return parsed !== undefined && parsed >= 0 ? parsed : null;
}

function countryCode(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) throw new CjShippingQuoteError("Indica el código ISO de dos letras del país de entrega, por ejemplo CO o US.");
  return code;
}

function required(value: string | undefined, label: string, maximum: number) {
  const normalized = value?.trim().slice(0, maximum) || "";
  if (!normalized) throw new CjShippingQuoteError(`Completa ${label} para que CJ cotice el envío.`);
  return normalized;
}

export function normalizeCjShippingDestination(destination: ShippingDestinationInput): ShippingDestinationInput {
  const email = required(destination.email, "el correo", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new CjShippingQuoteError("Ingresa un correo válido para cotizar y confirmar el pedido.");
  return {
    recipientName: required(destination.recipientName, "el nombre de quien recibe", 180),
    email,
    phone: required(destination.phone, "el teléfono de entrega", 60),
    address1: required(destination.address1, "la dirección de entrega", 300),
    address2: destination.address2?.trim().slice(0, 300) || undefined,
    district: required(destination.district, "el barrio, localidad o condado", 120),
    city: required(destination.city, "la ciudad", 120),
    region: required(destination.region, "el departamento o estado", 120),
    countryCode: countryCode(destination.countryCode),
    postalCode: required(destination.postalCode, "el código postal", 40),
    houseNumber: required(destination.houseNumber, "el número de la dirección", 80),
  };
}

function cacheKey(product: Product, variantSku: string, quantity: number, destination: ShippingDestinationInput) {
  const canonical = [
    product.slug,
    variantSku.toUpperCase(),
    String(quantity),
    destination.recipientName,
    destination.address1,
    destination.address2 || "",
    destination.district || "",
    destination.city,
    destination.region,
    destination.countryCode,
    destination.postalCode,
    destination.phone,
    destination.email,
    destination.houseNumber || "",
  ].map((value) => value.normalize("NFKC").trim().toLowerCase()).join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

function selectedVariant(product: Product, requestedSku?: string) {
  if (!product.variants.length) {
    throw new CjShippingQuoteError("CJ no reportó variantes verificables para este producto; no se puede cotizar ni cobrar todavía.");
  }
  const normalized = requestedSku?.trim().toUpperCase();
  if (!normalized && product.variants.length > 1) {
    throw new CjShippingQuoteError("Selecciona la variante antes de cotizar su envío.");
  }
  const selected = normalized
    ? product.variants.find((variant) => variant.sku.toUpperCase() === normalized)
    : product.variants[0];
  if (!selected) throw new CjShippingQuoteError("La variante elegida ya no está disponible en el catálogo de Nexora.");
  return selected;
}

function endpointWithQuery(endpoint: string, name: string, value: string) {
  const url = new URL(endpoint);
  url.searchParams.set(name, value);
  return url.toString();
}

async function resolveVariantFromCj(product: Product, selected: ProviderVariant, client: CjClient) {
  let variantId = selected.providerVariantId?.trim();
  let discovered: CjVariant | undefined;

  if (!variantId) {
    const response = await client.getJson<CjVariantListResponse>(endpointWithQuery(variantQueryEndpoint, "variantSku", selected.sku));
    discovered = (response.data || []).find((entry) => text(entry.variantSku)?.toUpperCase() === selected.sku.toUpperCase());
    variantId = text(discovered?.vid);
  }
  if (!variantId) throw new CjShippingQuoteError("CJ no devolvió el identificador logístico de la variante seleccionada.");

  const response = await client.getJson<CjVariantByIdResponse>(`${endpointWithQuery(variantByIdEndpoint, "vid", variantId)}&features=enable_inventory`);
  const variant = response.data;
  if (!variant || text(variant.variantSku)?.toUpperCase() !== selected.sku.toUpperCase()) {
    throw new CjShippingQuoteError("CJ no pudo confirmar la variante seleccionada para el envío.");
  }
  return { variantId, variant, discovered };
}

function inventoryQuantity(inventory: CjInventory) {
  const direct = [inventory.totalInventory, inventory.cjInventory, inventory.factoryInventory]
    .map(number)
    .filter((value): value is number => value !== undefined);
  const nested = (inventory.stock || []).flatMap((item) => [number(item.inventory), number(item.factoryInventory)]).filter((value): value is number => value !== undefined);
  return [...direct, ...nested].reduce((maximum, value) => Math.max(maximum, value), 0);
}

function sourceInventoryFrom(variant: CjVariant) {
  const candidates = (variant.inventories || [])
    .map((inventory) => ({ country: text(inventory.countryCode)?.toUpperCase(), quantity: inventoryQuantity(inventory) }))
    .filter((inventory): inventory is { country: string; quantity: number } => Boolean(inventory.country && /^[A-Z]{2}$/.test(inventory.country)));
  // Cuando CJ informa cantidades, sólo admitimos bodegas con stock positivo.
  // Algunos response de detalle devuelven exclusivamente countryCode; según la
  // propia API esa lista ya representa orígenes con inventario disponible.
  const eligible = (candidates.some((inventory) => inventory.quantity > 0)
    ? candidates.filter((inventory) => inventory.quantity > 0)
    : candidates)
    .sort((left, right) => right.quantity - left.quantity || left.country.localeCompare(right.country));
  if (!eligible.length) throw new CjShippingQuoteError("CJ no reportó un país de inventario disponible para esta variante.");
  return { countryCode: eligible[0].country, verifiedStock: Math.max(0, Math.floor(eligible[0].quantity)) };
}

function dimensionsFrom(variant: CjVariant, catalogVariant: ProviderVariant) {
  const lengthMm = positive(variant.variantLength) || catalogVariant.dimensions?.lengthMm;
  const widthMm = positive(variant.variantWidth) || catalogVariant.dimensions?.widthMm;
  const heightMm = positive(variant.variantHeight) || catalogVariant.dimensions?.heightMm;
  const volumeMm3 = positive(variant.variantVolume) || catalogVariant.volumeCubicMillimeters
    || (lengthMm && widthMm && heightMm ? lengthMm * widthMm * heightMm : undefined);
  if (!lengthMm || !widthMm || !heightMm || !volumeMm3) {
    throw new CjShippingQuoteError("CJ no reportó dimensiones suficientes para cotizar esta variante sin estimaciones.");
  }
  return { lengthCm: lengthMm / 10, widthCm: widthMm / 10, heightCm: heightMm / 10, volumeCm3: volumeMm3 / 1000 };
}

function weightFrom(product: Product, variant: CjVariant, catalogVariant: ProviderVariant) {
  const unitWeight = positive(variant.variantWeight) || catalogVariant.weightGrams || product.shipping.productWeightGrams;
  const wrapWeight = product.shipping.packingWeightGrams || unitWeight;
  if (!unitWeight || !wrapWeight) throw new CjShippingQuoteError("CJ no reportó el peso necesario para cotizar esta variante sin estimaciones.");
  return { unitWeightGrams: Math.ceil(unitWeight), wrapWeightGrams: Math.ceil(wrapWeight) };
}

function quoteAmount(item: CjFreightItem) {
  const remoteFee = optionalMoney(item.remoteFee) || 0;
  const total = positive(item.totalPostageFee);
  // CJ documenta totalPostageFee sin remoteFee. Lo agregamos de forma
  // explícita para no subcobrar una zona remota y lo mostramos al comprador.
  if (total !== undefined) return total + remoteFee;
  const postage = positive(item.postage);
  if (postage === undefined) return undefined;
  // La definición oficial de totalPostageFee suma estas cuatro partidas. Si
  // CJ no lo devuelve, se reconstruye sólo con las partidas que sí reporta.
  return postage + (optionalMoney(item.taxesFee) || 0) + (optionalMoney(item.clearanceOperationFee) || 0) + (optionalMoney(item.tariff) || 0) + remoteFee;
}

function noticesFrom(item: CjFreightItem) {
  const rules = [...(item.ruleTips || []), ...(item.allRuleTips || [])]
    .map((rule) => text(rule.msgEn, 240))
    .filter((message): message is string => Boolean(message));
  const misc = [text(item.tip, 240), text(item.message, 240)].filter((message): message is string => Boolean(message));
  return [...new Set([...rules, ...misc])].slice(0, 4);
}

function inputForStrongRule(destination: ShippingDestinationInput, type: string | undefined) {
  switch (type) {
    case "phone": return destination.phone;
    case "email": return destination.email;
    case "zip": return destination.postalCode;
    case "houseNumber": return destination.houseNumber || "";
    case "province": return destination.region;
    case "recipientName": return destination.recipientName;
    case "recipientAddress": return `${destination.address1} ${destination.address2 || ""}`.trim();
    case "city": return destination.city;
    case "town": return destination.district || destination.city;
    // Estos campos requieren información fiscal o de identidad que Nexora no
    // solicita en un checkout estándar. El método se descarta de forma segura.
    case "dutyNo":
    case "iossNumber":
    case "recipientId": return "";
    default: return "";
  }
}

function strongRuleFailures(item: CjFreightItem, destination: ShippingDestinationInput) {
  const rules = [...(item.ruleTips || []), ...(item.allRuleTips || [])];
  return rules.flatMap((rule) => {
    if (String(rule.interceptType) !== "0") return [];
    const type = text(rule.type, 80);
    const value = inputForStrongRule(destination, type);
    let valid = Boolean(value);
    const expression = text(rule.expression, 240);
    if (valid && expression) {
      try {
        valid = new RegExp(expression).test(value);
      } catch {
        // Una regla malformada del proveedor no se ignora: no ofrecemos el
        // método hasta que CJ devuelva una condición utilizable.
        valid = false;
      }
    }
    if (valid) return [];
    return [text(rule.msgEn, 240) || `CJ requiere un dato válido de entrega (${type || "requisito logístico"}).`];
  });
}

function parseOptions(payload: CjFreightResponse, sourceCountryCode: string, exchangeRate: number, destination: ShippingDestinationInput) {
  const blockedReasons = new Set<string>();
  const options: CjShippingQuoteOption[] = (payload.data || []).flatMap((item, index) => {
    if (text(item.error) || text(item.errorEn)) return [];
    const strongFailures = strongRuleFailures(item, destination);
    if (strongFailures.length) {
      strongFailures.forEach((reason) => blockedReasons.add(reason));
      return [];
    }
    const amountUsd = quoteAmount(item);
    const method = text(item.option?.enName) || text(item.channel?.enName);
    if (amountUsd === undefined || !method) return [];
    const id = text(item.optionId) || text(item.option?.id) || text(item.channelId) || text(item.channel?.id) || `${method}-${index}`;
    return [{
      id,
      method,
      carrier: text(item.channel?.enName) || null,
      estimatedDelivery: text(item.arrivalTime) || text(item.option?.arrivalTime) || null,
      amountUsd: Math.round(amountUsd * 100) / 100,
      amountCop: usdToCop(amountUsd, exchangeRate),
      taxesUsd: optionalMoney(item.taxesFee),
      clearanceUsd: optionalMoney(item.clearanceOperationFee),
      tariffUsd: optionalMoney(item.tariff),
      remoteFeeUsd: optionalMoney(item.remoteFee),
      remoteFeeCop: optionalMoney(item.remoteFee) === null ? null : usdToCop(optionalMoney(item.remoteFee) || 0, exchangeRate),
      sourceCountryCode: text(item.srcArea?.shortCode)?.toUpperCase() || sourceCountryCode,
      recommended: Array.isArray(item.recommendLogisticsTypeList) && item.recommendLogisticsTypeList.some((value) => [1, 2].includes(Number(value))),
      recommendation: "none" as const,
      notices: noticesFrom(item),
    }];
  }).sort((left, right) => left.amountCop - right.amountCop || left.method.localeCompare(right.method));

  if (!options.length) {
    const detail = [...blockedReasons].slice(0, 2).join(" ");
    throw new CjShippingQuoteError(detail
      ? `CJ requiere corregir datos de entrega antes de ofrecer un método: ${detail}`
      : "CJ no encontró un método de envío disponible para esa variante y destino.");
  }
  options[0] = { ...options[0], recommendation: "cheapest" };
  const fastestIndex = options.reduce((best, option, index) => {
    const currentDays = Number.parseInt(option.estimatedDelivery || "", 10);
    const bestDays = Number.parseInt(options[best].estimatedDelivery || "", 10);
    return Number.isFinite(currentDays) && (!Number.isFinite(bestDays) || currentDays < bestDays) ? index : best;
  }, 0);
  if (fastestIndex !== 0) options[fastestIndex] = { ...options[fastestIndex], recommendation: "fastest" };
  return options;
}

export async function quoteCjShipping({ product, variantSku, quantity = 1, destination, client = createCjShippingClient() }: {
  product: Product;
  variantSku?: string;
  quantity?: number;
  destination: ShippingDestinationInput;
  client?: CjClient;
}): Promise<ResolvedCjShippingQuote> {
  if (!getCjCredentialConfiguration().configured) {
    throw new CjShippingConfigurationError("La cotización de envío de CJ aún no está configurada. Intenta nuevamente cuando Nexora confirme la conexión del proveedor.");
  }
  const normalizedDestination = normalizeCjShippingDestination(destination);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    throw new CjShippingQuoteError("La cantidad por producto debe estar entre 1 y 10 unidades.");
  }
  const catalogVariant = selectedVariant(product, variantSku);
  const key = cacheKey(product, catalogVariant.sku, quantity, normalizedDestination);
  const cached = quoteCache.get(key);
  if (cached && cached.expiresAtMs > Date.now()) return cached.quote;

  // La reserva se revisa después de autenticar: antes de esa respuesta aún no
  // existe telemetría de puntos y una comprobación local sería ilusoria.
  await client.authenticateAndAssertPoints(30);
  const { variantId, variant } = await resolveVariantFromCj(product, catalogVariant, client);
  const sourceInventory = sourceInventoryFrom(variant);
  const originCountryCode = sourceInventory.countryCode;
  if (sourceInventory.verifiedStock > 0 && sourceInventory.verifiedStock < quantity) {
    throw new CjShippingQuoteError(`CJ solo confirmó ${sourceInventory.verifiedStock} unidades disponibles de esta variante.`);
  }
  const dimensions = dimensionsFrom(variant, catalogVariant);
  const weight = weightFrom(product, variant, catalogVariant);
  const properties = [...new Set(product.shipping.logisticsProperties.map((property) => property.trim()).filter(Boolean))];
  if (!properties.length) throw new CjShippingQuoteError("CJ no reportó las propiedades logísticas de este producto.");
  const supplierCostUsd = positive(variant.variantSellPrice) || catalogVariant.supplierCostUsd || product.supplier.costUsd;
  const exchangeRate = getUsdToCopRate();
  const freightPayload = {
    reqDTOS: [{
      srcAreaCode: originCountryCode,
      destAreaCode: normalizedDestination.countryCode,
      zip: normalizedDestination.postalCode,
      houseNumber: normalizedDestination.houseNumber,
      recipientAddress: normalizedDestination.address1,
      recipientAddress1: normalizedDestination.address1,
      recipientAddress2: normalizedDestination.address2,
      town: normalizedDestination.district,
      county: normalizedDestination.district,
      city: normalizedDestination.city,
      province: normalizedDestination.region,
      recipientName: normalizedDestination.recipientName,
      phone: normalizedDestination.phone,
      email: normalizedDestination.email,
      length: dimensions.lengthCm,
      width: dimensions.widthCm,
      height: dimensions.heightCm,
      volume: Number((dimensions.volumeCm3 * quantity).toFixed(3)),
      weight: weight.unitWeightGrams * quantity,
      wrapWeight: weight.wrapWeightGrams * quantity,
      totalGoodsAmount: supplierCostUsd * quantity,
      productProp: properties,
      skuList: [catalogVariant.sku],
      freightTrialSkuList: [{
        vid: variantId,
        sku: catalogVariant.sku,
        skuQuantity: quantity,
        skuWeight: weight.unitWeightGrams,
        skuVolume: Number(dimensions.volumeCm3.toFixed(3)),
        productPropList: properties,
        productTypeList: ["0"],
      }],
    }],
  };
  let response: CjFreightResponse;
  try {
    client.assertPointsAvailable(10);
    response = await client.postJson<CjFreightResponse>(freightTipEndpoint, freightPayload);
  } catch (error) {
    if (error instanceof CjQuotaError) throw error;
    if (error instanceof CjRequestError) throw new CjShippingQuoteError("CJ no pudo cotizar el envío en este momento. No se cobrará ningún envío hasta que puedas elegir una opción válida.");
    throw error;
  }
  const quotedAt = new Date();
  const expiresAt = new Date(quotedAt.getTime() + quoteTtlMs());
  const quote: ResolvedCjShippingQuote = {
    productSlug: product.slug,
    variantSku: catalogVariant.sku,
    quantity,
    supplierCostUsd,
    exchangeRateCopPerUsd: exchangeRate,
    inventoryVerifiedAt: quotedAt.toISOString(),
    verifiedStock: sourceInventory.verifiedStock,
    quotedAt: quotedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    options: parseOptions(response, originCountryCode, exchangeRate, normalizedDestination),
  };
  quoteCache.set(key, { expiresAtMs: expiresAt.getTime(), quote });
  if (quoteCache.size > 200) {
    for (const [cacheKeyValue, entry] of quoteCache) if (entry.expiresAtMs <= Date.now()) quoteCache.delete(cacheKeyValue);
  }
  return quote;
}
