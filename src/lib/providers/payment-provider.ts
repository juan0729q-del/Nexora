import type { ShippingDestinationInput } from "@/lib/shipping/types";

export type CartCheckoutRequestItem = {
  productSlug: string;
  variantSku: string;
  quantity: number;
  shippingQuoteToken: string;
  shippingMethodId: string;
};

export type CartCheckoutRequest = {
  customerEmail: string;
  destination: ShippingDestinationInput;
  items: CartCheckoutRequestItem[];
};

export async function createCheckoutSession(request: CartCheckoutRequest) {
  // Este adaptador es el único punto que debe cambiar al integrar Wompi o Mercado Pago.
  // Nunca expongas una llave privada: la creación de la intención ocurre en el Route Handler.
  const response = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
  const result = await response.json() as { checkoutUrl?: string; message?: string };
  if (!response.ok) throw new Error(result.message || "No fue posible iniciar el pago.");
  if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
  return result;
}
