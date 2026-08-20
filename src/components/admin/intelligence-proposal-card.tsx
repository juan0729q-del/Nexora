"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { IntelligenceProposal } from "@/lib/intelligence/types";

const actionLabels: Record<IntelligenceProposal["action"], string> = {
  promote_product: "Promover producto", monitor_product: "Monitorear producto",
  pause_product: "Pausar producto", start_experiment: "Iniciar experimento",
  source_candidate: "Buscar candidato CJ",
};

export function IntelligenceProposalCard({ proposal, connected }: { proposal: IntelligenceProposal; connected: boolean }) {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [note, setNote] = useState(proposal.decisionNote || "");
  const [pending, setPending] = useState<"authorized" | "rejected" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const decided = ["rejected", "executed", "expired"].includes(proposal.status);

  async function decide(decision: "authorized" | "rejected") {
    if (!connected || pending || decided || !acknowledged) return;
    setPending(decision);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/intelligence/decisions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId: proposal.id, decision, note }),
      });
      const payload = await response.json().catch(() => null) as { message?: string; executed?: boolean; result?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "No fue posible registrar la decisión.");
      setMessage(decision === "authorized"
        ? payload?.executed
          ? payload.result || "Autorización registrada y aplicada al flujo operativo controlado."
          : "Autorización registrada; la ejecución requiere reintento."
        : "Propuesta rechazada y conservada como evidencia.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible registrar la decisión.");
    } finally {
      setPending(null);
    }
  }

  return <article className="rounded-2xl border border-silver/15 bg-white/[.025] p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-[.12em] text-emerald uppercase">{actionLabels[proposal.action]}</p><h3 className="mt-2 text-lg font-semibold text-white">{proposal.title}</h3></div><div className="text-right"><span className="rounded-full border border-silver/20 px-3 py-1 text-xs text-silver/75">{proposal.status}</span><p className="mt-2 text-xs text-silver/50">Confianza {proposal.confidencePercent}%</p></div></div>
    <p className="mt-4 text-sm leading-6 text-silver/70">{proposal.summary}</p>
    <div className="mt-5 grid gap-4 lg:grid-cols-3"><div><h4 className="text-xs font-bold text-white uppercase">Por qué</h4><ul className="mt-2 space-y-2 text-xs leading-5 text-silver/65">{proposal.rationale.map((item) => <li key={item}>• {item}</li>)}</ul></div><div><h4 className="text-xs font-bold text-emerald uppercase">Beneficios</h4><ul className="mt-2 space-y-2 text-xs leading-5 text-silver/65">{proposal.benefits.map((item) => <li key={item}>• {item}</li>)}</ul></div><div><h4 className="text-xs font-bold text-amber-100 uppercase">Riesgos</h4><ul className="mt-2 space-y-2 text-xs leading-5 text-silver/65">{proposal.risks.map((item) => <li key={item}>• {item}</li>)}</ul></div></div>
    <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/[.06] p-4"><p className="text-xs font-bold text-amber-100 uppercase">Implicaciones antes de autorizar</p><p className="mt-2 text-sm leading-6 text-silver/75">{proposal.implications}</p><p className="mt-2 text-xs leading-5 text-silver/55"><strong className="text-white">Reversión:</strong> {proposal.rollback}</p></div>
    {proposal.evidence.length ? <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-silver/70">Ver evidencia utilizada</summary><ul className="mt-3 space-y-2 text-xs text-silver/55">{proposal.evidence.map((item) => <li key={`${item.source}-${item.label}`}><strong className="text-silver/80">{item.label}:</strong> {item.value} <span className="text-emerald">({item.source})</span></li>)}</ul></details> : null}
    {!decided ? <div className="mt-5 space-y-3 border-t border-silver/10 pt-5"><label className="flex items-start gap-3 text-xs leading-5 text-silver/70"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-1 accent-[#009473]" />He leído beneficios, riesgos, implicaciones y mecanismo de reversión.</label><label className="block text-xs text-silver/60">Nota de decisión (el ejecutor la interpreta dentro del alcance autorizado)<textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 800))} className="mt-2 min-h-20 w-full rounded-xl border border-silver/15 bg-onyx px-3 py-2 text-sm text-white outline-none focus:border-emerald" /></label><div className="flex flex-wrap gap-2"><button type="button" onClick={() => decide("authorized")} disabled={!connected || !acknowledged || Boolean(pending)} className="rounded-full bg-emerald px-4 py-2 text-sm font-bold text-onyx disabled:cursor-not-allowed disabled:opacity-40">{pending === "authorized" ? "Ejecutando…" : proposal.status === "authorized" ? "Reintentar ejecución" : "Autorizar y ejecutar"}</button><button type="button" onClick={() => decide("rejected")} disabled={!connected || !acknowledged || Boolean(pending)} className="rounded-full border border-red-300/30 px-4 py-2 text-sm font-semibold text-red-100 disabled:cursor-not-allowed disabled:opacity-40">{pending === "rejected" ? "Registrando…" : "Rechazar"}</button></div>{proposal.status === "authorized" ? <p className="text-xs text-amber-100">La autorización quedó registrada, pero aún no existe una marca de ejecución exitosa. Puedes reintentarla sin duplicar la propuesta.</p> : null}</div> : <p className="mt-5 border-t border-silver/10 pt-4 text-xs text-silver/60">Decisión: <strong className="text-white">{proposal.status}</strong>{proposal.decisionNote ? ` · ${proposal.decisionNote}` : ""}</p>}
    {message ? <p role="status" className="mt-3 text-xs text-emerald">{message}</p> : null}
  </article>;
}
