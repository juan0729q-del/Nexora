import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { decideIntelligenceProposal, SalesLedgerError } from "@/lib/sales-ledger";

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
    await decideIntelligenceProposal(proposalId, decision, text(body.note, 800));
    return NextResponse.json({ updated: true });
  } catch (error) {
    if (error instanceof SalesLedgerError) return NextResponse.json({ message: error.message }, { status: 503 });
    return NextResponse.json({ message: "No fue posible registrar la decisión." }, { status: 500 });
  }
}
