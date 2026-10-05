import "server-only";

import { calculateRocketfyShipping, RocketfyRequestError } from "@/lib/automation/rocketfy-client";
import type { Product } from "@/lib/products";
import { rocketfyCommerceEnabled } from "@/lib/suppliers/rocketfy-config";
import type { CjShippingQuoteOption, ShippingDestinationInput } from "./types";

export class RocketfyShippingQuoteError extends Error {}

function requiredEnv(name: "ROCKETFY_ORIGIN_CITY" | "ROCKETFY_ORIGIN_DEPARTMENT" | "ROCKETFY_ORIGIN_ADDRESS") {
  const value = process.env[name]?.trim();
  if (!value) throw new RocketfyShippingQuoteError(`Falta ${name}; el proveedor local permanece fuera del checkout.`);
  return value;
}

function positive(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export async function quoteRocketfyShipping({ product, variantSku, quantity, destination, productSubtotalCop }: {
  product: Product; variantSku?: string; quantity: number; destination: ShippingDestinationInput; productSubtotalCop: number;
}) {
  if (!rocketfyCommerceEnabled()) throw new RocketfyShippingQuoteError("El proveedor local está preparado, pero seguirá fuera de venta hasta validar su contrato y credenciales de producción.");
  if (destination.countryCode !== "CO") throw new RocketfyShippingQuoteError("Rocketfy solo puede cotizar esta integración dentro de Colombia.");
  const verifiedAt = Date.parse(product.stockVerifiedAt || "");
  const maxAgeSeconds = Math.max(60, Math.min(86400, Number(process.env.ROCKETFY_INVENTORY_MAX_AGE_SECONDS || 900)));
  if (!Number.isFinite(verifiedAt) || Date.now() - verifiedAt < 0 || Date.now() - verifiedAt > maxAgeSeconds * 1000) {
    throw new RocketfyShippingQuoteError("El inventario local no tiene una verificación reciente; el checkout se detuvo antes del cobro.");
  }
  const variant = product.variants.find((entry) => entry.sku.toUpperCase() === (variantSku || product.variants[0]?.sku || "").toUpperCase());
  if (!variant) throw new RocketfyShippingQuoteError("Selecciona una variante local válida antes de cotizar.");
  const weightGrams = positive(variant.weightGrams) || positive(product.shipping.packingWeightGrams) || positive(product.shipping.productWeightGrams);
  const lengthMm = positive(variant.dimensions?.lengthMm);
  const widthMm = positive(variant.dimensions?.widthMm);
  const heightMm = positive(variant.dimensions?.heightMm);
  if (!weightGrams || !lengthMm || !widthMm || !heightMm) throw new RocketfyShippingQuoteError("La ficha local no incluye peso y dimensiones verificadas; no se puede calcular ni cobrar el flete.");
  try {
    const payload = await calculateRocketfyShipping({
      total: productSubtotalCop,
      lines: {
        from: { city: requiredEnv("ROCKETFY_ORIGIN_CITY"), departament: requiredEnv("ROCKETFY_ORIGIN_DEPARTMENT"), address: requiredEnv("ROCKETFY_ORIGIN_ADDRESS") },
        to: { city: destination.city, departament: destination.region, address: [destination.address1, destination.address2].filter(Boolean).join(", ") },
      },
      weight: Math.max(0.001, (weightGrams * quantity) / 1000),
      large: lengthMm / 10,
      width: widthMm / 10,
      height: heightMm / 10,
      cod: false,
    });
    const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : null;
    const couriers = Array.isArray(data?.courriers) ? data.courriers : [];
    const options: CjShippingQuoteOption[] = couriers.flatMap((raw) => {
      if (!raw || typeof raw !== "object") return [];
      const courier = raw as Record<string, unknown>;
      const amountCop = positive(courier.shipping_value);
      const key = typeof courier.key === "string" ? courier.key.trim() : "";
      const name = typeof courier.name === "string" ? courier.name.trim() : key;
      // La documentación sólo define `disabled` como indisponibilidad. El
      // ejemplo oficial trae `blocked_from_admin=true` en tarifas utilizables,
      // por lo que ese campo no se interpreta como un bloqueo comercial.
      if (!amountCop || !key || courier.disabled === true) return [];
      return [{
        id: `rocketfy:${key}:${amountCop}`,
        method: name,
        carrier: name || null,
        estimatedDelivery: typeof courier.shipping_time === "string" ? `${courier.shipping_time} día(s)` : null,
        amountUsd: 0,
        amountCop,
        taxesUsd: null, clearanceUsd: null, tariffUsd: null, remoteFeeUsd: null, remoteFeeCop: null,
        sourceCountryCode: "CO", recommended: courier.default === true, recommendation: "none", notices: [],
      } satisfies CjShippingQuoteOption];
    });
    if (!options.length) throw new RocketfyShippingQuoteError("Rocketfy no devolvió una transportadora habilitada para esta dirección.");
    const cheapest = options.reduce((best, option) => option.amountCop < best.amountCop ? option : best, options[0]);
    cheapest.recommended = true;
    cheapest.recommendation = "cheapest";
    return { variantSku: variant.sku, options };
  } catch (error) {
    if (error instanceof RocketfyShippingQuoteError) throw error;
    if (error instanceof RocketfyRequestError) throw new RocketfyShippingQuoteError(error.message);
    throw new RocketfyShippingQuoteError("Rocketfy no pudo cotizar un flete verificable.");
  }
}
