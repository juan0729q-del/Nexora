import Link from "next/link";

export default function NotFound() {
  return <main id="page-content" tabIndex={-1} className="grid min-h-screen place-items-center px-5 outline-none">
    <section className="w-full max-w-lg rounded-2xl border border-silver/20 bg-white/[.025] p-7 text-center">
      <p className="text-xs font-bold uppercase tracking-[.16em] text-emerald">Error 404</p>
      <h1 className="mt-3 text-3xl font-semibold text-white">Esta página no está disponible</h1>
      <p className="mt-4 text-sm leading-6 text-silver/75">El producto pudo cambiar o la dirección ya no existe. El catálogo vigente te espera en la tienda.</p>
      <Link href="/" className="mt-6 inline-flex rounded-full bg-emerald px-5 py-3 text-sm font-bold text-onyx">Volver a Nexora</Link>
    </section>
  </main>;
}
