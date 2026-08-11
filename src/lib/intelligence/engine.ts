import "server-only";

import { createHash } from "crypto";
import { getCatalog } from "@/lib/catalog-store";
import { getSalesDashboardSnapshot } from "@/lib/sales-dashboard";
import { getCatalogDecision, isArtificialIntelligenceProduct, niches, type Product, type ProductNiche } from "@/lib/products";
import { getIntelligenceLedgerSnapshot, syncIntelligenceProposals } from "@/lib/sales-ledger";
import { evaluateAutonomyReadiness } from "./policy";
import type { IntelligenceEventSummary, IntelligenceProposal, MarketSignal } from "./types";

const emptyEvents: IntelligenceEventSummary = {
  firstEventAt: null, lastEventAt: null, trackedEvents: 0, trackedSessions: 0,
  productViews: 0, cartAdds: 0, shippingQuotes: 0, checkoutStarts: 0,
  checkoutCreated: 0, eventCoveragePercent: 0,
};

function proposalId(action: string, target: string, date: Date) {
  // Una misma señal conserva identidad durante la semana para no duplicar
  // propuestas en cada ciclo diario; después expira y puede reevaluarse.
  const period = String(Math.floor(date.getTime() / 604_800_000));
  return `nxr-ai-${createHash("sha256").update(`${period}:${action}:${target}`).digest("hex").slice(0, 18)}`;
}

function dates(now: Date) {
  return { createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString() };
}

function evidenceFor(product: Product) {
  return [
    { label: "Stock CJ versionado", value: `${product.stock} unidades`, source: "cj" as const },
    { label: "Ventas registradas 30 días", value: `${product.performance.salesLast30Days}`, source: "nexora" as const },
    { label: "Conversión registrada", value: `${product.performance.conversionRate}%`, source: "nexora" as const },
    { label: "Devolución registrada", value: `${product.performance.returnRate}%`, source: "nexora" as const },
  ];
}

function productProposal(product: Product, now: Date): IntelligenceProposal | null {
  const decision = getCatalogDecision(product);
  if (decision === "feature" && product.performance.salesLast30Days <= 0) return null;
  if (decision === "feature") {
    return {
      id: proposalId("promote_product", product.sku, now), ...dates(now), action: "promote_product", status: "proposed",
      targetSku: product.sku, targetSlug: product.slug, niche: product.niche,
      title: `Dar mayor visibilidad a ${product.name}`,
      summary: "La señal propia de ventas permite probar una exposición mayor sin cambiar precio, stock ni checkout.",
      rationale: ["Tiene ventas reales registradas y no activa una regla de pausa.", "La promoción se limita al orden visual de su nicho."],
      benefits: ["Acelerar rotación del inventario disponible.", "Medir si una mayor exposición produce más carritos y pagos aprobados."],
      risks: ["Puede desplazar temporalmente otro producto.", "Una venta histórica no garantiza demanda futura."],
      implications: "Al autorizar, Nexora podrá priorizar este artículo dentro de su propia sección. No cambia el precio ni inicia pedidos.",
      rollback: "Restaurar el orden por defecto del catálogo en una sola decisión.", confidencePercent: 78,
      evidence: evidenceFor(product), execution: "merchandising",
    };
  }
  const critical = decision === "pause";
  return {
    id: proposalId(critical ? "pause_product" : "monitor_product", product.sku, now), ...dates(now),
    action: critical ? "pause_product" : "monitor_product", status: "proposed", targetSku: product.sku,
    targetSlug: product.slug, niche: product.niche,
    title: critical ? `Mantener fuera de venta a ${product.name}` : `Vigilar inventario de ${product.name}`,
    summary: critical ? "La regla operativa detectó stock o rendimiento incompatible con una venta segura." : "El inventario se acerca al umbral de protección y merece seguimiento antes de escalar tráfico.",
    rationale: critical ? ["La protección determinista del catálogo ya impide vender este registro.", "La IA no sustituye la validación oficial de CJ."] : ["El stock está próximo al umbral crítico.", "Conviene evitar pauta hasta la siguiente sincronización verificada."],
    benefits: ["Evitar cobros de artículos sin disponibilidad suficiente.", "Proteger la promesa de entrega y la reputación de Nexora."],
    risks: ["Una pausa reduce variedad y ventas potenciales.", "El dato versionado puede ir detrás del inventario actual de CJ."],
    implications: critical ? "Autorizar confirma la exclusión comercial hasta que una importación CJ verificada recupere stock y margen." : "Autorizar mantiene el producto publicado, pero lo marca para revisión antes de invertir en promoción.",
    rollback: "Una sincronización CJ válida y una nueva autorización pueden devolverlo al ciclo normal.",
    confidencePercent: critical ? 94 : 82, evidence: evidenceFor(product), execution: critical ? "catalog_workflow" : "advisory",
  };
}

function coverageProposals(products: Product[], signals: MarketSignal[], now: Date) {
  const proposals: IntelligenceProposal[] = [];
  const aiProducts = products.filter((product) => product.niche === "technologyHome" && isArtificialIntelligenceProduct(product));
  if (!aiProducts.length) {
    const availableSignals = signals.filter((signal) => signal.available).sort((left, right) => right.score - left.score);
    proposals.push({
      id: proposalId("source_candidate", "technology-ai", now), ...dates(now), action: "source_candidate", status: "proposed",
      niche: "technologyHome", title: "Buscar el primer producto de tecnología con IA verificable",
      summary: "La nueva sección permanece vacía porque ninguna ficha CJ actual demuestra una función de inteligencia artificial.",
      rationale: ["Nexora no clasificará como IA un artículo que sólo diga “smart”.", "La búsqueda debe terminar en una ficha CJ completa, imagen oficial, variantes, stock y costo verificables."],
      benefits: ["Abrir una categoría diferenciada sin publicidad engañosa.", "Probar demanda real de tecnología con IA."],
      risks: ["La popularidad editorial no equivale a ventas.", "CJ puede no tener un equivalente apto o con margen suficiente."],
      implications: "Autorizar inicia una búsqueda acotada en CJ; no publica automáticamente. El candidato debe pasar imágenes, stock, variantes, logística y margen.",
      rollback: "Descartar el candidato sin modificar el catálogo actual.", confidencePercent: availableSignals.length ? 70 : 55,
      evidence: availableSignals.slice(0, 3).map((signal) => ({ label: signal.query, value: signal.detail, source: "gdelt" as const })), execution: "catalog_workflow",
    });
  }
  (Object.keys(niches) as ProductNiche[]).forEach((niche) => {
    const active = products.filter((product) => product.niche === niche && getCatalogDecision(product) !== "pause").length;
    if (active >= 5) return;
    proposals.push({
      id: proposalId("source_candidate", `${niche}-rotation`, now), ...dates(now), action: "source_candidate", status: "proposed", niche,
      title: `Reponer rotación en ${niches[niche].label}`,
      summary: `Sólo hay ${active} productos comercializables en el nicho; el objetivo operativo es mantener al menos cinco opciones verificadas.`,
      rationale: ["La variedad insuficiente reduce la capacidad de comparar demanda.", "El reemplazo debe permanecer dentro del mismo nicho."],
      benefits: ["Sostener rotación sin mezclar categorías.", "Reducir dependencia de un único SKU."],
      risks: ["Cada candidato consume cuota CJ durante la verificación.", "Un producto nuevo aún no tiene historial propio."],
      implications: "Autorizar habilita un flujo de descubrimiento acotado. La publicación exige una importación versionada y validada, nunca un registro simulado.",
      rollback: "No aprobar el candidato o revertir el commit de catálogo antes de pautarlo.", confidencePercent: 88,
      evidence: [{ label: "Productos comercializables", value: `${active} de mínimo 5`, source: "nexora" }], execution: "catalog_workflow",
    });
  });
  return proposals;
}

function deliverySlaPercent(orders: Awaited<ReturnType<typeof getSalesDashboardSnapshot>>["recentOrders"]) {
  const completed = orders.filter((order) => /ENTREG|DELIVER/i.test(order.fulfillmentStatus));
  if (!completed.length) return 0;
  return Math.round(completed.filter((order) => !order.needsReview).length / completed.length * 100);
}

export async function buildIntelligenceSnapshot({ marketSignals = [], persistProposals = false }: { marketSignals?: MarketSignal[]; persistProposals?: boolean } = {}) {
  const now = new Date();
  const [products, sales, ledger] = await Promise.all([
    getCatalog(),
    getSalesDashboardSnapshot(),
    getIntelligenceLedgerSnapshot().catch(() => null),
  ]);
  const computed = [
    ...products.map((product) => productProposal(product, now)).filter((proposal): proposal is IntelligenceProposal => Boolean(proposal)),
    ...coverageProposals(products, marketSignals, now),
  ].slice(0, 24);
  const persistedById = new Map((ledger?.proposals || []).map((proposal) => [proposal.id, proposal]));
  const proposals = computed.map((proposal) => persistedById.get(proposal.id) || proposal);
  if (persistProposals && proposals.length) await syncIntelligenceProposals(proposals);
  const approvedOrders = sales.sales.approvedOrders || 0;
  const reconciled = sales.recentOrders.length
    ? Math.round(sales.recentOrders.filter((order) => !order.needsReview).length / sales.recentOrders.length * 100)
    : 0;
  const evaluated = (ledger?.proposals || []).filter((proposal) => proposal.status === "executed" || proposal.status === "rejected");
  const validatedSuccess = evaluated.filter((proposal) => proposal.status === "executed" && /validada|resultado positivo/i.test(proposal.decisionNote || "")).length;
  const recommendationPrecisionPercent = evaluated.length ? Math.round(validatedSuccess / evaluated.length * 100) : 0;
  const averageDecisionConfidencePercent = evaluated.length ? Math.round(evaluated.reduce((total, proposal) => total + proposal.confidencePercent, 0) / evaluated.length) : 0;
  const soldSkus = new Set(sales.recentOrders.filter((order) => order.paymentStatus === "APPROVED").flatMap((order) => order.productSku.split(/[·,;\s]+/).filter(Boolean)));
  const activeProducts = products.filter((product) => getCatalogDecision(product) !== "pause");
  const catalogRotationCoveragePercent = activeProducts.length ? Math.round(activeProducts.filter((product) => soldSkus.has(product.sku)).length / activeProducts.length * 100) : 0;
  const events = ledger?.events || emptyEvents;
  return {
    mode: "shadow" as const,
    generatedAt: now.toISOString(),
    connected: Boolean(ledger),
    events,
    proposals,
    marketSignals,
    readiness: evaluateAutonomyReadiness({
      events,
      approvedOrders,
      paymentReconciliationPercent: reconciled,
      deliverySlaPercent: deliverySlaPercent(sales.recentOrders),
      recommendationPrecisionPercent,
      averageDecisionConfidencePercent,
      catalogRotationCoveragePercent,
    }),
  };
}
