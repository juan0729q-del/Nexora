import "server-only";

import { createHash, createHmac, randomUUID } from "crypto";
import { estimateContribution, getFulfillmentReserveCop, usdToCop } from "@/lib/commerce-finance";
import { niches, type Product } from "@/lib/products";
import type { CheckoutSession } from "@/lib/payments/hosted-checkout";
import type { VerifiedWompiTransaction } from "@/lib/payments/webhooks";

type SalesLedgerConfiguration = {
  endpoint: URL;
  secret: string;
  timeoutMs: number;
};

type LedgerCustomer = { name?: string; email?: string; phone?: string };
type LedgerShipping = {
  recipient?: string;
  address1?: string;
  address2?: string;
  houseNumber?: string;
  city?: string;
  region?: string;
  country?: string;
  postalCode?: string;
  method?: string;
  carrier?: string;
  estimatedDelivery?: string;
  originCountryCode?: string;
  optionId?: string;
  quotedAt?: string;
};
type LedgerFinance = {
  orderTotalCop?: number;
  productSubtotalCop?: number;
  shippingChargedCop?: number;
  supplierShippingCostCop?: number;
  shippingQuoteUsd?: number;
  exchangeRateCopPerUsd?: number;
  supplierCostCop?: number;
  wompiFeeCop?: number;
  netPayoutCop?: number;
  contributionCop?: number;
  contributionMargin?: number;
};
type LedgerOrder = {
  id: string;
  reference: string;
  sku?: string;
  /** Variante exacta cotizada en CJ y elegida por el comprador. */
  variantSku?: string;
  variantLabel?: string;
  productName?: string;
  niche?: string;
  quantity?: number;
  currency?: "COP";
  customer?: LedgerCustomer;
  shipping?: LedgerShipping;
  finance?: LedgerFinance;
};
type LedgerPayment = {
  id?: string;
  status?: string;
  amountCop?: number;
  method?: string;
  updatedAt?: string;
};
type LedgerFulfillment = {
  status?: string;
  cjOrderId?: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  notes?: string;
  updatedAt?: string;
};

type LedgerEvent = {
  schemaVersion: 1;
  eventId: string;
  type: "checkout.created" | "payment.updated" | "fulfillment.updated";
  occurredAt: string;
  source: "nexora" | "wompi" | "cj";
  detail?: string;
  needsReview?: boolean;
  order: LedgerOrder;
  payment?: LedgerPayment;
  fulfillment?: LedgerFulfillment;
};

export type SalesLedgerOrder = {
  reference: string;
  createdAt: string;
  updatedAt: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  productName: string;
  productSku: string;
  variantSku: string;
  variantLabel: string | null;
  customerEmail: string | null;
  shippingSummary: string | null;
  grossAmountCop: number | null;
  wompiFeeCop: number | null;
  estimatedContributionCop: number | null;
  productSubtotalCop: number | null;
  shippingChargedCop: number | null;
  supplierShippingCostCop: number | null;
  shippingMethod: string | null;
  shippingEstimatedDelivery: string | null;
  shippingOriginCountryCode: string | null;
  shippingQuotedAt: string | null;
  needsReview: boolean;
};

export type SalesLedgerDailyMetric = {
  date: string;
  approvedOrders: number;
  grossRevenueCop: number;
};

export type SalesLedgerDashboard = {
  approvedOrders: number;
  grossRevenueCop: number;
  netPayoutCop: number;
  averageTicketCop: number;
  approvalRatePercent: number;
  pendingOrders: number;
  declinedOrders: number;
  fulfillmentPending: number;
  fulfillmentInTransit: number;
  shippingRevenueCop: number;
  supplierShippingCostCop: number;
  shippingMarginCop: number;
  contributionCop: number;
  recentOrders: SalesLedgerOrder[];
  dailySales: SalesLedgerDailyMetric[];
};

export class SalesLedgerError extends Error {}

function configuredTimeoutMs() {
  const value = Number(process.env.GOOGLE_SHEETS_REQUEST_TIMEOUT_MS || 8000);
  return Number.isFinite(value) ? Math.max(1000, Math.min(15000, Math.floor(value))) : 8000;
}

function getConfiguration(): SalesLedgerConfiguration | null {
  if (process.env.GOOGLE_SHEETS_SYNC_ENABLED?.trim().toLowerCase() === "false") return null;
  const rawEndpoint = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  const secret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET?.trim();
  if (!rawEndpoint || !secret) return null;

  try {
    const endpoint = new URL(rawEndpoint);
    if (endpoint.protocol !== "https:" || !endpoint.pathname.endsWith("/exec")) return null;
    return { endpoint, secret, timeoutMs: configuredTimeoutMs() };
  } catch {
    return null;
  }
}

export function getSalesLedgerStatus() {
  const configuration = getConfiguration();
  return {
    configured: Boolean(configuration),
    detail: configuration
      ? "Google Sheets privado está conectado mediante Apps Script firmado."
      : "Faltan GOOGLE_SHEETS_WEBHOOK_URL y/o GOOGLE_SHEETS_WEBHOOK_SECRET; Wompi seguirá siendo la fuente de pago, pero no se persistirán pedidos privados todavía.",
  };
}

function hmac(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("hex");
}

function nonSensitiveErrorMessage(status: number, response: unknown) {
  if (!response || typeof response !== "object") return `El registro privado respondió HTTP ${status}.`;
  const error = (response as { error?: unknown }).error;
  return typeof error === "string" && error.length < 180
    ? `El registro privado rechazó la operación: ${error}`
    : `El registro privado respondió HTTP ${status}.`;
}

async function fetchSigned<T>(endpoint: URL, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, { ...init, cache: "no-store", signal: controller.signal });
    const payload = await response.json().catch(() => null) as { ok?: unknown; data?: unknown } | null;
    if (!response.ok || payload?.ok !== true) throw new SalesLedgerError(nonSensitiveErrorMessage(response.status, payload));
    return payload.data as T;
  } catch (error) {
    if (error instanceof SalesLedgerError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new SalesLedgerError("El registro privado de ventas agotó el tiempo de respuesta.");
    throw new SalesLedgerError("No fue posible contactar el registro privado de ventas.");
  } finally {
    clearTimeout(timeout);
  }
}

async function send(event: LedgerEvent) {
  const configuration = getConfiguration();
  if (!configuration) throw new SalesLedgerError("El registro privado de ventas no está configurado.");
  const rawPayload = JSON.stringify(event);
  const timestamp = String(Math.floor(Date.now() / 1000));
  // Apps Script no expone encabezados HTTP en doPost. La envoltura mantiene la
  // firma fuera de la URL (evita que quede en historiales, logs o referers).
  const envelope = JSON.stringify({
    ts: timestamp,
    sig: hmac(`${timestamp}.${rawPayload}`, configuration.secret),
    payload: rawPayload,
  });
  return fetchSigned<{ reference?: string; paymentStatus?: string }>(configuration.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: envelope,
  }, configuration.timeoutMs);
}

function makeFinance({ checkout, supplierCostUsd, exchangeRateCopPerUsd }: {
  checkout: CheckoutSession;
  supplierCostUsd: number;
  exchangeRateCopPerUsd: number;
}): LedgerFinance {
  const supplierCostCop = usdToCop(supplierCostUsd, exchangeRateCopPerUsd);
  const supplierShippingCostCop = checkout.shippingCostCop;
  const estimate = estimateContribution({
    salePriceCop: checkout.amountCop,
    supplierCostCop: supplierCostCop + supplierShippingCostCop,
    fulfillmentReserveCop: getFulfillmentReserveCop(),
  });
  return {
    orderTotalCop: checkout.amountCop,
    productSubtotalCop: checkout.productSubtotalCop,
    shippingChargedCop: checkout.shippingCostCop,
    supplierShippingCostCop,
    shippingQuoteUsd: checkout.shipping.selected.amountUsd,
    exchangeRateCopPerUsd,
    supplierCostCop,
    wompiFeeCop: estimate.totalFeeCop,
    netPayoutCop: Math.round(checkout.amountCop - estimate.totalFeeCop),
    contributionCop: estimate.contributionCop,
    contributionMargin: estimate.contributionMarginPercent / 100,
  };
}

function productOrder(product: Product, reference: string, customer?: LedgerCustomer, shipping?: LedgerShipping, finance?: LedgerFinance, variant?: { sku: string; label?: string }): LedgerOrder {
  return {
    id: reference,
    reference,
    sku: product.sku,
    variantSku: variant?.sku,
    variantLabel: variant?.label,
    productName: product.name,
    niche: niches[product.niche].menuLabel,
    quantity: 1,
    currency: "COP",
    customer,
    shipping,
    finance,
  };
}

export function skuFromPaymentReference(reference: string) {
  const match = /^NXR-([A-Z0-9]+)-[A-Z0-9]+$/i.exec(reference.trim());
  return match?.[1]?.toUpperCase();
}

export function createCheckoutCreatedEvent(product: Product, checkout: CheckoutSession, pricing: { supplierCostUsd: number; exchangeRateCopPerUsd: number }): LedgerEvent {
  const selectedVariant = product.variants.find((variant) => variant.sku.toUpperCase() === checkout.shipping.selected.variantSku.toUpperCase());
  // El SKU se obtiene de la cotización firmada; la etiqueta sólo mejora la
  // lectura administrativa y nunca decide el artículo a despachar.
  const variant = {
    sku: checkout.shipping.selected.variantSku,
    label: selectedVariant?.options || selectedVariant?.label,
  };
  const shipping: LedgerShipping = {
    recipient: checkout.shipping.recipientName,
    address1: checkout.shipping.address1,
    address2: checkout.shipping.address2,
    houseNumber: checkout.shipping.houseNumber,
    city: checkout.shipping.city,
    region: checkout.shipping.region,
    country: checkout.shipping.countryCode,
    postalCode: checkout.shipping.postalCode,
    method: checkout.shipping.selected.method,
    carrier: checkout.shipping.selected.carrier || undefined,
    estimatedDelivery: checkout.shipping.selected.estimatedDelivery || undefined,
    originCountryCode: checkout.shipping.selected.sourceCountryCode,
    optionId: checkout.shipping.selected.id,
    quotedAt: checkout.shipping.selected.selectedAt,
  };
  return {
    schemaVersion: 1,
    eventId: `checkout:${checkout.externalReference}`,
    type: "checkout.created",
    occurredAt: new Date().toISOString(),
    source: "nexora",
    detail: "Checkout preparado; no representa una venta ni un pago aprobado.",
    order: productOrder(
      product,
      checkout.externalReference,
      { email: checkout.shipping.email, name: checkout.shipping.recipientName, phone: checkout.shipping.phone },
      shipping,
      makeFinance({ checkout, ...pricing }),
      variant,
    ),
    // Un checkout preparado no es un intento de pago ni una venta. Wompi
    // reemplaza este estado por PENDING/APPROVED/DECLINED cuando corresponda.
    payment: { status: "CHECKOUT_PREPARADO" },
    fulfillment: { status: "PENDIENTE DE PAGO" },
  };
}

function paymentCustomer(transaction: VerifiedWompiTransaction): LedgerCustomer {
  return {
    name: transaction.shippingAddress?.name,
    email: transaction.customerEmail,
    phone: transaction.shippingAddress?.phoneNumber,
  };
}

function paymentShipping(transaction: VerifiedWompiTransaction): LedgerShipping {
  const shipping = transaction.shippingAddress;
  if (!shipping) return {};
  return {
    recipient: shipping.name,
    address1: shipping.addressLine1,
    address2: shipping.addressLine2,
    city: shipping.city,
    region: shipping.region,
    country: shipping.country,
    postalCode: shipping.postalCode,
  };
}

function webhookTimestampToIso(timestamp: string) {
  const numeric = Number(timestamp);
  const milliseconds = timestamp.length > 10 ? numeric : numeric * 1000;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function createWompiTransactionUpdatedEvent(transaction: VerifiedWompiTransaction, product?: Product): LedgerEvent {
  const salePriceCop = Math.round(transaction.amountInCents / 100);
  const status = transaction.status.toUpperCase();
  // La conciliación final compara este monto con el total (producto + flete)
  // previamente firmado y registrado en el libro privado. Compararlo sólo con
  // el precio del catálogo marcaría erróneamente todo envío como discrepancia.
  const needsReview = !product || transaction.currency !== "COP";
  const eventFingerprint = createHash("sha256")
    .update([transaction.environment, transaction.id, status, transaction.webhookTimestamp].join("|"))
    .digest("hex")
    .slice(0, 24);
  return {
    schemaVersion: 1,
    // Idempotencia por notificación exacta, incluso si cambia el estado de una
    // misma transacción. No revela el ID de la transacción en el identificador.
    eventId: `wompi:${transaction.environment}:${eventFingerprint}`,
    type: "payment.updated",
    occurredAt: transaction.finalizedAt || transaction.createdAt || webhookTimestampToIso(transaction.webhookTimestamp),
    source: "wompi",
    detail: needsReview
      ? "Pago validado, pero requiere revisión: producto, moneda o monto no conciliado con el catálogo."
      : "Evento validado mediante la firma oficial de Wompi y conciliado con el catálogo.",
    needsReview,
    order: product
      ? productOrder(product, transaction.reference, paymentCustomer(transaction), paymentShipping(transaction))
      : { id: transaction.reference, reference: transaction.reference, currency: "COP", customer: paymentCustomer(transaction), shipping: paymentShipping(transaction) },
    payment: {
      id: transaction.id,
      status,
      amountCop: salePriceCop,
      method: transaction.paymentMethodType,
      updatedAt: transaction.finalizedAt || transaction.createdAt || webhookTimestampToIso(transaction.webhookTimestamp),
    },
    fulfillment: { status: needsReview ? "REVISIÓN DE PAGO" : status === "APPROVED" ? "PAGO CONFIRMADO" : "PENDIENTE DE PAGO" },
  };
}

export async function recordCheckoutCreated(product: Product, checkout: CheckoutSession, pricing: { supplierCostUsd: number; exchangeRateCopPerUsd: number }) {
  return send(createCheckoutCreatedEvent(product, checkout, pricing));
}

export async function recordWompiTransaction(transaction: VerifiedWompiTransaction, product?: Product) {
  return send(createWompiTransactionUpdatedEvent(transaction, product));
}

export async function updateFulfillment({
  reference,
  fulfillmentStatus,
  cjOrderId,
  carrier,
  trackingNumber,
  trackingUrl,
  note,
}: {
  reference: string;
  fulfillmentStatus: string;
  cjOrderId?: string;
  carrier?: string;
  trackingNumber?: string;
  trackingUrl?: string;
  note?: string;
}) {
  const event: LedgerEvent = {
    schemaVersion: 1,
    eventId: `fulfillment:${reference}:${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    type: "fulfillment.updated",
    occurredAt: new Date().toISOString(),
    source: "nexora",
    detail: note?.trim().slice(0, 600),
    order: { id: reference, reference, currency: "COP" },
    fulfillment: {
      status: fulfillmentStatus.trim().slice(0, 100),
      cjOrderId: cjOrderId?.trim().slice(0, 140),
      carrier: carrier?.trim().slice(0, 120),
      trackingNumber: trackingNumber?.trim().slice(0, 160),
      trackingUrl: trackingUrl?.trim().slice(0, 500),
      notes: note?.trim().slice(0, 1000),
      updatedAt: new Date().toISOString(),
    },
  };
  return send(event);
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseOrder(value: unknown): SalesLedgerOrder | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const reference = stringValue(row.reference);
  if (!reference) return null;
  return {
    reference,
    createdAt: stringValue(row.createdAt),
    updatedAt: stringValue(row.updatedAt),
    paymentStatus: stringValue(row.paymentStatus) || "PENDING",
    fulfillmentStatus: stringValue(row.fulfillmentStatus) || "PENDIENTE",
    productName: stringValue(row.productName) || "Producto Nexora",
    productSku: stringValue(row.productSku),
    variantSku: stringValue(row.variantSku),
    variantLabel: nullableString(row.variantLabel),
    customerEmail: nullableString(row.customerEmail),
    shippingSummary: nullableString(row.shippingSummary),
    grossAmountCop: typeof row.grossAmountCop === "number" && Number.isFinite(row.grossAmountCop) ? row.grossAmountCop : null,
    wompiFeeCop: typeof row.wompiFeeCop === "number" && Number.isFinite(row.wompiFeeCop) ? row.wompiFeeCop : null,
    estimatedContributionCop: typeof row.estimatedContributionCop === "number" && Number.isFinite(row.estimatedContributionCop) ? row.estimatedContributionCop : null,
    productSubtotalCop: typeof row.productSubtotalCop === "number" && Number.isFinite(row.productSubtotalCop) ? row.productSubtotalCop : null,
    shippingChargedCop: typeof row.shippingChargedCop === "number" && Number.isFinite(row.shippingChargedCop) ? row.shippingChargedCop : null,
    supplierShippingCostCop: typeof row.supplierShippingCostCop === "number" && Number.isFinite(row.supplierShippingCostCop) ? row.supplierShippingCostCop : null,
    shippingMethod: nullableString(row.shippingMethod),
    shippingEstimatedDelivery: nullableString(row.shippingEstimatedDelivery),
    shippingOriginCountryCode: nullableString(row.shippingOriginCountryCode),
    shippingQuotedAt: nullableString(row.shippingQuotedAt),
    needsReview: row.needsReview === true,
  };
}

function parseDailyMetric(value: unknown): SalesLedgerDailyMetric | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const date = stringValue(row.date);
  if (!date) return null;
  return { date, approvedOrders: finiteNumber(row.approvedOrders), grossRevenueCop: finiteNumber(row.grossRevenueCop) };
}

function parseDashboard(value: unknown): SalesLedgerDashboard | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  const summary = payload.summary && typeof payload.summary === "object" ? payload.summary as Record<string, unknown> : payload;
  const recentOrders = Array.isArray(payload.recentOrders) ? payload.recentOrders.map(parseOrder).filter((order): order is SalesLedgerOrder => Boolean(order)) : [];
  const dailySales = Array.isArray(payload.dailySales) ? payload.dailySales.map(parseDailyMetric).filter((metric): metric is SalesLedgerDailyMetric => Boolean(metric)) : [];
  return {
    approvedOrders: finiteNumber(summary.approvedOrders),
    grossRevenueCop: finiteNumber(summary.grossRevenueCop),
    netPayoutCop: finiteNumber(summary.netPayoutCop),
    averageTicketCop: finiteNumber(summary.averageTicketCop),
    approvalRatePercent: finiteNumber(summary.approvalRatePercent),
    pendingOrders: finiteNumber(summary.pendingOrders),
    declinedOrders: finiteNumber(summary.declinedOrders),
    fulfillmentPending: finiteNumber(summary.fulfillmentPending),
    fulfillmentInTransit: finiteNumber(summary.fulfillmentInTransit),
    shippingRevenueCop: finiteNumber(summary.shippingRevenueCop),
    supplierShippingCostCop: finiteNumber(summary.supplierShippingCostCop),
    shippingMarginCop: finiteNumber(summary.shippingMarginCop),
    contributionCop: finiteNumber(summary.contributionCop),
    recentOrders,
    dailySales,
  };
}

/** Lee sólo desde una página administrativa autenticada; nunca desde el navegador público. */
export async function getPersistedSalesDashboard() {
  const configuration = getConfiguration();
  if (!configuration) return null;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const payload = JSON.stringify({ action: "admin.read" });
  const envelope = JSON.stringify({
    ts: timestamp,
    sig: hmac(`${timestamp}.${payload}`, configuration.secret),
    payload,
  });
  const result = await fetchSigned<unknown>(configuration.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: envelope,
  }, configuration.timeoutMs);
  return parseDashboard(result);
}

/** Verificación sin escribir pedidos ni clientes. */
export async function checkSalesLedgerHealth() {
  try {
    const dashboard = await getPersistedSalesDashboard();
    return dashboard ? { ok: true, detail: "Registro privado disponible." } : { ok: false, detail: "Registro privado no configurado." };
  } catch {
    return { ok: false, detail: "No fue posible verificar el registro privado." };
  }
}
