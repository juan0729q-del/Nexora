import "server-only";
import { randomUUID } from "crypto";
import type { Product } from "@/lib/products";

type Provider = "wompi" | "mercadopago";
export type CheckoutSession = { provider: Provider; checkoutUrl: string; externalReference: string };

export class PaymentConfigurationError extends Error {}
export class PaymentProviderError extends Error {}

function getProvider(): Provider {
  const selected = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();
  if (selected === "wompi" || selected === "mercadopago") return selected;
  if (process.env.WOMPI_PRIVATE_KEY) return "wompi";
  if (process.env.MERCADOPAGO_ACCESS_TOKEN) return "mercadopago";
  throw new PaymentConfigurationError("No hay una pasarela de pago configurada.");
}

function getWompiBaseUrl(privateKey: string) {
  const isSandboxKey = privateKey.startsWith("prv_test_");
  const expectedUrl = isSandboxKey ? "https://sandbox.wompi.co" : "https://production.wompi.co";
  const configuredUrl = process.env.WOMPI_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!configuredUrl) return expectedUrl;
  const configuredSandbox = configuredUrl.includes("sandbox.wompi.co");
  if (configuredSandbox !== isSandboxKey) {
    // Una llave test contra producción (o inversa) devuelve INVALID_ACCESS_TOKEN.
    console.warn("Wompi API base URL does not match the key environment; using matching endpoint.");
    return expectedUrl;
  }
  return configuredUrl;
}

function providerError(provider: Provider, response: Response, payload: unknown): never {
  console.error("Payment provider request failed", { provider, status: response.status, payload });
  if (response.status === 401) {
    throw new PaymentProviderError(provider === "wompi"
      ? "Wompi rechazó la credencial. Verifica WOMPI_PRIVATE_KEY y que pertenezca al mismo ambiente (pruebas o producción)."
      : "Mercado Pago rechazó la credencial. Verifica MERCADOPAGO_ACCESS_TOKEN en Vercel.");
  }
  throw new PaymentProviderError("La pasarela no pudo preparar el pago. Intenta nuevamente en unos minutos.");
}

export async function createHostedCheckout(product: Product, siteUrl: string): Promise<CheckoutSession> {
  const provider = getProvider();
  const externalReference = `NX-${product.sku}-${randomUUID()}`;
  return provider === "wompi" ? createWompiPaymentLink(product, siteUrl, externalReference) : createMercadoPagoPreference(product, siteUrl, externalReference);
}

async function createWompiPaymentLink(product: Product, siteUrl: string, externalReference: string): Promise<CheckoutSession> {
  const privateKey = process.env.WOMPI_PRIVATE_KEY?.trim();
  if (!privateKey) throw new PaymentConfigurationError("Falta WOMPI_PRIVATE_KEY en la configuración del servidor.");
  const response = await fetch(`${getWompiBaseUrl(privateKey)}/v1/payment_links`, {
    method: "POST",
    headers: { Authorization: `Bearer ${privateKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: `Nexora — ${product.name}`, description: product.description, single_use: true, collect_shipping: true, currency: "COP", amount_in_cents: product.price * 100, sku: externalReference, redirect_url: `${siteUrl}/checkout/resultado?provider=wompi` }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { data?: { id?: string } } | null;
  if (!response.ok || !payload?.data?.id) providerError("wompi", response, payload);
  return { provider: "wompi", checkoutUrl: `https://checkout.wompi.co/l/${payload.data.id}`, externalReference };
}

async function createMercadoPagoPreference(product: Product, siteUrl: string, externalReference: string): Promise<CheckoutSession> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) throw new PaymentConfigurationError("Falta MERCADOPAGO_ACCESS_TOKEN en la configuración del servidor.");
  const resultUrl = `${siteUrl}/checkout/resultado?provider=mercadopago`;
  const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "X-Idempotency-Key": externalReference },
    body: JSON.stringify({ items: [{ id: product.sku, title: product.name, description: product.description, quantity: 1, unit_price: product.price, currency_id: "COP" }], external_reference: externalReference, back_urls: { success: resultUrl, failure: resultUrl, pending: resultUrl }, auto_return: "approved" }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as { init_point?: string; sandbox_init_point?: string } | null;
  if (!response.ok || !(payload?.init_point || payload?.sandbox_init_point)) providerError("mercadopago", response, payload);
  return { provider: "mercadopago", checkoutUrl: payload.init_point || payload.sandbox_init_point!, externalReference };
}
