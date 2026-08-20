import "server-only";

import { createHash, randomUUID } from "crypto";
import type { Market, StoreCurrency, StoreLocale } from "@/lib/i18n/config";
import { createPayPalOrder, PayPalConfigurationError, PayPalProviderError } from "@/lib/payments/paypal";
import { getProductPresentation } from "@/lib/product-presentation";
import type { Product } from "@/lib/products";
import type { CheckoutShipping } from "@/lib/shipping/types";

export type PaymentProvider = "wompi" | "mercadopago" | "paypal";
export type CheckoutLineItem = {
  product: Product;
  quantity: number;
  unitPrice: number;
  unitPriceCop: number;
  shipping: CheckoutShipping;
  supplierCostUsd: number;
  exchangeRateCopPerUsd: number;
};
export type CheckoutSession = {
  market: Market;
  locale: StoreLocale;
  currency: StoreCurrency;
  exchangeRateCopPerUsd: number;
  rateUpdatedAt: string;
  provider: PaymentProvider;
  checkoutUrl: string;
  externalReference: string;
  productSubtotalCop: number;
  shippingCostCop: number;
  amountCop: number;
  productSubtotal: number;
  shippingCost: number;
  amount: number;
  items: CheckoutLineItem[];
};

/** Respuesta segura para el navegador: la dirección sólo vive en el evento privado. */
export type PublicCheckoutSession = Pick<
  CheckoutSession,
  "provider" | "checkoutUrl" | "externalReference" | "market" | "locale" | "currency" | "productSubtotal" | "shippingCost" | "amount" | "productSubtotalCop" | "shippingCostCop" | "amountCop"
>;

export type CheckoutPreparedRecorder = (session: CheckoutSession) => Promise<unknown>;

export function toPublicCheckoutSession(session: CheckoutSession): PublicCheckoutSession {
  return {
    provider: session.provider,
    checkoutUrl: session.checkoutUrl,
    externalReference: session.externalReference,
    market: session.market,
    locale: session.locale,
    currency: session.currency,
    productSubtotalCop: session.productSubtotalCop,
    shippingCostCop: session.shippingCostCop,
    amountCop: session.amountCop,
    productSubtotal: session.productSubtotal,
    shippingCost: session.shippingCost,
    amount: session.amount,
  };
}

export class PaymentConfigurationError extends Error {}
export class PaymentProviderError extends Error {}

function getProvider(market: Market): PaymentProvider {
  if (market === "us") return "paypal";
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

function providerError(provider: PaymentProvider, response: Response): never {
  // Provider payloads may contain buyer or transaction information. Keep logs
  // deliberately metadata-only and use the provider dashboard for diagnostics.
  console.error("Payment provider request failed", { provider, status: response.status });
  if (response.status === 401) {
    throw new PaymentProviderError(provider === "wompi"
      ? "Wompi rechazó la llave privada. Usa una llave prv_test_/prv_prod_ válida o configura Checkout Web con llave pública y WOMPI_INTEGRITY_SECRET."
      : "Mercado Pago rechazó la credencial. Verifica MERCADOPAGO_ACCESS_TOKEN en Vercel.");
  }
  throw new PaymentProviderError("La pasarela no pudo preparar el pago. Intenta nuevamente en unos minutos.");
}

function resultUrl(siteUrl: string, market: Market, provider: PaymentProvider, externalReference: string) {
  const url = new URL(market === "co" ? "/co/checkout/resultado" : "/us/checkout/result", `${siteUrl}/`);
  url.searchParams.set("provider", provider);
  url.searchParams.set("reference", externalReference);
  return url.toString();
}

function checkoutAmounts(items: CheckoutLineItem[], currency: StoreCurrency) {
  const productSubtotalCop = items.reduce((total, item) => total + item.unitPriceCop * item.quantity, 0);
  const shippingCostCop = items.reduce((total, item) => total + Math.round(item.shipping.selected.amountCop), 0);
  if (!Number.isSafeInteger(productSubtotalCop) || productSubtotalCop <= 0 || !Number.isSafeInteger(shippingCostCop) || shippingCostCop < 0) {
    throw new PaymentConfigurationError("El carrito o la cotización de envío no contiene valores válidos.");
  }
  const amountCop = productSubtotalCop + shippingCostCop;
  if (!Number.isSafeInteger(amountCop) || amountCop <= 0) throw new PaymentConfigurationError("El total del pedido no es válido.");
  const productSubtotal = currency === "COP"
    ? productSubtotalCop
    : Math.round(items.reduce((total, item) => total + item.unitPrice * item.quantity, 0) * 100) / 100;
  const shippingCost = currency === "COP"
    ? shippingCostCop
    : Math.round(items.reduce((total, item) => total + item.shipping.selected.amountUsd, 0) * 100) / 100;
  const amount = Math.round((productSubtotal + shippingCost) * (currency === "COP" ? 1 : 100)) / (currency === "COP" ? 1 : 100);
  if (!Number.isFinite(productSubtotal) || productSubtotal <= 0 || !Number.isFinite(shippingCost) || shippingCost < 0 || !Number.isFinite(amount) || amount <= 0) {
    throw new PaymentConfigurationError("El total localizado del pedido no es válido.");
  }
  return { productSubtotalCop, shippingCostCop, amountCop, productSubtotal, shippingCost, amount };
}

function checkoutExpiration(items: CheckoutLineItem[]) {
  const expirations = items.map((item) => new Date(item.shipping.quoteExpiresAt));
  if (!expirations.length || expirations.some((date) => Number.isNaN(date.getTime()) || date.getTime() <= Date.now())) {
    throw new PaymentConfigurationError("La cotización de envío venció. Vuelve a calcularla antes de pagar.");
  }
  return new Date(Math.min(...expirations.map((date) => date.getTime()))).toISOString();
}

export async function createHostedCheckout(
  items: CheckoutLineItem[],
  siteUrl: string,
  customerEmail: string,
  context: Pick<CheckoutSession, "market" | "locale" | "currency" | "exchangeRateCopPerUsd" | "rateUpdatedAt">,
  recordPreparedCheckout?: CheckoutPreparedRecorder,
): Promise<CheckoutSession> {
  if (!items.length) throw new PaymentConfigurationError("El carrito está vacío.");
  const provider = getProvider(context.market);
  // Wompi exige una referencia única por transacción. Checkout Web no crea un
  // recurso remoto al preparar esta URL, por lo que cada intento puede recibir
  // una referencia nueva sin duplicar cobros ni payment links en el proveedor.
  const uniqueFragment = randomUUID().replace(/-/g, "").slice(0, 24).toUpperCase();
  const externalReference = `NXR-CART-${uniqueFragment}`;
  const amounts = checkoutAmounts(items, context.currency);
  const preparedCheckout: CheckoutSession = {
    provider,
    checkoutUrl: "",
    externalReference,
    ...context,
    ...amounts,
    items,
  };
  // PayPal crea una orden remota. Su referencia, total, moneda, artículos y
  // entrega deben existir primero en el libro privado; si la persistencia
  // falla, no se llama a PayPal y no queda una orden financiera huérfana.
  if (provider === "paypal" && !recordPreparedCheckout) {
    throw new PaymentConfigurationError("The private order ledger is required before creating any PayPal order.");
  }
  if (recordPreparedCheckout) await recordPreparedCheckout(preparedCheckout);
  if (provider === "paypal") return createPayPalCheckout(items, siteUrl, externalReference, amounts, context);
  return provider === "wompi"
    ? createWompiCheckout(items, siteUrl, externalReference, customerEmail, amounts, context)
    : createMercadoPagoPreference(items, siteUrl, externalReference, customerEmail, amounts, context);
}

async function createWompiCheckout(items: CheckoutLineItem[], siteUrl: string, externalReference: string, customerEmail: string, amounts: ReturnType<typeof checkoutAmounts>, context: Pick<CheckoutSession, "market" | "locale" | "currency" | "exchangeRateCopPerUsd" | "rateUpdatedAt">): Promise<CheckoutSession> {
  const publicKey = getWompiPublicKey();
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET?.trim();
  // Checkout Web se construye localmente: preparar la URL no crea todavía una
  // transacción ni otro recurso remoto en Wompi.
  if (!publicKey) throw new PaymentConfigurationError("Falta NEXT_PUBLIC_WOMPI_PUBLIC_KEY para abrir el Checkout Web seguro de Wompi.");
  if (!integritySecret) throw new PaymentConfigurationError("Falta WOMPI_INTEGRITY_SECRET para firmar el Checkout Web de Wompi.");
  return createWompiWebCheckout(items, siteUrl, externalReference, publicKey, integritySecret, customerEmail, amounts, context);
}

function createWompiWebCheckout(items: CheckoutLineItem[], siteUrl: string, externalReference: string, publicKey: string, integritySecret: string, customerEmail: string, amounts: ReturnType<typeof checkoutAmounts>, context: Pick<CheckoutSession, "market" | "locale" | "currency" | "exchangeRateCopPerUsd" | "rateUpdatedAt">): CheckoutSession {
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
    "redirect-url": resultUrl(siteUrl, context.market, "wompi", externalReference),
    "expiration-time": expirationTime,
    // El correo se pide antes del redirect y sólo se usa para prellenar el
    // checkout seguro de Wompi; no se escribe en Git ni en logs de Nexora.
    "customer-data:email": customerEmail,
    // La dirección ya se verificó contra CJ para calcular el flete. No se la
    // pedimos dos veces en Wompi: evita que el comprador cambie el destino
    // después de firmar el total.
    "collect-shipping": "false",
  });
  return { provider: "wompi", checkoutUrl: `https://checkout.wompi.co/p/?${params.toString()}`, externalReference, ...context, ...amounts, items };
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

async function createMercadoPagoPreference(items: CheckoutLineItem[], siteUrl: string, externalReference: string, customerEmail: string, amounts: ReturnType<typeof checkoutAmounts>, context: Pick<CheckoutSession, "market" | "locale" | "currency" | "exchangeRateCopPerUsd" | "rateUpdatedAt">): Promise<CheckoutSession> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new PaymentConfigurationError("Falta MERCADOPAGO_ACCESS_TOKEN en la configuración del servidor.");
  const checkoutResultUrl = resultUrl(siteUrl, context.market, "mercadopago", externalReference);
  const notificationUrl = new URL("/api/payments/mercadopago/webhook", `${siteUrl}/`).toString();
  const expiresAt = checkoutExpiration(items);
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": externalReference },
    body: JSON.stringify({
      items: items.flatMap((item) => {
        const presentation = getProductPresentation(item.product);
        return [
          { id: item.product.sku, title: presentation.title, description: presentation.cardDescription, quantity: item.quantity, unit_price: item.unitPriceCop, currency_id: "COP" },
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
  if (!response.ok || !(payload?.init_point || payload?.sandbox_init_point)) providerError("mercadopago", response);
  return { provider: "mercadopago", checkoutUrl: payload.init_point || payload.sandbox_init_point!, externalReference, ...context, ...amounts, items };
}

async function createPayPalCheckout(
  items: CheckoutLineItem[],
  siteUrl: string,
  externalReference: string,
  amounts: ReturnType<typeof checkoutAmounts>,
  context: Pick<CheckoutSession, "market" | "locale" | "currency" | "exchangeRateCopPerUsd" | "rateUpdatedAt">,
): Promise<CheckoutSession> {
  if (context.market !== "us" || context.locale !== "en-US" || context.currency !== "USD") {
    throw new PaymentConfigurationError("PayPal is available only for the United States USD checkout.");
  }
  const destination = items[0]?.shipping;
  if (!destination || destination.countryCode !== "US") throw new PaymentConfigurationError("A verified United States shipping address is required.");
  const returnUrl = resultUrl(siteUrl, "us", "paypal", externalReference);
  const cancelUrl = new URL(returnUrl);
  cancelUrl.searchParams.set("cancelled", "1");
  let paypal;
  try {
    paypal = await createPayPalOrder({
      reference: externalReference,
      amount: amounts.amount,
      productSubtotal: amounts.productSubtotal,
      shippingCost: amounts.shippingCost,
      returnUrl,
      cancelUrl: cancelUrl.toString(),
      customer: {
        name: destination.recipientName,
        address1: destination.address1,
        address2: destination.address2,
        city: destination.city,
        region: destination.region,
        postalCode: destination.postalCode,
        countryCode: "US",
      },
    });
  } catch (error) {
    if (error instanceof PayPalConfigurationError) throw new PaymentConfigurationError(error.message);
    if (error instanceof PayPalProviderError) throw new PaymentProviderError(error.message);
    throw error;
  }
  return { provider: "paypal", checkoutUrl: paypal.checkoutUrl, externalReference, ...context, ...amounts, items };
}
