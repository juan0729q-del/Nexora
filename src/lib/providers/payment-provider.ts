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

export type PublicCheckoutResult = {
  provider: "wompi" | "mercadopago";
  checkoutUrl: string;
  externalReference: string;
  productSubtotalCop: number;
  shippingCostCop: number;
  amountCop: number;
  message?: string;
};

function trustedCheckoutUrl(value: string, provider: PublicCheckoutResult["provider"]) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    return provider === "wompi"
      ? url.hostname === "checkout.wompi.co"
      : ["www.mercadopago.com.co", "www.mercadopago.com"].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function createCheckoutSession(request: CartCheckoutRequest) {
  // Este adaptador es el único punto que debe cambiar al integrar Wompi o Mercado Pago.
  // Nunca expongas una llave privada: la creación de la intención ocurre en el Route Handler.
  const response = await fetch("/api/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
  const result = await response.json() as Partial<PublicCheckoutResult>;
  if (!response.ok) throw new Error(result.message || "No fue posible iniciar el pago.");
  const provider = result.provider === "wompi" || result.provider === "mercadopago" ? result.provider : null;
  const validAmounts = Number.isSafeInteger(result.productSubtotalCop) && Number(result.productSubtotalCop) > 0
    && Number.isSafeInteger(result.shippingCostCop) && Number(result.shippingCostCop) >= 0
    && Number.isSafeInteger(result.amountCop) && result.amountCop === Number(result.productSubtotalCop) + Number(result.shippingCostCop);
  if (!result.checkoutUrl || !provider || !result.externalReference || !validAmounts || !trustedCheckoutUrl(result.checkoutUrl, provider)) {
    throw new Error("La pasarela devolvió un enlace de pago no válido. No se realizó ningún cobro.");
  }
  return result as PublicCheckoutResult;
}
