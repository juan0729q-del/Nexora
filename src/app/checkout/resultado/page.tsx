import { CheckoutResultStatus } from "@/components/store/checkout-result-status";

export const metadata = { title: "Estado del pago", robots: { index: false, follow: false } };

type CheckoutSearchParams = {
  provider?: string;
  reference?: string;
  id?: string;
};

export default async function CheckoutResult({ searchParams }: { searchParams: Promise<CheckoutSearchParams> }) {
  const { provider, reference, id } = await searchParams;
  return <main id="page-content" tabIndex={-1} className="grid min-h-screen place-items-center px-5 outline-none">
    <CheckoutResultStatus provider={provider} transactionId={id} reference={reference} />
  </main>;
}
