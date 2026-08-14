import { CheckoutResultStatus } from "@/components/store/checkout-result-status";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";

export const metadata = { title: "Estado del pago", robots: { index: false, follow: false } };

type CheckoutSearchParams = { provider?: string; reference?: string; id?: string; token?: string; cancelled?: string };

export default async function ColombiaCheckoutResult({ searchParams }: { searchParams: Promise<CheckoutSearchParams> }) {
  const { provider, reference, id, token, cancelled } = await searchParams;
  return <><StoreHeader market="co" /><main id="page-content" tabIndex={-1} className="grid min-h-[70vh] place-items-center px-5 py-12 outline-none"><CheckoutResultStatus provider={provider} transactionId={id} token={token} reference={reference} cancelled={cancelled === "1"} market="co" /></main><StoreFooter market="co" /></>;
}
