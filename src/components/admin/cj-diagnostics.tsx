"use client";

import { useState } from "react";

export function CjDiagnostics() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  async function diagnose() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/suppliers/cj/diagnostics", { method: "POST" });
      const payload = await response.json();
      setResult(JSON.stringify(payload, null, 2));
    } catch {
      setResult("No se pudo consultar CJ. No se han creado pedidos.");
    } finally {
      setBusy(false);
    }
  }
  return <section className="mt-6 rounded-2xl border border-silver/15 p-5">
    <h2 className="font-semibold">Diagnóstico de acceso y puntos CJ</h2>
    <p className="mt-2 text-sm text-silver/70">Consulta ajustes y una ficha oficial (10 puntos). No modifica el catálogo ni crea pedidos.</p>
    <button disabled={busy} onClick={diagnose} className="mt-3 rounded-full bg-emerald px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">{busy ? "Consultando CJ…" : "Comprobar acceso y puntos CJ"}</button>
    {result ? <pre role="status" className="mt-4 overflow-auto whitespace-pre-wrap text-xs">{result}</pre> : null}
  </section>;
}
