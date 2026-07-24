import { getCatalog, getCatalogDecision } from "@/lib/products";

/**
 * Hook para un agente de IA/BI: sustituye las métricas simuladas con ventas,
 * conversiones y devoluciones reales antes de persistir la decisión en tu BD.
 */
export function optimizeCatalog() {
  const decisions = getCatalog().map((product) => ({
    sku: product.sku,
    slug: product.slug,
    action: getCatalogDecision(product),
    metrics: product.performance,
  }));
  return {
    evaluatedAt: new Date().toISOString(),
    featured: decisions.filter((decision) => decision.action === "feature").map((decision) => decision.slug),
    monitoring: decisions.filter((decision) => decision.action === "monitor").map((decision) => decision.slug),
    paused: decisions.filter((decision) => decision.action === "pause").map((decision) => decision.slug),
    decisions,
  };
}
