import type { Product } from "@/lib/products";

export type CommercePricingPolicy = {
  targetContributionMargin: number;
  fulfillmentReserveCop: number;
  wompiPercentageRate: number;
  wompiFixedFeeCop: number;
  wompiVatRate: number;
  paypalPercentageRate: number;
  paypalFixedFeeUsd: number;
  roundingCop: number;
};

export const defaultCommercePricingPolicy: CommercePricingPolicy = {
  targetContributionMargin: 0.5,
  fulfillmentReserveCop: 0,
  wompiPercentageRate: 0.0265,
  wompiFixedFeeCop: 700,
  wompiVatRate: 0.19,
  // Tarifa PayPal Colombia vigente al 2026-05-28 para transacciones
  // comerciales internacionales: 5,40 % + USD 0,30.
  paypalPercentageRate: 0.054,
  paypalFixedFeeUsd: 0.3,
  roundingCop: 100,
};

function configuredNumber(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

/**
 * Política comercial única. Sólo contiene parámetros públicos de cálculo; no
 * lee ni devuelve credenciales. Colombia y Estados Unidos parten del mismo
 * precio canónico en COP y USD se obtiene con la tasa versionada vigente.
 */
export function getCommercePricingPolicy(): CommercePricingPolicy {
  return {
    targetContributionMargin: configuredNumber(process.env.CATALOG_TARGET_CONTRIBUTION_MARGIN, defaultCommercePricingPolicy.targetContributionMargin, 0.01, 0.8),
    fulfillmentReserveCop: configuredNumber(process.env.CATALOG_LANDED_COST_RESERVE_COP, defaultCommercePricingPolicy.fulfillmentReserveCop, 0, 10_000_000),
    wompiPercentageRate: configuredNumber(process.env.WOMPI_FEE_PERCENTAGE, defaultCommercePricingPolicy.wompiPercentageRate, 0, 0.25),
    wompiFixedFeeCop: configuredNumber(process.env.WOMPI_FEE_FIXED_COP, defaultCommercePricingPolicy.wompiFixedFeeCop, 0, 1_000_000),
    wompiVatRate: configuredNumber(process.env.WOMPI_FEE_VAT_RATE, defaultCommercePricingPolicy.wompiVatRate, 0, 1),
    paypalPercentageRate: configuredNumber(process.env.PAYPAL_FEE_PERCENTAGE, defaultCommercePricingPolicy.paypalPercentageRate, 0, 0.25),
    paypalFixedFeeUsd: configuredNumber(process.env.PAYPAL_FEE_FIXED_USD, defaultCommercePricingPolicy.paypalFixedFeeUsd, 0, 100),
    roundingCop: 100,
  };
}

export function supplierCostUsdForVariant(product: Pick<Product, "supplier" | "variants">, variantSku?: string) {
  const normalized = variantSku?.trim().toUpperCase();
  const variant = normalized
    ? product.variants.find((entry) => entry.sku.trim().toUpperCase() === normalized)
    : undefined;
  const cost = variant?.supplierCostUsd ?? product.supplier.costUsd;
  if (!Number.isFinite(cost) || cost <= 0) throw new Error("El estilo no tiene un costo CJ válido.");
  return cost;
}

export function recommendedSalePriceCopFromSupplierCost({
  supplierCostUsd,
  copPerUsd,
  policy = getCommercePricingPolicy(),
}: {
  supplierCostUsd: number;
  copPerUsd: number;
  policy?: CommercePricingPolicy;
}) {
  if (!Number.isFinite(supplierCostUsd) || supplierCostUsd <= 0 || !Number.isFinite(copPerUsd) || copPerUsd < 1_000) {
    throw new Error("El costo CJ o la tasa COP/USD no permite calcular un precio verificable.");
  }
  // Un precio canónico sirve para ambos mercados. Se usa la estructura más
  // costosa entre Wompi y PayPal para que la equivalencia COP/USD no reduzca
  // el margen objetivo dependiendo del procesador elegido.
  const variableFee = Math.max(
    policy.wompiPercentageRate * (1 + policy.wompiVatRate),
    policy.paypalPercentageRate,
  );
  const fixedFee = Math.max(
    policy.wompiFixedFeeCop * (1 + policy.wompiVatRate),
    policy.paypalFixedFeeUsd * copPerUsd,
  );
  const denominator = 1 - variableFee - policy.targetContributionMargin;
  if (denominator <= 0) throw new Error("La política de margen no permite calcular un precio sostenible.");
  const supplierCostCop = supplierCostUsd * copPerUsd;
  const raw = (supplierCostCop + policy.fulfillmentReserveCop + fixedFee) / denominator;
  const rounding = Math.max(1, Math.floor(policy.roundingCop));
  return Math.ceil(raw / rounding) * rounding;
}

export function salePriceCopForVariant(product: Pick<Product, "supplier" | "variants">, variantSku: string | undefined, copPerUsd: number) {
  return recommendedSalePriceCopFromSupplierCost({
    supplierCostUsd: supplierCostUsdForVariant(product, variantSku),
    copPerUsd,
  });
}

export function startingSalePriceCop(product: Pick<Product, "supplier" | "variants">, copPerUsd: number) {
  const costs = product.variants.length
    ? product.variants.map((variant) => supplierCostUsdForVariant(product, variant.sku))
    : [product.supplier.costUsd];
  return Math.min(...costs.map((supplierCostUsd) => recommendedSalePriceCopFromSupplierCost({ supplierCostUsd, copPerUsd })));
}

/**
 * Estimación comparable a la de Wompi para el panel comercial de EE. UU.
 * El flete no se mezcla con el producto: CJ lo cotiza y se cobra como una
 * línea separada. La reserva operativa sí se convierte con la misma TRM
 * versionada usada por la orden.
 */
export function estimatePayPalContributionUsd({
  salePriceUsd,
  supplierCostUsd,
  copPerUsd,
  policy = getCommercePricingPolicy(),
}: {
  salePriceUsd: number;
  supplierCostUsd: number;
  copPerUsd: number;
  policy?: CommercePricingPolicy;
}) {
  if (!Number.isFinite(salePriceUsd) || salePriceUsd <= 0
    || !Number.isFinite(supplierCostUsd) || supplierCostUsd <= 0
    || !Number.isFinite(copPerUsd) || copPerUsd < 1_000) {
    throw new Error("El precio USD, costo CJ o tasa COP/USD no permite calcular el margen PayPal.");
  }
  const paypalFeeUsd = (salePriceUsd * policy.paypalPercentageRate) + policy.paypalFixedFeeUsd;
  const fulfillmentReserveUsd = policy.fulfillmentReserveCop / copPerUsd;
  const contributionUsd = salePriceUsd - supplierCostUsd - fulfillmentReserveUsd - paypalFeeUsd;
  return {
    paypalFeeUsd,
    fulfillmentReserveUsd,
    contributionUsd,
    contributionMarginPercent: (contributionUsd / salePriceUsd) * 100,
  };
}
