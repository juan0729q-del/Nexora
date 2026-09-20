import "server-only";

import { getCatalog, invalidateOperationalCatalogCache } from "@/lib/catalog-store";
import { decideIntelligenceProposal } from "@/lib/sales-ledger";
import { executeIntelligenceProposal, executedDecisionNote, failedDecisionNote } from "./execution";
import type { IntelligenceProposal } from "./types";

export async function reconcileAuthorizedIntelligenceProposals(proposals: IntelligenceProposal[]) {
  const catalog = await getCatalog();
  const recoverable = proposals
    .filter((proposal) => proposal.status === "authorized")
    .filter((proposal) => !Number.isFinite(Date.parse(proposal.expiresAt)) || Date.parse(proposal.expiresAt) > Date.now())
    .slice(0, 4);
  const results: Array<{ proposalId: string; executed: boolean; detail: string }> = [];

  for (const proposal of recoverable) {
    try {
      const detail = await executeIntelligenceProposal(proposal, proposal.decisionNote || "", catalog);
      await decideIntelligenceProposal(proposal.id, "authorized", executedDecisionNote(proposal.decisionNote || "", detail));
      results.push({ proposalId: proposal.id, executed: true, detail });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Fallo no identificado.";
      await decideIntelligenceProposal(proposal.id, "authorized", failedDecisionNote(proposal.decisionNote || "", error)).catch(() => undefined);
      results.push({ proposalId: proposal.id, executed: false, detail });
    }
  }
  if (results.some((result) => result.executed)) invalidateOperationalCatalogCache();
  return results;
}
