import type { AutonomyReadiness, IntelligenceEventSummary } from "./types";

export const shadowAutonomyPolicy = Object.freeze({
  minimumObservationDays: 90,
  minimumApprovedOrders: 100,
  minimumTrackedSessions: 1_000,
  minimumProductViews: 2_500,
  minimumEventCoveragePercent: 95,
  minimumPaymentReconciliationPercent: 99,
  minimumDeliverySlaPercent: 90,
  minimumValidatedRecommendationPrecisionPercent: 80,
  minimumDecisionConfidencePercent: 95,
  minimumCatalogRotationCoveragePercent: 60,
  requiredConsecutiveDays: 30,
});

function daysBetween(first: string | null, last: string | null) {
  if (!first || !last) return 0;
  const difference = Date.parse(last) - Date.parse(first);
  return Number.isFinite(difference) && difference > 0 ? Math.floor(difference / 86_400_000) : 0;
}

export function evaluateAutonomyReadiness({
  events,
  approvedOrders,
  paymentReconciliationPercent,
  deliverySlaPercent,
  recommendationPrecisionPercent,
  averageDecisionConfidencePercent,
  catalogRotationCoveragePercent,
}: {
  events: IntelligenceEventSummary;
  approvedOrders: number;
  paymentReconciliationPercent: number;
  deliverySlaPercent: number;
  recommendationPrecisionPercent: number;
  averageDecisionConfidencePercent: number;
  catalogRotationCoveragePercent: number;
}): AutonomyReadiness {
  const observedDays = daysBetween(events.firstEventAt, events.lastEventAt);
  const definitions = [
    ["observation", "Días de observación real", observedDays, shadowAutonomyPolicy.minimumObservationDays, "días", "Evita decidir con estacionalidad o muestras de pocos días."],
    ["orders", "Pedidos Wompi aprobados", approvedOrders, shadowAutonomyPolicy.minimumApprovedOrders, "pedidos", "La conversión necesita compras reales conciliadas."],
    ["sessions", "Sesiones anónimas observadas", events.trackedSessions, shadowAutonomyPolicy.minimumTrackedSessions, "sesiones", "Mide variedad suficiente de comportamiento sin identificar personas."],
    ["views", "Vistas de producto", events.productViews, shadowAutonomyPolicy.minimumProductViews, "vistas", "Permite comparar exposición y compra por producto."],
    ["coverage", "Cobertura del embudo", events.eventCoveragePercent, shadowAutonomyPolicy.minimumEventCoveragePercent, "%", "Los pasos críticos deben llegar completos y en orden."],
    ["reconciliation", "Pagos conciliados", paymentReconciliationPercent, shadowAutonomyPolicy.minimumPaymentReconciliationPercent, "%", "Ninguna decisión aprende de montos no conciliados."],
    ["delivery", "Entregas dentro del SLA", deliverySlaPercent, shadowAutonomyPolicy.minimumDeliverySlaPercent, "%", "Vender más no es una mejora si la promesa logística falla."],
    ["precision", "Recomendaciones validadas acertadas", recommendationPrecisionPercent, shadowAutonomyPolicy.minimumValidatedRecommendationPrecisionPercent, "%", "Se compara cada propuesta previa con su resultado real."],
    ["confidence", "Confianza media de decisiones validadas", averageDecisionConfidencePercent, shadowAutonomyPolicy.minimumDecisionConfidencePercent, "%", "La confianza se mide después del resultado, no por el tono de la propuesta."],
    ["rotation", "Cobertura de rotación del catálogo", catalogRotationCoveragePercent, shadowAutonomyPolicy.minimumCatalogRotationCoveragePercent, "%", "Evita optimizar sólo uno o dos SKU y abandonar el resto del inventario."],
  ] as const;
  const gates = definitions.map(([id, label, current, target, unit, reason]) => ({ id, label, current, target, unit, reason, met: current >= target }));
  const scorePercent = Math.round(gates.reduce((sum, gate) => sum + Math.min(1, gate.current / Math.max(1, gate.target)), 0) / gates.length * 100);
  return {
    eligible: gates.every((gate) => gate.met),
    scorePercent,
    requiredConsecutiveDays: shadowAutonomyPolicy.requiredConsecutiveDays,
    gates,
    permanentlyHumanControlled: [
      "Reembolsos y cancelaciones financieras",
      "Cambios de precio superiores al 10%",
      "Publicación de un producto nuevo sin ficha CJ completa",
      "Pedidos con diferencias de monto o identidad",
      "Mensajes sensibles a clientes y decisiones legales",
    ],
  };
}
