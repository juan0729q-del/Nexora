import { permanentRedirect } from "next/navigation";

export const metadata = { robots: { index: false, follow: false } };

type CheckoutSearchParams = { provider?: string; reference?: string; id?: string };

export default async function LegacyCheckoutResult({ searchParams }: { searchParams: Promise<CheckoutSearchParams> }) {
  const params = await searchParams;
  const target = new URL("https://nexora.invalid/co/checkout/resultado");
  Object.entries(params).forEach(([key, value]) => { if (value) target.searchParams.set(key, value); });
  permanentRedirect(`${target.pathname}${target.search}`);
}
