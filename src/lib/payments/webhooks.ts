import "server-only";

import { createHash, timingSafeEqual } from "crypto";

type WompiWebhook = {
  event?: string;
  data?: Record<string, unknown>;
  signature?: { properties?: string[]; checksum?: string };
  timestamp?: number | string;
};

function nestedValue(value: unknown, path: string) {
  return path.split(".").reduce<unknown>((current, segment) => current && typeof current === "object" ? (current as Record<string, unknown>)[segment] : undefined, value);
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyWompiWebhook(payload: unknown) {
  const eventSecret = process.env.WOMPI_EVENT_SECRET?.trim();
  const webhook = payload as WompiWebhook;
  const properties = webhook.signature?.properties;
  const checksum = webhook.signature?.checksum;
  if (!eventSecret) return { ok: false as const, reason: "WOMPI_EVENT_SECRET no está configurado." };
  if (!webhook.data || !Array.isArray(properties) || !checksum || webhook.timestamp === undefined) return { ok: false as const, reason: "Evento Wompi incompleto." };
  const source = `${properties.map((property) => String(nestedValue(webhook.data, property) ?? "")).join("")}${webhook.timestamp}${eventSecret}`;
  const expected = createHash("sha256").update(source).digest("hex");
  if (!safeEqual(expected, checksum)) return { ok: false as const, reason: "Firma Wompi inválida." };

  const transaction = nestedValue(webhook.data, "transaction") as Record<string, unknown> | undefined;
  return {
    ok: true as const,
    event: webhook.event || "unknown",
    transactionId: typeof transaction?.id === "string" ? transaction.id : undefined,
    reference: typeof transaction?.reference === "string" ? transaction.reference : undefined,
    status: typeof transaction?.status === "string" ? transaction.status : undefined,
  };
}

export function mercadoPagoPaymentId(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as { data?: { id?: unknown }; id?: unknown };
  const id = value.data?.id ?? value.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
}
