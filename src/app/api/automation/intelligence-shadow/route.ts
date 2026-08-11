import { NextResponse } from "next/server";
import { hasValidCronAuthorization } from "@/lib/automation/runtime-auth";
import { buildIntelligenceSnapshot } from "@/lib/intelligence/engine";
import { collectPublicMarketSignals } from "@/lib/intelligence/market-radar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function run(request: Request) {
  if (!hasValidCronAuthorization(request.headers.get("authorization"))) return NextResponse.json({ message: "No autorizado" }, { status: 401 });
  try {
    const marketSignals = await collectPublicMarketSignals();
    const snapshot = await buildIntelligenceSnapshot({ marketSignals, persistProposals: true });
    return NextResponse.json({
      ok: true, mode: snapshot.mode, generatedAt: snapshot.generatedAt,
      proposals: snapshot.proposals.length,
      pending: snapshot.proposals.filter((proposal) => proposal.status === "proposed").length,
      readinessPercent: snapshot.readiness.scorePercent,
      marketSourcesAvailable: marketSignals.filter((signal) => signal.available).length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Shadow intelligence cycle failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ message: "No fue posible completar el ciclo de inteligencia; no se modificó la tienda." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export const GET = run;
export const POST = run;
