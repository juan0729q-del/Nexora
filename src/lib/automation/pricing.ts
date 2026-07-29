import { estimateContribution, getFulfillmentReserveCop, getTargetContributionMargin } from "@/lib/commerce-finance";

export type PriceDecision = { action: "keep_active" | "pause_product"; marginPercent: number; reason?: string };

/**
 * Se evalúa contribución después de la comisión Wompi, no sólo margen bruto.
 * El flete/CAC no se inventan: se pueden incorporar por reserva de entorno.
 */
export function evaluateSupplierCost({ salePrice, previousCost, nextCost, minimumMarginPercent = getTargetContributionMargin() * 100, anomalyThresholdPercent = 20 }: { salePrice: number; previousCost: number; nextCost: number; minimumMarginPercent?: number; anomalyThresholdPercent?: number }): PriceDecision {
  if (salePrice <= 0 || previousCost <= 0 || nextCost <= 0) {
    return { action: "pause_product", marginPercent: 0, reason: "Costo o precio inválido; se requiere revisión antes de vender." };
  }
  const costChange = ((nextCost - previousCost) / previousCost) * 100;
  const estimate = estimateContribution({
    salePriceCop: salePrice,
    supplierCostCop: nextCost,
    fulfillmentReserveCop: getFulfillmentReserveCop(),
  });
  const marginPercent = estimate.contributionMarginPercent;
  if (marginPercent < minimumMarginPercent || costChange >= anomalyThresholdPercent) return { action: "pause_product", marginPercent, reason: `Costo ${costChange.toFixed(1)}% mayor; margen proyectado ${marginPercent.toFixed(1)}%.` };
  return { action: "keep_active", marginPercent };
}
