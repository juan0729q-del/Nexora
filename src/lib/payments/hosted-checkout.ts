import "server-only";

import { createHash, randomUUID } from "crypto";
import { getProductPresentation } from "@/lib/product-presentation";
import type { Product } from "@/lib/products";
import type { CheckoutShipping } from "@/lib/shipping/types";

export type PaymentProvider = "wompi" | "mercadopago";
export type CheckoutLineItem = {
  product: Product;
  quantity: number;
  shipping: CheckoutShipping;
  supplierCostUsd: number;
  exchangeRateCopPerUsd: number;
};
export type CheckoutSession = {
  provider: PaymentProvider;
  checkoutUrl: string;
  externalReference: string;
  productSubtotalCop: number;
  shippingCostCop: number;
  amountCop: number;
  items: CheckoutLineItem[];
};

/** Respuesta segura para el navegador: la dirección sólo vive en el evento privado. */
export type PublicCheckoutSession = Pick<
  CheckoutSession,
  "provider" | "checkoutUrl" | "externalReference" | "productSubtotalCop" | "shippingCostCop" | "amountCop"
>;

export function toPublicCheckoutSession(session: CheckoutSession): PublicCheckoutSession {
  return {
    provider: session.provider,
    checkoutUrl: session.checkoutUrl,
    externalReference: session.externalReference,
    productSubtotalCop: session.productSubtotalCop,
    shippingCostCop: session.shippingCostCop,
    amountCop: session.amountCop,
  };
}

export class PaymentConfigurationError extends Error {}
export class PaymentProviderError extends Error {}

function getProvider(): PaymentProvider {
  const selected = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();
  if (selected === "wompi") return selected;
  // Nexora ya concilia y registra el ciclo completo de Wompi antes de marcar
  // un pedido como pagado. Mercado Pago conserva su adaptador para una futura
  // activación, pero no se debe exponer mientras su webhook no tenga la misma
  // conciliación firmada con el libro privado: evitaría ventas sin postventa.
  if (selected === "mercadopago") {
    throw new PaymentConfigurationError(
      "Mercado Pago está desactivado hasta completar su conciliación de postventa. Configura PAYMENT_PROVIDER=wompi para procesar compras con seguimiento.",
    );
  }
  if (getWompiPublicKey() || process.env.WOMPI_PRIVATE_KEY) return "wompi";
  if (process.env.MERCADOPAGO_ACCESS_TOKEN) {
    throw new PaymentConfigurationError(
      "Mercado Pago está configurado, pero no se activa automáticamente hasta completar su conciliación de postventa. Configura Wompi como pasarela activa.",
    );
  }
  throw new PaymentConfigurationError("No hay una pasarela de pago configurada.");
}

function getWompiPublicKey() {
  const publicKey = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY?.trim() || process.env.WOMPI_PUBLIC_KEY?.trim();
  if (publicKey) return publicKey;
  // Compatibilidad temporal si una llave pública se guardó con el nombre anterior.
  const legacyValue = process.env.WOMPI_PRIVATE_KEY?.trim();
  return legacyValue?.startsWith("pub_") ? legacyValue : undefined;
}

function getWompiBaseUrl(privateKey: string) {
  const isSandboxKey = privateKey.startsWith("prv_test_");
  const expectedUrl = isSandboxKey ? "https://sandbox.wompi.co" : "https://production.wompi.co";
  const configuredUrl = process.env.WOMPI_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!configuredUrl) return expectedUrl;
  const configuredSandbox = configuredUrl.includes("sandbox.wompi.co");
  if (configuredSandbox !== isSandboxKey) {
    console.warn("Wompi API base URL does not match the key environment; using matching endpoint.");
    return expectedUrl;
  }
  return configuredUrl;
}

function providerError(provider: PaymentProvider, response: Response, payload: unknown): never {
  console.error("Payment provider request failed", { provider, status: response.status, payload });
  if (response.status === 401) {
    throw new PaymentProviderError(provider === "wompi"
      ? "Wompi rechazó la llave privada. Usa una llave prv_test_/prv_prod_ válida o configura Checkout Web con llave pública y WOMPI_INTEGRITY_SECRET."
      : "Mercado Pago rechazó la credencial. Verifica MERCADOPAGO_ACCESS_TOKEN en Vercel.");
  }
  throw new PaymentProviderError("La pasarela no pudo preparar el pago. Intenta nuevamente en unos minutos.");
}

function resultUrl(siteUrl: string, provider: PaymentProvider, externalReference: string) {
  const url = new URL("/checkout/resultado", `${siteUrl}/`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("reference", externalReference);
  return url.toString();
}

function checkoutAmounts(items: CheckoutLineItem[]) {
  const productSubtotalCop = items.reduce((total, item) => total + item.product.price * item.quantity, 0);
  const shippingCostCop = items.reduce((total, item) => total + Math.round(item.shipping.selected.amountCop), 0);
  if (!Number.isSafeInteger(productSubtotalCop) || productSubtotalCop <= 0 || !Number.isSafeInteger(shippingCostCop) || shippingCostCop < 0) {
    throw new PaymentConfigurationError("El carrito o la cotización de envío no contiene valores válidos.");
  }
  const amountCop = productSubtotalCop + shippingCostCop;
  if (!Number.isSafeInteger(amountCop) || amountCop <= 0) throw new PaymentConfigurationError("El total del pedido no es válido.");
  return { productSubtotalCop, shippingCostCop, amountCop };
}

function checkoutExpiration(items: CheckoutLineItem[]) {
  const expirations = items.map((item) => new Date(item.shipping.quoteExpiresAt));
  if (!expirations.length || expirations.some((date) => Number.isNaN(date.getTime()) || date.getTime() <= Date.now())) {
    throw new PaymentConfigurationError("La cotización de envío venció. Vuelve a calcularla antes de pagar.");
  }
  return new Date(Math.min(...expirations.map((date) => date.getTime()))).toISOString();
}

export async function createHostedCheckout(items: CheckoutLineItem[], siteUrl: string, customerEmail: string): Promise<CheckoutSession> {
  if (!items.length) throw new PaymentConfigurationError("El carrito está vacío.");
  const provider = getProvider();
  // Wompi exige una referencia única por transacción. Checkout Web no crea un
  // recurso remoto al preparar esta URL, por lo que cada intento puede recibir
  // una referencia nueva sin duplicar cobros ni payment links en el proveedor.
  const uniqueFragment = randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase();
  const externalReference = `NXR-CART-${uniqueFragment}`;
  const amounts = checkoutAmounts(items);
  return provider === "wompi"
    ? createWompiCheckout(items, siteUrl, externalReference, customerEmail, amounts)
    : createMercadoPagoPreference(items, siteUrl, externalReference, customerEmail, amounts);
}

async function createWompiCheckout(items: CheckoutLineItem[], siteUrl: string, externalReference: string, customerEmail: string, amounts: ReturnType<typeof checkoutAmounts>): Promise<CheckoutSession> {
  const publicKey = getWompiPublicKey();
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET?.trim();
  // Checkout Web se construye localmente: preparar la URL no crea todavía una
  // transacción ni otro recurso remoto en Wompi.
  if (!publicKey) throw new PaymentConfigurationError("Falta NEXT_PUBLIC_WOMPI_PUBLIC_KEY para abrir el Checkout Web seguro de Wompi.");
  if (!integritySecret) throw new PaymentConfigurationError("Falta WOMPI_INTEGRITY_SECRET para firmar el Checkout Web de Wompi.");
  return createWompiWebCheckout(items, siteUrl, externalReference, publicKey, integritySecret, customerEmail, amounts);
}

function createWompiWebCheckout(items: CheckoutLineItem[], siteUrl: string, externalReference: string, publicKey: string, integritySecret: string, customerEmail: string, amounts: ReturnType<typeof checkoutAmounts>): CheckoutSession {
  const amountInCents = Math.round(amounts.amountCop * 100);
  const expirationTime = checkoutExpiration(items);
  // Wompi exige firmar también expiration-time cuando se usa; así una tarifa
  // CJ vencida no queda utilizable a través de un checkout ya creado.
  const integrity = createHash("sha256").update(`${externalReference}${amountInCents}COP${expirationTime}${integritySecret}`).digest("hex");
  const params = new URLSearchParams({
    "public-key": publicKey,
    currency: "COP",
    "amount-in-cents": String(amountInCents),
    reference: externalReference,
    "signature:integrity": integrity,
    "redirect-url": resultUrl(siteUrl, "wompi", externalReference),
    "expiration-time": expirationTime,
    // El correo se pide antes del redirect y sólo se usa para prellenar el
    // checkout seguro de Wompi; no se escribe en Git ni en logs de Nexora.
    "customer-data:email": customerEmail,
    // La dirección ya se verificó contra CJ para calcular el flete. No se la
    // pedimos dos veces en Wompi: evita que el comprador cambie el destino
    // después de firmar el total.
    "collect-shipping": "false",
  });
  return { provider: "wompi", checkoutUrl: `https://checkout.wompi.co/p/?${params.toString()}`, externalReference, ...amounts, items };
}

/**
 * El Checkout Web conserva reference. Los links de pago pueden reportar una
 * referencia propia, por lo que se consulta su SKU sólo después de validar la
 * firma oficial del evento de Wompi.
 */
export async function resolveWompiPaymentLinkSku(paymentLinkId: string) {
  const privateKey = process.env.WOMPI_PRIVATE_KEY?.trim();
  if (!privateKey || !privateKey.startsWith("prv_") || !paymentLinkId) return undefined;
  const response = await fetch(`${getWompiBaseUrl(privateKey)}/v1/payment_links/${encodeURIComponent(paymentLinkId)}`, {
    headers: { Authorization: `Bearer ${privateKey}` },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { data?: { sku?: unknown } } | null;
  if (!response.ok) return undefined;
  return typeof payload?.data?.sku === "string" ? payload.data.sku : undefined;
}

async function createMercadoPagoPreference(items: CheckoutLineItem[], siteUrl: string, externalReference: string, customerEmail: string, amounts: ReturnType<typeof checkoutAmounts>): Promise<CheckoutSession> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new PaymentConfigurationError("Falta MERCADOPAGO_ACCESS_TOKEN en la configuración del servidor.");
  const checkoutResultUrl = resultUrl(siteUrl, "mercadopago", externalReference);
  const notificationUrl = new URL("/api/payments/mercadopago/webhook", `${siteUrl}/`).toString();
  const expiresAt = checkoutExpiration(items);
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": externalReference },
    body: JSON.stringify({
      items: items.flatMap((item) => {
        const presentation = getProductPresentation(item.product);
        return [
          { id: item.product.sku, title: presentation.title, description: presentation.cardDescription, quantity: item.quantity, unit_price: item.product.price, currency_id: "COP" },
          { id: `shipping-${item.shipping.selected.id}`, title: `Envío CJ — ${presentation.title}`, description: `${item.shipping.selected.method}${item.shipping.selected.estimatedDelivery ? ` · ${item.shipping.selected.estimatedDelivery}` : ""}`, quantity: 1, unit_price: item.shipping.selected.amountCop, currency_id: "COP" },
        ];
      }),
      external_reference: externalReference,
      expires: true,
      expiration_date_from: new Date().toISOString(),
      expiration_date_to: expiresAt,
      payer: { email: customerEmail },
      back_urls: { success: checkoutResultUrl, failure: checkoutResultUrl, pending: checkoutResultUrl },
      notification_url: notificationUrl,
      auto_return: "approved",
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { init_point?: string; sandbox_init_point?: string } | null;
  if (!response.ok || !(payload?.init_point || payload?.sandbox_init_point)) providerError("mercadopago", response, payload);
  return { provider: "mercadopago", checkoutUrl: payload.init_point || payload.sandbox_init_point!, externalReference, ...amounts, items };
}
