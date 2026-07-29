import Link from "next/link";

export const metadata = { title: "Estado del pago", robots: { index: false, follow: false } };

type CheckoutSearchParams = {
  provider?: string;
  reference?: string;
  id?: string;
  collection_status?: string;
  status?: string;
};

export default async function CheckoutResult({ searchParams }: { searchParams: Promise<CheckoutSearchParams> }) {
  const { provider, reference, id } = await searchParams;
  const label = provider === "wompi" ? "Wompi" : provider === "mercadopago" ? "Mercado Pago" : "la pasarela";
  return <main className="grid min-h-screen place-items-center px-5">
    <section className="w-full max-w-md rounded-2xl border border-silver/20 bg-white/[.025] p-7 text-center">
      <p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">Nexora</p>
      <h1 className="mt-3 text-3xl font-semibold text-white">Estamos verificando tu pago</h1>
      <p className="mt-4 text-sm leading-6 text-silver/70">{label} confirmará el resultado mediante su evento seguro. Esta pantalla no marca un pago como aprobado por sí sola.</p>
      {(reference || id) && <p className="mt-4 rounded-xl border border-silver/15 bg-black/20 px-3 py-2 font-mono text-xs text-silver/70">Referencia: {reference || id}</p>}
      <p className="mt-4 text-xs leading-5 text-silver/55">Guarda el comprobante de la pasarela. Nexora solo procesará el pedido cuando reciba la confirmación oficial y enviará la actualización al correo que registraste en Wompi.</p>
      <Link href="/" className="mt-7 inline-flex rounded-full bg-emerald px-5 py-3 text-sm font-bold text-onyx">Volver a la tienda</Link>
    </section>
  </main>;
}
