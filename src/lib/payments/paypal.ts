import "server-only";

import { buildPayPalOrderPayload, parsePayPalOrder, paypalApiBase, paypalCheckoutHosts, type PayPalEnvironment, type PayPalOrderInput, type VerifiedPayPalCapture } from "./paypal-core";

export class PayPalConfigurationError extends Error {}
export class PayPalProviderError extends Error {}

export type PayPalConfiguration = {
  clientId: string;
  clientSecret: string;
  webhookId: string;
  environment: PayPalEnvironment;
  apiBase: string;
};

function enabled() {
  return process.env.PAYPAL_CHECKOUT_ENABLED?.trim().toLowerCase() === "true";
}

export function getPayPalConfiguration(): PayPalConfiguration | null {
  if (!enabled()) return null;
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim();
  const environment = process.env.PAYPAL_ENVIRONMENT?.trim().toLowerCase();
  if (!clientId || !clientSecret || !webhookId || !["sandbox", "live"].includes(environment || "")) return null;
  return { clientId, clientSecret, webhookId, environment: environment as PayPalEnvironment, apiBase: paypalApiBase(environment as PayPalEnvironment) };
}

async function accessToken(configuration: PayPalConfiguration) {
  const credentials = Buffer.from(`${configuration.clientId}:${configuration.clientSecret}`, "utf8").toString("base64");
  const response = await fetch(`${configuration.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = await response.json().catch(() => null) as { access_token?: unknown } | null;
  if (!response.ok || typeof payload?.access_token !== "string") {
    console.error("PayPal OAuth failed", { status: response.status, environment: configuration.environment });
    throw new PayPalProviderError("PayPal could not authenticate the store. No charge was attempted.");
  }
  return payload.access_token;
}

async function paypalFetch(path: string, init: RequestInit, configuration = getPayPalConfiguration()) {
  if (!configuration) throw new PayPalConfigurationError("PayPal is not fully configured. Client ID, secret, webhook ID, environment, and the checkout switch are required.");
  const token = await accessToken(configuration);
  const response = await fetch(`${configuration.apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  return { response, configuration };
}

export async function createPayPalOrder(input: PayPalOrderInput) {
  const { response, configuration } = await paypalFetch("/v2/checkout/orders", {
    method: "POST",
    headers: { "PayPal-Request-Id": input.reference },
    body: JSON.stringify(buildPayPalOrderPayload(input)),
  });
  const payload = await response.json().catch(() => null) as { id?: unknown; links?: unknown } | null;
  const links = Array.isArray(payload?.links) ? payload.links : [];
  const approval = links.find((link) => link && typeof link === "object" && ["payer-action", "approve"].includes(String((link as Record<string, unknown>).rel))) as Record<string, unknown> | undefined;
  let approvalUrl: URL | null = null;
  try { approvalUrl = typeof approval?.href === "string" ? new URL(approval.href) : null; } catch { approvalUrl = null; }
  const trustedHost = approvalUrl?.protocol === "https:" && paypalCheckoutHosts(configuration.environment).includes(approvalUrl.hostname);
  if (!response.ok || typeof payload?.id !== "string" || !approvalUrl || !trustedHost) {
    console.error("PayPal order creation failed", { status: response.status });
    throw new PayPalProviderError("PayPal could not prepare the secure checkout. No charge was attempted.");
  }
  return { orderId: payload.id, checkoutUrl: approvalUrl.toString() };
}

export async function queryPayPalOrder(
  orderId: string,
  source: VerifiedPayPalCapture["verificationSource"] = "order-query",
) {
  const { response } = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}`, { method: "GET" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new PayPalProviderError("PayPal could not confirm this order yet.");
  return parsePayPalOrder(payload, source);
}

export async function capturePayPalOrder(orderId: string) {
  const { response } = await paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers: { "PayPal-Request-Id": `capture-${orderId}` },
    body: "{}",
  });
  const payload = await response.json().catch(() => null);
  if (response.ok) return parsePayPalOrder(payload, "capture");
  if (response.status === 422) return queryPayPalOrder(orderId, "order-query");
  console.error("PayPal capture failed", { status: response.status });
  throw new PayPalProviderError("PayPal has not confirmed this payment yet.");
}

export async function verifyPayPalWebhook(headers: Headers, event: unknown) {
  const configuration = getPayPalConfiguration();
  if (!configuration) throw new PayPalConfigurationError("PayPal webhook verification is not configured.");
  const required = {
    auth_algo: headers.get("paypal-auth-algo"),
    cert_url: headers.get("paypal-cert-url"),
    transmission_id: headers.get("paypal-transmission-id"),
    transmission_sig: headers.get("paypal-transmission-sig"),
    transmission_time: headers.get("paypal-transmission-time"),
  };
  if (Object.values(required).some((value) => !value)) throw new PayPalProviderError("Missing PayPal webhook signature headers.");
  const { response } = await paypalFetch("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({ ...required, webhook_id: configuration.webhookId, webhook_event: event }),
  }, configuration);
  const payload = await response.json().catch(() => null) as { verification_status?: unknown } | null;
  return response.ok && payload?.verification_status === "SUCCESS";
}

export function parsePayPalWebhookCapture(event: unknown) {
  if (!event || typeof event !== "object") return null;
  const envelope = event as Record<string, unknown>;
  if (envelope.event_type !== "PAYMENT.CAPTURE.COMPLETED") return null;
  const resource = envelope.resource && typeof envelope.resource === "object" ? envelope.resource as Record<string, unknown> : null;
  const amountObject = resource?.amount && typeof resource.amount === "object" ? resource.amount as Record<string, unknown> : null;
  const supplementary = resource?.supplementary_data && typeof resource.supplementary_data === "object" ? resource.supplementary_data as Record<string, unknown> : null;
  const related = supplementary?.related_ids && typeof supplementary.related_ids === "object" ? supplementary.related_ids as Record<string, unknown> : null;
  const orderId = typeof related?.order_id === "string" ? related.order_id : "";
  const reference = typeof resource?.custom_id === "string" ? resource.custom_id : "";
  const captureId = typeof resource?.id === "string" ? resource.id : "";
  const amount = Number(amountObject?.value);
  const currency = amountObject?.currency_code;
  if (!orderId || !reference || !captureId || currency !== "USD" || !Number.isFinite(amount) || amount <= 0) return null;
  return { orderId, captureId, reference, status: "APPROVED", amount, currency: "USD", updatedAt: typeof resource?.update_time === "string" ? resource.update_time : new Date().toISOString(), verificationSource: "webhook" } satisfies VerifiedPayPalCapture;
}
