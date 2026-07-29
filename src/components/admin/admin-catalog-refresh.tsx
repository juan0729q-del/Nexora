"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export function AdminCatalogRefresh({ version, importedAt }: { version: number; importedAt: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [requestedAt, setRequestedAt] = useState<string | null>(null);

  function refresh() {
    setRequestedAt(new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button type="button" onClick={refresh} disabled={isPending} className="rounded-full border border-emerald/50 bg-emerald/10 px-4 py-2 text-sm font-semibold text-emerald transition hover:bg-emerald/20 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald">
        {isPending ? "Actualizando vista…" : "Actualizar panel"}
      </button>
      <p aria-live="polite" className="max-w-xs text-left text-[11px] leading-4 text-silver/55 sm:text-right">
        {requestedAt ? `Vista recargada a las ${requestedAt}. ` : ""}
        Versión publicada v{version}{importedAt ? ` · ${new Date(importedAt).toLocaleString("es-CO")}` : ""}. No consulta CJ ni consume cuota.
      </p>
    </div>
  );
}
