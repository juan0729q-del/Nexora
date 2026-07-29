import "server-only";

import { createHash, randomUUID } from "crypto";
import { getProductPresentation } from "@/lib/product-presentation";
import type { Product } from "@/lib/products";

export type PaymentProvider = "wompi" | "mercadopago";
export type CheckoutSession = { provider: PaymentProvider; checkoutUrl: string; externalReference: string };

export class PaymentConfigurationError extends Error {}
export class PaymentProviderError extends Error {}

function getProvider(): PaymentProvider {
  const selected = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();
  if (selected === "wompi" || selected === "mercadopago") return selected;
  if (getWompiPublicKey() || process.env.WOMPI_PRIVATE_KEY) return "wompi";
  if (process.env.MERCADOPAGO_ACCESS_TOKEN) return "mercadopago";
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

export async function createHostedCheckout(product: Product, siteUrl: string): Promise<CheckoutSession> {
  const provider = getProvider();
  // Los links de pago de Wompi limitan sku a 36 caracteres. Usamos la misma
  // referencia corta y única en ambos flujos para que la conciliación posterior
  // pueda correlacionar el pago sin que el proveedor rechace el checkout.
  const skuFragment = product.sku.replace(/[^a-zA-Z0-9]/g, "").slice(-12).toUpperCase() || "PRODUCTO";
  const uniqueFragment = randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
  const externalReference = `NX-${skuFragment}-${uniqueFragment}`;
  return provider === "wompi"
    ? createWompiCheckout(product, siteUrl, externalReference)
    : createMercadoPagoPreference(product, siteUrl, externalReference);
}

async function createWompiCheckout(product: Product, siteUrl: string, externalReference: string): Promise<CheckoutSession> {
  const publicKey = getWompiPublicKey();
  const integritySecret = process.env.WOMPI_INTEGRITY_SECRET?.trim();
  if (publicKey) {
    if (!integritySecret) throw new PaymentConfigurationError("Falta WOMPI_INTEGRITY_SECRET para firmar el Checkout Web de Wompi.");
    return createWompiWebCheckout(product, siteUrl, externalReference, publicKey, integritySecret);
  }
  return createWompiPaymentLink(product, siteUrl, externalReference);
}

function createWompiWebCheckout(product: Product, siteUrl: string, externalReference: string, publicKey: string, integritySecret: string): CheckoutSession {
  const amountInCents = Math.round(product.price * 100);
  const integrity = createHash("sha256").update(`${externalReference}${amountInCents}COP${integritySecret}`).digest("hex");
  const params = new URLSearchParams({
    "public-key": publicKey,
    currency: "COP",
    "amount-in-cents": String(amountInCents),
    reference: externalReference,
    "signature:integrity": integrity,
    "redirect-url": resultUrl(siteUrl, "wompi", externalReference),
    // Wompi muestra su formulario seguro de dirección y teléfono de envío.
    // Nexora no recopila ni guarda estos datos en el storefront.
    "collect-shipping": "true",
  });
  return { provider: "wompi", checkoutUrl: `https://checkout.wompi.co/p/?${params.toString()}`, externalReference };
}

async function createWompiPaymentLink(product: Product, siteUrl: string, externalReference: string): Promise<CheckoutSession> {
  const privateKey = process.env.WOMPI_PRIVATE_KEY?.trim();
  if (!privateKey || !privateKey.startsWith("prv_")) throw new PaymentConfigurationError("Configura WOMPI_PRIVATE_KEY (prv_test_/prv_prod_) o NEXT_PUBLIC_WOMPI_PUBLIC_KEY junto a WOMPI_INTEGRITY_SECRET.");
  const presentation = getProductPresentation(product);
  const response = await fetch(`${getWompiBaseUrl(privateKey)}/v1/payment_links`, {
    method: "POST",
    headers: { Authorization: `Bearer ${privateKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Nexora — ${presentation.title}`,
      description: presentation.cardDescription,
      single_use: true,
      collect_shipping: true,
      currency: "COP",
      amount_in_cents: Math.round(product.price * 100),
      sku: externalReference,
      redirect_url: resultUrl(siteUrl, "wompi", externalReference),
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { data?: { id?: string } } | null;
  if (!response.ok || !payload?.data?.id) providerError("wompi", response, payload);
  return { provider: "wompi", checkoutUrl: `https://checkout.wompi.co/l/${payload.data.id}`, externalReference };
}

async function createMercadoPagoPreference(product: Product, siteUrl: string, externalReference: string): Promise<CheckoutSession> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new PaymentConfigurationError("Falta MERCADOPAGO_ACCESS_TOKEN en la configuración del servidor.");
  const checkoutResultUrl = resultUrl(siteUrl, "mercadopago", externalReference);
  const notificationUrl = new URL("/api/payments/mercadopago/webhook", `${siteUrl}/`).toString();
  const presentation = getProductPresentation(product);
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": externalReference },
    body: JSON.stringify({
      items: [{ id: product.sku, title: presentation.title, description: presentation.cardDescription, quantity: 1, unit_price: product.price, currency_id: "COP" }],
      external_reference: externalReference,
      back_urls: { success: checkoutResultUrl, failure: checkoutResultUrl, pending: checkoutResultUrl },
      notification_url: notificationUrl,
      auto_return: "approved",
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { init_point?: string; sandbox_init_point?: string } | null;
  if (!response.ok || !(payload?.init_point || payload?.sandbox_init_point)) providerError("mercadopago", response, payload);
  return { provider: "mercadopago", checkoutUrl: payload.init_point || payload.sandbox_init_point!, externalReference };
}
