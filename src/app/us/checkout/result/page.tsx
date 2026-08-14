import { CheckoutResultStatus } from "@/components/store/checkout-result-status";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";

export const metadata = { title: "Payment status", robots: { index: false, follow: false } };

type CheckoutSearchParams = { provider?: string; reference?: string; id?: string; token?: string; cancelled?: string };

export default async function UnitedStatesCheckoutResult({ searchParams }: { searchParams: Promise<CheckoutSearchParams> }) {
  const { provider, reference, id, token, cancelled } = await searchParams;
  return <><StoreHeader market="us" /><main id="page-content" tabIndex={-1} className="grid min-h-[70vh] place-items-center px-5 py-12 outline-none"><CheckoutResultStatus provider={provider} transactionId={id} token={token} reference={reference} cancelled={cancelled === "1"} market="us" /></main><StoreFooter market="us" /></>;
}
