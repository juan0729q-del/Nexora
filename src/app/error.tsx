"use client";

import { usePathname } from "next/navigation";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const english = usePathname().startsWith("/us");
  return <main id="page-content" tabIndex={-1} className="grid min-h-screen place-items-center px-5 outline-none">
    <section className="w-full max-w-lg rounded-2xl border border-red-300/25 bg-red-300/[.06] p-7 text-center">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald">Nexora</p>
      <h1 className="mt-3 text-3xl font-semibold text-white">{english ? "We couldn't load this section" : "No pudimos cargar esta sección"}</h1>
      <p className="mt-4 text-sm leading-6 text-silver/75">{english ? "No payment information was processed on this screen. You can safely try again." : "Tus datos de pago no se procesaron en esta pantalla. Puedes volver a intentarlo de forma segura."}</p>
      <button type="button" onClick={reset} className="mt-6 rounded-full bg-emerald px-5 py-3 text-sm font-bold text-onyx">{english ? "Try again" : "Intentar de nuevo"}</button>
    </section>
  </main>;
}
