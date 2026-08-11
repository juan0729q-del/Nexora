import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { buildIntelligenceSnapshot } from "@/lib/intelligence/engine";
import { decideIntelligenceProposalAtomically, SalesLedgerError } from "@/lib/sales-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, maximum: number) { return typeof value === "string" ? value.trim().slice(0, maximum) : ""; }

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ message: "Sesión administrativa requerida." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const proposalId = text(body.proposalId, 120);
    const decision = text(body.decision, 30);
    if (!proposalId || (decision !== "authorized" && decision !== "rejected")) return NextResponse.json({ message: "Decisión inválida." }, { status: 400 });

    // La vista puede mostrar una propuesta calculada antes del siguiente cron.
    // Se sincroniza exclusivamente el registro que el administrador acaba de
    // revisar para que Sheets nunca reciba una decisión sobre un ID inexistente.
    const snapshot = await buildIntelligenceSnapshot();
    const proposal = snapshot.proposals.find((item) => item.id === proposalId);
    if (!proposal) return NextResponse.json({ message: "La propuesta expiró o ya no corresponde al catálogo actual. Recarga la página." }, { status: 409 });
    if (proposal.status !== "proposed") return NextResponse.json({ message: "Esta propuesta ya tiene una decisión registrada." }, { status: 409 });

    const result = await decideIntelligenceProposalAtomically(proposal, decision, text(body.note, 800));
    console.info("[intelligence/decision] recorded", { proposalId, decision, execution: proposal.execution });
    return NextResponse.json({ updated: true, decision: result.status, execution: proposal.execution });
  } catch (error) {
    if (error instanceof SalesLedgerError) {
      console.error("[intelligence/decision] ledger rejected request", { message: error.message });
      const unavailable = error.message.includes("invalid_or_unavailable");
      return NextResponse.json({
        message: unavailable
          ? "El registro privado no pudo sincronizar la propuesta. Recarga la página e inténtalo nuevamente."
          : error.message,
      }, { status: 503 });
    }
    console.error("[intelligence/decision] unexpected failure", error);
    return NextResponse.json({ message: "No fue posible registrar la decisión." }, { status: 500 });
  }
}
