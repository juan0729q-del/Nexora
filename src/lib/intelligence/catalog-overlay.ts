import type { Product } from "@/lib/products";
import type { IntelligenceProposal } from "./types";

/**
 * Aplica sólo decisiones humanas ya ejecutadas. Es una capa reversible: no
 * altera el JSON oficial de CJ ni inventa productos, costos o inventario.
 */
export function applyExecutedCatalogDecisions(products: Product[], proposals: IntelligenceProposal[]) {
  const latest = new Map<string, IntelligenceProposal>();
  for (const proposal of proposals.filter((proposal) => proposal.status === "executed" && proposal.targetSku)) {
    const key = proposal.targetSku!.toUpperCase();
    const previous = latest.get(key);
    if (!previous || (Date.parse(proposal.decidedAt || proposal.createdAt) || 0) > (Date.parse(previous.decidedAt || previous.createdAt) || 0)) latest.set(key, proposal);
  }
  const executed = [...latest.values()];
  const pausedSkus = new Set(executed
    .filter((proposal) => proposal.action === "pause_product" && proposal.targetSku)
    .map((proposal) => proposal.targetSku!.toUpperCase()));
  const promotedSkus = new Set(executed
    .filter((proposal) => proposal.action === "promote_product" && proposal.targetSku)
    .map((proposal) => proposal.targetSku!.toUpperCase()));

  return products
    .map((product) => pausedSkus.has(product.sku.toUpperCase()) ? { ...product, active: false } : latest.get(product.sku.toUpperCase())?.action === "monitor_product" ? { ...product, operationalMonitoring: true } : product)
    .sort((left, right) => Number(promotedSkus.has(right.sku.toUpperCase())) - Number(promotedSkus.has(left.sku.toUpperCase())));
}
