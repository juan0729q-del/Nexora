import { getCatalog, getCatalogDecision, niches, type ProductNiche } from "@/lib/products";

export type NicheCatalogDecision = {
  niche: ProductNiche;
  featured: string[];
  monitoring: string[];
  paused: string[];
  needsReplacement: boolean;
};

/**
 * Núcleo de decisión para un agente de IA/BI. La entrada puede sustituirse por
 * ventas y conversiones reales: la salida conserva siempre el nicho de origen
 * para que un retiro de joyería solo se reemplace por joyería, y así sucesivamente.
 */
export function optimizeCatalog() {
  const decisions = getCatalog().map((product) => ({ sku: product.sku, slug: product.slug, niche: product.niche, action: getCatalogDecision(product), metrics: product.performance }));
  const byNiche = (Object.keys(niches) as ProductNiche[]).map((niche): NicheCatalogDecision => {
    const current = decisions.filter((decision) => decision.niche === niche);
    const paused = current.filter((decision) => decision.action === "pause").map((decision) => decision.slug);
    return {
      niche,
      featured: current.filter((decision) => decision.action === "feature").map((decision) => decision.slug),
      monitoring: current.filter((decision) => decision.action === "monitor").map((decision) => decision.slug),
      paused,
      needsReplacement: paused.length > 0,
    };
  });
  return {
    evaluatedAt: new Date().toISOString(),
    featured: decisions.filter((decision) => decision.action === "feature").map((decision) => decision.slug),
    monitoring: decisions.filter((decision) => decision.action === "monitor").map((decision) => decision.slug),
    paused: decisions.filter((decision) => decision.action === "pause").map((decision) => decision.slug),
    byNiche,
    decisions,
  };
}
