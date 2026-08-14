import type { ShippingDestinationInput } from "@/lib/shipping/types";
import type { Market } from "@/lib/i18n/config";

export type CartCheckoutRequestItem = {
  productSlug: string;
  variantSku: string;
  quantity: number;
  shippingQuoteToken: string;
  shippingMethodId: string;
};

export type CartCheckoutRequest = {
  market: Market;
  customerEmail: string;
  destination: ShippingDestinationInput;
  items: CartCheckoutRequestItem[];
};

export type PublicCheckoutResult = {
  provider: "wompi" | "mercadopago" | "paypal";
  checkoutUrl: string;
  externalReference: string;
  market: Market;
  locale: "es-CO" | "en-US";
  currency: "COP" | "USD";
  productSubtotal: number;
  shippingCost: number;
  amount: number;
  productSubtotalCop: number;
  shippingCostCop: number;
  amountCop: number;
  message?: string;
};

function trustedCheckoutUrl(value: string, provider: PublicCheckoutResult["provider"]) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (provider === "wompi") return url.hostname === "checkout.wompi.co";
    if (provider === "paypal") return ["www.paypal.com", "paypal.com", "www.sandbox.paypal.com", "sandbox.paypal.com"].includes(url.hostname);
    return ["www.mercadopago.com.co", "www.mercadopago.com"].includes(url.hostname);
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
  const provider = result.provider === "wompi" || result.provider === "mercadopago" || result.provider === "paypal" ? result.provider : null;
  const expectedCurrency = request.market === "co" ? "COP" : "USD";
  const validLocalizedAmounts = typeof result.productSubtotal === "number" && Number.isFinite(result.productSubtotal) && result.productSubtotal > 0
    && typeof result.shippingCost === "number" && Number.isFinite(result.shippingCost) && result.shippingCost >= 0
    && typeof result.amount === "number" && Number.isFinite(result.amount)
    && Math.abs(result.amount - result.productSubtotal - result.shippingCost) < 0.011;
  const validCopAuditAmounts = Number.isSafeInteger(result.productSubtotalCop) && Number(result.productSubtotalCop) > 0
    && Number.isSafeInteger(result.shippingCostCop) && Number(result.shippingCostCop) >= 0
    && Number.isSafeInteger(result.amountCop) && result.amountCop === Number(result.productSubtotalCop) + Number(result.shippingCostCop);
  if (!result.checkoutUrl || !provider || !result.externalReference || result.market !== request.market || result.currency !== expectedCurrency || !validLocalizedAmounts || !validCopAuditAmounts || !trustedCheckoutUrl(result.checkoutUrl, provider)) {
    throw new Error("La pasarela devolvió un enlace de pago no válido. No se realizó ningún cobro.");
  }
  return result as PublicCheckoutResult;
}
