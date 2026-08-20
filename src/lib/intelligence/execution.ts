import "server-only";

import { createCjClient } from "@/lib/automation/cj-client";
import { fetchTrendingProductsForNiche } from "@/lib/automation/niche-rotation";
import type { Product } from "@/lib/products";
import type { IntelligenceProposal } from "./types";

export const intelligenceExecutionMarker = "[NEXORA_EXECUTED_V1]";
export const intelligenceExecutionFailureMarker = "[NEXORA_EXECUTION_FAILED_V1]";

function clean(value: string, maximum: number) {
  return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function asksForReplacement(note: string) {
  return /reemplaz|sustitu|otro producto|mejor disponibilidad/i.test(note);
}

async function discoverCandidate(proposal: IntelligenceProposal, catalog: Product[]) {
  const excluded = new Set(catalog.map((product) => product.sku.toUpperCase()));
  const candidates = await fetchTrendingProductsForNiche(
    proposal.niche,
    1,
    createCjClient({ minimumPointsReserve: 0 }),
    undefined,
    excluded,
  );
  const candidate = candidates[0];
  if (!candidate) throw new Error("CJ no devolvió un candidato nuevo que superara la validación de ficha, imagen, estilo, stock y costo.");
  return `Candidato CJ validado para revisión humana: ${clean(candidate.name, 150)} (${clean(candidate.sku, 80)}), categoría ${clean(candidate.categoryPath, 140)}. No fue publicado automáticamente.`;
}

/**
 * Ejecuta únicamente el alcance que el administrador autorizó. Los cambios de
 * merchandising son una capa reversible sobre el catálogo versionado; un
 * candidato CJ se descubre y valida, pero nunca se publica sin pasar por Git.
 */
export async function executeIntelligenceProposal(
  proposal: IntelligenceProposal,
  operatorNote: string,
  catalog: Product[],
) {
  const target = proposal.targetSku
    ? catalog.find((product) => product.sku.toUpperCase() === proposal.targetSku?.toUpperCase())
    : undefined;

  if (proposal.action === "pause_product") {
    if (!target) throw new Error("El producto objetivo ya no existe en el catálogo versionado.");
    const replacement = asksForReplacement(operatorNote)
      ? ` ${await discoverCandidate(proposal, catalog)}`
      : "";
    return `Producto ${target.sku} excluido de la vitrina y del checkout mediante una regla operativa reversible.${replacement}`;
  }
  if (proposal.action === "promote_product") {
    if (!target) throw new Error("El producto objetivo ya no existe en el catálogo versionado.");
    return `Producto ${target.sku} priorizado dentro de su nicho sin modificar precio, stock ni checkout.`;
  }
  if (proposal.action === "monitor_product") {
    if (!target) throw new Error("El producto objetivo ya no existe en el catálogo versionado.");
    return `Producto ${target.sku} marcado para seguimiento; permanece vendible sólo mientras las reglas deterministas de stock y margen lo permitan.`;
  }
  if (proposal.action === "source_candidate") return discoverCandidate(proposal, catalog);
  if (proposal.action === "start_experiment") {
    return "Experimento de exposición registrado en modo sombra; no altera precios ni habilita autonomía comercial.";
  }
  throw new Error("La acción propuesta no tiene un ejecutor permitido.");
}

export function executedDecisionNote(operatorNote: string, result: string) {
  const prefix = clean(operatorNote, 440);
  const execution = `${intelligenceExecutionMarker} ${clean(result, 300)}`;
  return [prefix, execution].filter(Boolean).join("\n").slice(0, 800);
}

export function failedDecisionNote(operatorNote: string, error: unknown) {
  const prefix = clean(operatorNote, 500);
  const detail = error instanceof Error ? error.message : "Fallo no identificado.";
  return [prefix, `${intelligenceExecutionFailureMarker} ${clean(detail, 240)}`].filter(Boolean).join("\n").slice(0, 800);
}
