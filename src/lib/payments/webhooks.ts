import "server-only";

import { createHash, timingSafeEqual } from "crypto";

type WompiWebhook = {
  event?: string;
  data?: Record<string, unknown>;
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number | string;
  environment?: string;
};

export type WompiShippingAddress = {
  name?: string;
  phoneNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  region?: string;
  country?: string;
  postalCode?: string;
};

/** Campos permitidos para el registro privado; nunca se reenvía el payload completo de Wompi. */
export type VerifiedWompiTransaction = {
  id: string;
  reference: string;
  status: string;
  amountInCents: number;
  currency: string;
  customerEmail?: string;
  paymentMethodType?: string;
  paymentLinkId?: string;
  createdAt?: string;
  finalizedAt?: string;
  shippingAddress?: WompiShippingAddress;
  /** Entorno declarado y firmado por Wompi: test o prod. */
  environment: "test" | "prod";
  /** Timestamp del evento firmado; se usa sólo para idempotencia. */
  webhookTimestamp: string;
  /** Fuente oficial usada para verificar la transacción. */
  verificationSource: "webhook" | "api";
};

function nestedValue(value: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => current && typeof current === "object" ? (current as Record<string, unknown>)[segment] : undefined, value);
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function stringValue(value: unknown, maximum = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined;
}

function finiteNumber(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
}

function addressValue(value: unknown): WompiShippingAddress | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const address = {
    name: stringValue(source.name, 180),
    phoneNumber: stringValue(source.phone_number ?? source.phoneNumber, 60),
    addressLine1: stringValue(source.address_line_1 ?? source.addressLine1, 300),
    addressLine2: stringValue(source.address_line_2 ?? source.addressLine2, 300),
    city: stringValue(source.city, 120),
    region: stringValue(source.region ?? source.state, 120),
    country: stringValue(source.country, 80),
    postalCode: stringValue(source.postal_code ?? source.postalCode, 40),
  };
  return Object.values(address).some(Boolean) ? address : undefined;
}

function transactionFrom(data: Record<string, unknown>, environment: "test" | "prod", webhookTimestamp: string): VerifiedWompiTransaction | null {
  const raw = nestedValue(data, "transaction");
  if (!raw || typeof raw !== "object") return null;
  const transaction = raw as Record<string, unknown>;
  const id = stringValue(transaction.id, 140);
  const reference = stringValue(transaction.reference, 140);
  const status = stringValue(transaction.status, 40)?.toUpperCase();
  const amountInCents = finiteNumber(transaction.amount_in_cents ?? transaction.amountInCents);
  const currency = stringValue(transaction.currency, 8)?.toUpperCase();
  if (!id || !reference || !status || amountInCents === undefined || !Number.isInteger(amountInCents) || amountInCents <= 0 || !currency) return null;
  return {
    id,
    reference,
    status,
    amountInCents: Math.round(amountInCents),
    currency,
    customerEmail: stringValue(transaction.customer_email ?? transaction.customerEmail, 254),
    paymentMethodType: stringValue(transaction.payment_method_type ?? transaction.paymentMethodType, 120),
    paymentLinkId: stringValue(transaction.payment_link_id ?? transaction.paymentLinkId, 140),
    createdAt: stringValue(transaction.created_at ?? transaction.createdAt, 80),
    finalizedAt: stringValue(transaction.finalized_at ?? transaction.finalizedAt, 80),
    shippingAddress: addressValue(transaction.shipping_address ?? transaction.shippingAddress),
    environment,
    webhookTimestamp,
    verificationSource: "webhook",
  };
}

function expectedWompiEnvironment(): "test" | "prod" {
  const explicit = process.env.WOMPI_EVENT_ENVIRONMENT?.trim().toLowerCase();
  if (explicit === "test" || explicit === "prod") return explicit;

  const configuredKey = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY?.trim()
    || process.env.WOMPI_PUBLIC_KEY?.trim()
    || process.env.WOMPI_PRIVATE_KEY?.trim();
  return configuredKey?.startsWith("pub_test_") || configuredKey?.startsWith("prv_test_") ? "test" : "prod";
}

const allowedTransactionStatuses = new Set(["PENDING", "APPROVED", "DECLINED", "VOIDED", "ERROR"]);

export function verifyWompiWebhook(payload: unknown):
  | { ok: false; reason: string }
  | { ok: true; event: string; transaction: VerifiedWompiTransaction } {
  const eventSecret = process.env.WOMPI_EVENT_SECRET?.trim();
  const webhook = payload as WompiWebhook;
  const properties = webhook.signature?.properties;
  const checksum = webhook.signature?.checksum;
  if (!eventSecret) return { ok: false, reason: "WOMPI_EVENT_SECRET no está configurado." };
  if (!webhook.data || !Array.isArray(properties) || !properties.every((property) => typeof property === "string") || !checksum || webhook.timestamp === undefined) return { ok: false, reason: "Evento Wompi incompleto." };
  const webhookEvent = typeof webhook.event === "string" ? webhook.event.trim() : "";
  if (webhookEvent !== "transaction.updated") return { ok: false, reason: "Tipo de evento Wompi no permitido." };
  const timestamp = String(webhook.timestamp).trim();
  if (!/^\d{10,16}$/.test(timestamp)) return { ok: false, reason: "Timestamp Wompi inválido." };
  const environment = typeof webhook.environment === "string" ? webhook.environment.trim().toLowerCase() : "";
  if (environment !== "test" && environment !== "prod") return { ok: false, reason: "Entorno Wompi inválido." };
  if (environment !== expectedWompiEnvironment()) return { ok: false, reason: "El entorno del evento Wompi no coincide con el checkout activo." };
  const normalizedChecksum = checksum.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedChecksum)) return { ok: false, reason: "Checksum Wompi inválido." };
  const source = `${properties.map((property) => String(nestedValue(webhook.data, property) ?? "")).join("")}${webhook.timestamp}${eventSecret}`;
  const expected = createHash("sha256").update(source).digest("hex");
  if (!safeEqual(expected, normalizedChecksum)) return { ok: false, reason: "Firma Wompi inválida." };

  const transaction = transactionFrom(webhook.data, environment, timestamp);
  if (!transaction) return { ok: false, reason: "Transacción Wompi incompleta." };
  if (transaction.currency !== "COP") return { ok: false, reason: "Moneda de transacción Wompi no permitida." };
  if (!allowedTransactionStatuses.has(transaction.status)) return { ok: false, reason: "Estado de transacción Wompi no permitido." };
  return { ok: true, event: webhookEvent, transaction };
}

export function mercadoPagoPaymentId(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as { data?: { id?: unknown }; id?: unknown };
  const id = value.data?.id ?? value.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
}
