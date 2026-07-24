import Link from "next/link";

export const metadata = { title: "Estado del pago", robots: { index: false, follow: false } };
export default async function CheckoutResult({ searchParams }: { searchParams: Promise<{ provider?: string }> }) {
  const { provider } = await searchParams;
  const label = provider === "wompi" ? "Wompi" : provider === "mercadopago" ? "Mercado Pago" : "la pasarela";
  return <main className="grid min-h-screen place-items-center px-5"><section className="w-full max-w-md rounded-2xl border border-silver/20 bg-white/[.025] p-7 text-center"><p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">Nexora</p><h1 className="mt-3 text-3xl font-semibold text-white">Pago en proceso</h1><p className="mt-4 text-sm leading-6 text-silver/70">{label} confirmará el resultado de tu transacción. Guarda el comprobante y vuelve a Nexora cuando finalices.</p><Link href="/" className="mt-7 inline-flex rounded-full bg-emerald px-5 py-3 text-sm font-bold text-onyx">Volver a la tienda</Link></section></main>;
}
