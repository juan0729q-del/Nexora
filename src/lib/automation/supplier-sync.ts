import "server-only";

import { getCatalog } from "@/lib/catalog-store";
import type { Product } from "@/lib/products";
import { CjQuotaError, createCjClient, getCjCredentialConfiguration, type CjClient } from "./cj-client";
import { evaluateSupplierCost } from "./pricing";

const cjOrigin = "https://developers.cjdropshipping.com";
const stockBySkuEndpoint = `${cjOrigin}/api2.0/v1/product/stock/queryBySku`;

type SupplierItem = {
  sku?: string;
  productSku?: string;
  stock?: number | string;
  quantity?: number | string;
  inventory?: number | string;
  warehouseInventoryNum?: number | string;
  totalInventoryNum?: number | string;
  cjInventoryNum?: number | string;
  factoryInventoryNum?: number | string;
  totalInventory?: number | string;
  cjInventory?: number | string;
  factoryInventory?: number | string;
  cost?: number | string;
  baseCost?: number | string;
  sellingPrice?: number | string;
  sellPrice?: number | string;
  price?: number | string;
};

type SupplierResponse = {
  data?: SupplierItem[] | { inventories?: SupplierItem[]; content?: SupplierItem[]; list?: SupplierItem[]; records?: SupplierItem[] };
  items?: SupplierItem[];
  products?: SupplierItem[];
};

export type SupplierStockVerification = {
  status: "not-required" | "snapshot" | "available" | "unavailable" | "unverified" | "quota-exhausted";
  stock: number;
  reason?: string;
};

function extractSupplierItems(payload: unknown): SupplierItem[] {
  if (!payload || typeof payload !== "object") return [];
  const response = payload as SupplierResponse;
  if (Array.isArray(response.data)) return response.data;
  if (response.data && typeof response.data === "object") {
    const data = response.data;
    return data.inventories || data.content || data.list || data.records || [];
  }
  return response.items || response.products || [];
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function stockPauseThreshold() {
  return 2;
}

function checkoutVerificationThreshold() {
  const configured = Number(process.env.CHECKOUT_STOCK_VERIFICATION_THRESHOLD || 4);
  return Number.isInteger(configured) && configured >= 0 ? configured : 4;
}

function checkoutSafetyBuffer() {
  const configured = Number(process.env.CHECKOUT_STOCK_SAFETY_BUFFER || 1);
  return Number.isInteger(configured) && configured >= 0 ? configured : 1;
}

function stockUrlFor(sku: string) {
  const url = new URL(stockBySkuEndpoint);
  url.searchParams.set("sku", sku);
  return url.toString();
}

function supplementalCostUrlFor(sku: string) {
  const template = process.env.CJ_DROPSHIPPING_PRODUCT_SYNC_URL?.trim();
  if (!template) return undefined;
  const url = new URL(template.replace("{sku}", encodeURIComponent(sku)));
  if (!template.includes("{sku}")) url.searchParams.set("sku", sku);
  return url.toString();
}

function usdToCop(costUsd: number) {
  const exchangeRate = Number(process.env.USD_TO_COP_RATE || 4200);
  return costUsd * (Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 4200);
}

/** Consulta el endpoint oficial CJ de inventario por SKU y suma sus bodegas. */
export async function getOfficialCjStock(sku: string, client: CjClient = createCjClient()) {
  client.assertPointsAvailable(10);
  const payload = await client.getJson<SupplierResponse>(stockUrlFor(sku));
  const inventories = extractSupplierItems(payload);
  if (!inventories.length) return 0;

  let knownEntries = 0;
  const total = inventories.reduce((sum, item) => {
    const stock = number(
      item.totalInventoryNum
      ?? item.totalInventory
      ?? item.warehouseInventoryNum
      ?? item.stock
      ?? item.quantity
      ?? item.inventory,
    );
    if (stock === undefined) return sum;
    knownEntries += 1;
    return sum + Math.max(0, Math.floor(stock));
  }, 0);
  return knownEntries ? total : undefined;
}

async function getSupplementalCostUsd(sku: string, client: CjClient) {
  const endpoint = supplementalCostUrlFor(sku);
  if (!endpoint) return undefined;
  const payload = await client.getJson<SupplierResponse>(endpoint);
  const item = extractSupplierItems(payload).find((candidate) => !candidate.sku || candidate.sku === sku || candidate.productSku === sku);
  return item ? number(item.cost ?? item.baseCost ?? item.sellingPrice ?? item.sellPrice ?? item.price) : undefined;
}

/**
 * Antes de cobrar una unidad crítica se consulta CJ desde el servidor. Las
 * consultas públicas nunca reciben la API key y un fallo conservador evita
 * vender una unidad que no se pudo confirmar.
 */
export async function verifyCheckoutInventory(
  product: Pick<Product, "sku" | "stock">,
  { variantSku, quantity = 1, forceLiveCheck = false }: { variantSku?: string; quantity?: number; forceLiveCheck?: boolean } = {},
): Promise<SupplierStockVerification> {
  const sku = variantSku?.trim() || product.sku;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return { status: "unavailable", stock: product.stock, reason: "La cantidad solicitada no es válida." };
  }
  // Una variante puede tener inventario distinto al producto principal. Si el
  // cliente acaba de cotizar una variante específica, se valida ese SKU antes
  // del cobro incluso cuando el agregado del producto parezca saludable.
  if (!forceLiveCheck && product.stock >= quantity + checkoutSafetyBuffer() && product.stock > checkoutVerificationThreshold()) return { status: "not-required", stock: product.stock };
  if (!getCjCredentialConfiguration().configured) return { status: "snapshot", stock: product.stock };

  try {
    const stock = await getOfficialCjStock(sku);
    if (stock === undefined) return { status: "unverified", stock: product.stock, reason: "CJ no devolvió un inventario interpretable para este SKU." };
    if (stock < quantity + checkoutSafetyBuffer()) return { status: "unavailable", stock, reason: `CJ reportó inventario insuficiente para confirmar ${quantity} unidad${quantity === 1 ? "" : "es"}.` };
    return { status: "available", stock };
  } catch (error) {
    if (error instanceof CjQuotaError) return { status: "quota-exhausted", stock: product.stock, reason: "CJ no tiene cuota disponible para verificar este SKU ahora." };
    return { status: "unverified", stock: product.stock, reason: "No fue posible verificar el inventario de CJ antes del cobro." };
  }
}

/**
 * Propone cambios de stock y costos para su posterior commit. Vercel no tiene
 * un disco durable; el workflow de GitHub es quien materializa catalog.json.
 */
export async function syncSupplierCatalog(client: CjClient = createCjClient()) {
  if (!getCjCredentialConfiguration().configured) {
    return {
      status: "skipped" as const,
      reason: "Configura CJ_DROPSHIPPING_API_KEY antes de sincronizar inventario real.",
      updates: [],
      telemetry: client.getTelemetry(),
    };
  }

  const catalog = await getCatalog();
  const updates = [] as Array<{
    sku: string;
    stock: number;
    providerCostUsd?: number;
    providerCostCop?: number;
    action: "keep_active" | "pause_product";
    marginPercent?: number;
    alert?: string;
  }>;

  for (const product of catalog) {
    const stock = await getOfficialCjStock(product.sku, client);
    if (stock === undefined) continue;

    const providerCostUsd = await getSupplementalCostUsd(product.sku, client);
    if (providerCostUsd === undefined || providerCostUsd <= 0) {
      updates.push({
        sku: product.sku,
        stock,
        action: stock <= stockPauseThreshold() ? "pause_product" : "keep_active",
        alert: stock <= stockPauseThreshold() ? "Inventario crítico confirmado por CJ." : undefined,
      });
      continue;
    }

    const decision = evaluateSupplierCost({
      salePrice: product.price,
      previousCost: usdToCop(product.supplier.costUsd),
      nextCost: usdToCop(providerCostUsd),
    });
    updates.push({
      sku: product.sku,
      stock,
      providerCostUsd,
      providerCostCop: Math.round(usdToCop(providerCostUsd)),
      action: stock <= stockPauseThreshold() ? "pause_product" : decision.action,
      marginPercent: decision.marginPercent,
      alert: stock <= stockPauseThreshold() ? "Inventario crítico confirmado por CJ." : decision.reason,
    });
  }

  return {
    status: "planned" as const,
    importedAt: new Date().toISOString(),
    inspected: catalog.length,
    updates,
    telemetry: client.getTelemetry(),
    persistence: "Los cambios se validan y versionan mediante el workflow de GitHub; nunca se escriben en el filesystem efímero de Vercel.",
  };
}
