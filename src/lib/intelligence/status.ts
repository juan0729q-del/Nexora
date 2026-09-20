import type { IntelligenceProposalStatus } from "./types";

export function effectiveIntelligenceProposalStatus(
  status: IntelligenceProposalStatus,
  decisionNote: string | undefined,
  expiresAt: string,
  now = Date.now(),
): IntelligenceProposalStatus {
  if (status === "authorized" && decisionNote?.includes("[NEXORA_EXECUTED_V1]")) return "executed";
  if (status === "authorized") {
    const expiry = Date.parse(expiresAt);
    if (Number.isFinite(expiry) && expiry <= now) return "expired";
  }
  return status;
}
