import type { Product } from "@/lib/products";
import type { ShippingDestinationInput } from "@/lib/shipping/types";

export type CheckoutRequest = {
  customerEmail: string;
  variantSku?: string;
  destination: ShippingDestinationInput;
  shippingQuoteToken: string;
  shippingMethodId: string;
};

export async function createCheckoutSession(product: Pick<Product, "slug">, request: CheckoutRequest) {
  // Este adaptador es el único punto que debe cambiar al integrar Wompi o Mercado Pago.
  // Nunca expongas una llave privada: la creación de la intención ocurre en el Route Handler.
  const response = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productSlug: product.slug, ...request }) });
  const result = await response.json() as { checkoutUrl?: string; message?: string };
  if (!response.ok) throw new Error(result.message || "No fue posible iniciar el pago.");
  if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
  return result;
}
