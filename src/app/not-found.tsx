import Link from "next/link";
import { headers } from "next/headers";

export default async function NotFound() {
  const english = (await headers()).get("x-nexora-market") === "us";
  return <main id="page-content" tabIndex={-1} className="grid min-h-screen place-items-center px-5 outline-none">
    <section className="w-full max-w-lg rounded-2xl border border-silver/20 bg-white/[.025] p-7 text-center">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald">Error 404</p>
      <h1 className="mt-3 text-3xl font-semibold text-white">{english ? "This page is unavailable" : "Esta página no está disponible"}</h1>
      <p className="mt-4 text-sm leading-6 text-silver/75">{english ? "The product may have changed or the address no longer exists. Explore Nexora's current catalog." : "El producto pudo cambiar o la dirección ya no existe. El catálogo vigente te espera en la tienda."}</p>
      <Link href={english ? "/us" : "/co"} className="mt-6 inline-flex rounded-full bg-emerald px-5 py-3 text-sm font-bold text-onyx">{english ? "Back to Nexora" : "Volver a Nexora"}</Link>
    </section>
  </main>;
}
