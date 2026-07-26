import { getCatalog } from "@/lib/catalog-store";
import { getCatalogDecision, niches, type ProductNiche } from "@/lib/products";

export type NicheCatalogDecision = {
  niche: ProductNiche;
  featured: string[];
  monitoring: string[];
  paused: string[];
  needsReplacement: boolean;
};

/**
 * Lee señales persistentes. Los ceros de métricas recién importadas se tratan
 * como datos aún no disponibles, no como rendimiento bajo.
 */
export async function optimizeCatalog() {
  const catalog = await getCatalog();
  const decisions = catalog.map((product) => ({
    sku: product.sku,
    slug: product.slug,
    niche: product.niche,
    action: getCatalogDecision(product),
    metrics: product.performance,
  }));
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
