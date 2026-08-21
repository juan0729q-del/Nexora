import "server-only";

import { createHash, createHmac, randomUUID } from "crypto";
import { estimateContribution, getFulfillmentReserveCop, usdToCop } from "@/lib/commerce-finance";
import { getProductPresentation } from "@/lib/product-presentation";
import { niches, type Product } from "@/lib/products";
import type { CheckoutSession } from "@/lib/payments/hosted-checkout";
import type { VerifiedWompiTransaction } from "@/lib/payments/webhooks";
import { paypalCaptureEventId, type VerifiedPayPalCapture } from "@/lib/payments/paypal-core";
import type { IntelligenceEvent, IntelligenceEventSummary, IntelligenceProposal } from "@/lib/intelligence/types";

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
  district?: string;
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
  orderTotal?: number;
  productSubtotal?: number;
  shippingCharged?: number;
  supplierShippingCost?: number;
  supplierCost?: number;
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
type LedgerOrderItem = {
  sku: string;
  variantSku: string;
  /** Identificador oficial de la variante CJ; nunca se expone al cliente. */
  providerVariantId?: string;
  variantLabel?: string;
  productName: string;
  niche: string;
  quantity: number;
  unitPriceCop: number;
  subtotalCop: number;
  unitPrice: number;
  subtotal: number;
  currency: "COP" | "USD";
  supplierCostUsd: number;
  shippingMethod: string;
  shippingCarrier?: string;
  shippingEstimatedDelivery?: string;
  shippingOriginCountryCode: string;
  shippingOptionId: string;
  shippingCostCop: number;
  shippingCost: number;
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
  market?: "co" | "us";
  locale?: "es-CO" | "en-US";
  currency?: "COP" | "USD";
  exchangeRateCopPerUsd?: number;
  rateUpdatedAt?: string;
  customer?: LedgerCustomer;
  shipping?: LedgerShipping;
  finance?: LedgerFinance;
  items?: LedgerOrderItem[];
};
type LedgerPayment = {
  id?: string;
  status?: string;
  amountCop?: number;
  amount?: number;
  currency?: "COP" | "USD";
  provider?: "wompi" | "paypal";
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
  source: "nexora" | "wompi" | "paypal" | "cj";
  detail?: string;
  needsReview?: boolean;
  order: LedgerOrder;
  payment?: LedgerPayment;
  fulfillment?: LedgerFulfillment;
};

export type SalesLedgerWriteResult = {
  reference?: string;
  paymentStatus?: string;
  fulfillmentStatus?: string;
  needsReview?: boolean;
  duplicate?: boolean;
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
  grossAmount: number | null;
  orderTotal: number | null;
  productSubtotal: number | null;
  shippingCharged: number | null;
  supplierShippingCost: number | null;
  supplierCost: number | null;
  paymentProvider: string | null;
  paymentTransactionId: string | null;
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
  cjOrderId: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  fulfillmentNote: string | null;
  needsReview: boolean;
  market: "co" | "us" | null;
  locale: "es-CO" | "en-US" | null;
  currency: "COP" | "USD" | null;
  exchangeRateCopPerUsd: number | null;
  rateUpdatedAt: string | null;
};

export type SalesLedgerPaymentStatus = {
  reference: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  paymentProvider: string | null;
  paymentTransactionId: string | null;
  expectedAmount: number | null;
  paidAmount: number | null;
  currency: "COP" | "USD" | null;
  needsReview: boolean;
};

/** PII sólo para una Route Handler administrativa; nunca se serializa al cliente. */
export type SalesLedgerFulfillmentOrder = {
  reference: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  needsReview: boolean;
  cjOrderId: string | null;
  fulfillmentNote: string | null;
  market: "co" | "us" | null;
  currency: "COP" | "USD" | null;
  customer: { name: string; email: string; phone: string };
  shipping: {
    recipient: string; address1: string; address2: string; houseNumber: string;
    city: string; region: string; country: string; postalCode: string;
    method: string; carrier: string; estimatedDelivery: string;
    originCountryCode: string; optionId: string;
  };
  items: Array<{ sku: string; variantSku: string; providerVariantId?: string; productName: string; quantity: number }>;
};

export type SalesLedgerDailyMetric = {
  date: string;
  approvedOrders: number;
  grossRevenueCop: number;
};

export type SalesLedgerDashboard = {
  approvedOrders: number;
  approvedOrdersCop: number;
  approvedOrdersUsd: number;
  grossRevenueCop: number;
  grossRevenueUsd: number;
  netPayoutCop: number;
  averageTicketCop: number;
  averageTicketUsd: number;
  approvalRatePercent: number;
  pendingOrders: number;
  declinedOrders: number;
  fulfillmentPending: number;
  fulfillmentInTransit: number;
  shippingRevenueCop: number;
  shippingRevenueUsd: number;
  supplierShippingCostCop: number;
  supplierShippingCostUsd: number;
  shippingMarginCop: number;
  contributionCop: number;
  recentOrders: SalesLedgerOrder[];
  dailySales: SalesLedgerDailyMetric[];
};

export type IntelligenceLedgerSnapshot = {
  events: IntelligenceEventSummary;
  proposals: IntelligenceProposal[];
};

export class SalesLedgerError extends Error {}

const EXPECTED_LEDGER_CONTRACT = "2026-08-13.6";
type LedgerContractCache = { endpoint: string; checkedAt: number; ok: boolean };
let ledgerContractCache: LedgerContractCache | null = null;

function configuredTimeoutMs() {
  const value = Number(process.env.GOOGLE_SHEETS_REQUEST_TIMEOUT_MS || 25000);
  return Number.isFinite(value) ? Math.max(1000, Math.min(30000, Math.floor(value))) : 25000;
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
      ? `Google Sheets privado está configurado; cada operación exige el contrato Apps Script ${EXPECTED_LEDGER_CONTRACT}.`
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

async function ensureLedgerContract(configuration: SalesLedgerConfiguration) {
  const endpoint = configuration.endpoint.toString();
  const now = Date.now();
  if (ledgerContractCache?.endpoint === endpoint) {
    const ttl = ledgerContractCache.ok ? 5 * 60_000 : 30_000;
    if (now - ledgerContractCache.checkedAt < ttl) {
      if (ledgerContractCache.ok) return;
      throw new SalesLedgerError("El contrato del registro privado no está disponible.");
    }
  }

  try {
    const response = await fetch(configuration.endpoint, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(Math.min(configuration.timeoutMs, 10_000)),
    });
    const payload = await response.json().catch(() => null) as {
      ok?: unknown;
      service?: unknown;
      contractVersion?: unknown;
      workbookReady?: unknown;
    } | null;
    const compatible = response.ok
      && payload?.ok === true
      && payload.service === "nexora-sales-ledger"
      && payload.contractVersion === EXPECTED_LEDGER_CONTRACT
      && payload.workbookReady === true;
    ledgerContractCache = { endpoint, checkedAt: Date.now(), ok: compatible };
    if (!compatible) throw new SalesLedgerError("El Apps Script de ventas no tiene el contrato Nexora vigente.");
  } catch (error) {
    ledgerContractCache = { endpoint, checkedAt: Date.now(), ok: false };
    if (error instanceof SalesLedgerError) throw error;
    throw new SalesLedgerError("No fue posible validar el contrato del registro privado de ventas.");
  }
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

async function sendSignedAction<T>(payload: unknown) {
  const configuration = getConfiguration();
  if (!configuration) throw new SalesLedgerError("El registro privado de ventas no está configurado.");
  await ensureLedgerContract(configuration);
  const rawPayload = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  // Apps Script no expone encabezados HTTP en doPost. La envoltura mantiene la
  // firma fuera de la URL (evita que quede en historiales, logs o referers).
  const envelope = JSON.stringify({
    ts: timestamp,
    sig: hmac(`${timestamp}.${rawPayload}`, configuration.secret),
    payload: rawPayload,
  });
  return fetchSigned<T>(configuration.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: envelope,
  }, configuration.timeoutMs);
}

async function send(event: LedgerEvent) {
  return sendSignedAction<SalesLedgerWriteResult>(event);
}

function makeFinance(checkout: CheckoutSession): LedgerFinance {
  const supplierCostCop = checkout.items.reduce(
    (total, item) => total + usdToCop(item.supplierCostUsd * item.quantity, item.exchangeRateCopPerUsd),
    0,
  );
  const supplierShippingCostCop = checkout.shippingCostCop;
  const estimate = checkout.currency === "COP" ? estimateContribution({
    salePriceCop: checkout.amountCop,
    supplierCostCop: supplierCostCop + supplierShippingCostCop,
    fulfillmentReserveCop: getFulfillmentReserveCop(),
  }) : null;
  const supplierCost = checkout.currency === "USD"
    ? Math.round(checkout.items.reduce((total, item) => total + item.supplierCostUsd * item.quantity, 0) * 100) / 100
    : supplierCostCop;
  const supplierShippingCost = checkout.currency === "USD"
    ? Math.round(checkout.items.reduce((total, item) => total + item.shipping.selected.amountUsd, 0) * 100) / 100
    : supplierShippingCostCop;
  return {
    orderTotal: checkout.amount,
    productSubtotal: checkout.productSubtotal,
    shippingCharged: checkout.shippingCost,
    supplierShippingCost,
    supplierCost,
    orderTotalCop: checkout.amountCop,
    productSubtotalCop: checkout.productSubtotalCop,
    shippingChargedCop: checkout.shippingCostCop,
    supplierShippingCostCop,
    shippingQuoteUsd: checkout.items.reduce((total, item) => total + item.shipping.selected.amountUsd, 0),
    exchangeRateCopPerUsd: checkout.items[0]?.exchangeRateCopPerUsd,
    supplierCostCop,
    wompiFeeCop: estimate?.totalFeeCop,
    netPayoutCop: estimate ? Math.round(checkout.amountCop - estimate.totalFeeCop) : undefined,
    contributionCop: estimate?.contributionCop,
    contributionMargin: estimate ? estimate.contributionMarginPercent / 100 : undefined,
  };
}

function checkoutOrder(checkout: CheckoutSession): LedgerOrder {
  const first = checkout.items[0];
  const itemRows: LedgerOrderItem[] = checkout.items.map((item) => {
    const selectedVariant = item.product.variants.find((variant) => variant.sku.toUpperCase() === item.shipping.selected.variantSku.toUpperCase());
    return {
      sku: item.product.sku,
      variantSku: item.shipping.selected.variantSku,
      providerVariantId: selectedVariant?.providerVariantId?.trim() || undefined,
      variantLabel: selectedVariant?.options || selectedVariant?.label,
      productName: getProductPresentation(item.product, checkout.market).title,
      niche: niches[item.product.niche].menuLabel,
      quantity: item.quantity,
      unitPriceCop: item.unitPriceCop,
      subtotalCop: item.unitPriceCop * item.quantity,
      unitPrice: item.unitPrice,
      subtotal: Math.round(item.unitPrice * item.quantity * (checkout.currency === "USD" ? 100 : 1)) / (checkout.currency === "USD" ? 100 : 1),
      currency: checkout.currency,
      supplierCostUsd: item.supplierCostUsd * item.quantity,
      shippingMethod: item.shipping.selected.method,
      shippingCarrier: item.shipping.selected.carrier || undefined,
      shippingEstimatedDelivery: item.shipping.selected.estimatedDelivery || undefined,
      shippingOriginCountryCode: item.shipping.selected.sourceCountryCode,
      shippingOptionId: item.shipping.selected.id,
      shippingCostCop: item.shipping.selected.amountCop,
      shippingCost: checkout.currency === "USD" ? item.shipping.selected.amountUsd : item.shipping.selected.amountCop,
    };
  });
  const joinUnique = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))].join(" · ").slice(0, 300);
  return {
    id: checkout.externalReference,
    reference: checkout.externalReference,
    market: checkout.market,
    locale: checkout.locale,
    sku: joinUnique(itemRows.map((item) => item.sku)).slice(0, 140),
    variantSku: joinUnique(itemRows.map((item) => item.variantSku)).slice(0, 180),
    variantLabel: joinUnique(itemRows.map((item) => item.variantLabel)).slice(0, 300),
    productName: itemRows.map((item) => `${item.quantity}× ${item.productName}`).join("; ").slice(0, 300),
    niche: joinUnique(itemRows.map((item) => item.niche)).slice(0, 80),
    quantity: itemRows.reduce((total, item) => total + item.quantity, 0),
    currency: checkout.currency,
    exchangeRateCopPerUsd: checkout.exchangeRateCopPerUsd,
    rateUpdatedAt: checkout.rateUpdatedAt,
    customer: { email: first.shipping.email, name: first.shipping.recipientName, phone: first.shipping.phone },
    shipping: {
      recipient: first.shipping.recipientName,
      address1: first.shipping.address1,
      // El despliegue actual de Apps Script ya persiste Dirección envío 2.
      // Incluir allí el barrio mantiene compatibilidad y evita perderlo.
      address2: [first.shipping.district, first.shipping.address2].filter(Boolean).join(" · ") || undefined,
      district: first.shipping.district,
      houseNumber: first.shipping.houseNumber,
      city: first.shipping.city,
      region: first.shipping.region,
      country: first.shipping.countryCode,
      postalCode: first.shipping.postalCode,
      method: joinUnique(itemRows.map((item) => item.shippingMethod)),
      carrier: joinUnique(itemRows.map((item) => item.shippingCarrier)),
      estimatedDelivery: joinUnique(itemRows.map((item) => item.shippingEstimatedDelivery)),
      originCountryCode: joinUnique(itemRows.map((item) => item.shippingOriginCountryCode)),
      optionId: joinUnique(itemRows.map((item) => item.shippingOptionId)),
      quotedAt: checkout.items.map((item) => item.shipping.selected.selectedAt).sort()[0],
    },
    finance: makeFinance(checkout),
    items: itemRows,
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
  const value = match?.[1]?.toUpperCase();
  // Los carritos usan una referencia agregada. No debe interpretarse "CART"
  // como un SKU, porque los links de pago de Wompi necesitan recuperar la
  // referencia externa real antes de conciliar el evento con Google Sheets.
  return value && value !== "CART" ? value : undefined;
}

export function createCheckoutCreatedEvent(checkout: CheckoutSession): LedgerEvent {
  return {
    schemaVersion: 1,
    eventId: `checkout:${checkout.externalReference}`,
    type: "checkout.created",
    occurredAt: new Date().toISOString(),
    source: "nexora",
    detail: "Checkout preparado; no representa una venta ni un pago aprobado.",
    order: checkoutOrder(checkout),
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
  // En un carrito la referencia ya no codifica un único SKU. El registro
  // checkout.created conserva todas las líneas y el Apps Script concilia el
  // monto de Wompi contra ese total antes de confirmar la postventa.
  const needsReview = transaction.currency !== "COP";
  const eventFingerprint = createHash("sha256")
    .update([transaction.verificationSource, transaction.environment, transaction.id, status, transaction.webhookTimestamp].join("|"))
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
      ? "Pago validado, pero requiere revisión por moneda no compatible."
      : transaction.verificationSource === "webhook"
        ? "Evento validado mediante la firma oficial de Wompi; el libro privado concilia el monto con el carrito registrado."
        : "Transacción consultada directamente en la API oficial de Wompi; el libro privado concilia el monto con el carrito registrado.",
    needsReview,
    order: product
      ? productOrder(product, transaction.reference, paymentCustomer(transaction), paymentShipping(transaction))
      : { id: transaction.reference, reference: transaction.reference, currency: "COP", customer: paymentCustomer(transaction), shipping: paymentShipping(transaction) },
    payment: {
      id: transaction.id,
      status,
      amountCop: salePriceCop,
      amount: salePriceCop,
      currency: "COP",
      provider: "wompi",
      method: transaction.paymentMethodType,
      updatedAt: transaction.finalizedAt || transaction.createdAt || webhookTimestampToIso(transaction.webhookTimestamp),
    },
    fulfillment: { status: needsReview ? "REVISIÓN DE PAGO" : status === "APPROVED" ? "PAGO CONFIRMADO" : "PENDIENTE DE PAGO" },
  };
}

export async function recordCheckoutCreated(checkout: CheckoutSession) {
  return send(createCheckoutCreatedEvent(checkout));
}

export async function recordWompiTransaction(transaction: VerifiedWompiTransaction, product?: Product) {
  return send(createWompiTransactionUpdatedEvent(transaction, product));
}

export function createPayPalTransactionUpdatedEvent(transaction: VerifiedPayPalCapture): LedgerEvent {
  return {
    schemaVersion: 1,
    eventId: paypalCaptureEventId(transaction.captureId, transaction.status),
    type: "payment.updated",
    occurredAt: transaction.updatedAt,
    source: "paypal",
    detail: transaction.verificationSource === "webhook"
      ? "Captura PayPal validada con la firma oficial del webhook; el libro privado concilia referencia, moneda e importe."
      : "Captura PayPal consultada directamente en la API oficial; el libro privado concilia referencia, moneda e importe.",
    order: { id: transaction.reference, reference: transaction.reference, market: "us", locale: "en-US", currency: "USD" },
    payment: {
      id: transaction.captureId,
      status: transaction.status,
      amount: transaction.amount,
      currency: "USD",
      provider: "paypal",
      method: "PAYPAL",
      updatedAt: transaction.updatedAt,
    },
    fulfillment: { status: transaction.status === "APPROVED" ? "PAGO CONFIRMADO" : "PENDIENTE DE PAGO" },
  };
}

export async function recordPayPalTransaction(transaction: VerifiedPayPalCapture) {
  return send(createPayPalTransactionUpdatedEvent(transaction));
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
    grossAmount: typeof row.grossAmount === "number" && Number.isFinite(row.grossAmount) ? row.grossAmount : null,
    orderTotal: typeof row.orderTotal === "number" && Number.isFinite(row.orderTotal) ? row.orderTotal : null,
    productSubtotal: typeof row.productSubtotal === "number" && Number.isFinite(row.productSubtotal) ? row.productSubtotal : null,
    shippingCharged: typeof row.shippingCharged === "number" && Number.isFinite(row.shippingCharged) ? row.shippingCharged : null,
    supplierShippingCost: typeof row.supplierShippingCost === "number" && Number.isFinite(row.supplierShippingCost) ? row.supplierShippingCost : null,
    supplierCost: typeof row.supplierCost === "number" && Number.isFinite(row.supplierCost) ? row.supplierCost : null,
    paymentProvider: nullableString(row.paymentProvider),
    paymentTransactionId: nullableString(row.paymentTransactionId),
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
    cjOrderId: nullableString(row.cjOrderId),
    carrier: nullableString(row.carrier),
    trackingNumber: nullableString(row.trackingNumber),
    trackingUrl: nullableString(row.trackingUrl),
    fulfillmentNote: nullableString(row.fulfillmentNote),
    needsReview: row.needsReview === true,
    market: row.market === "co" || row.market === "us" ? row.market : null,
    locale: row.locale === "es-CO" || row.locale === "en-US" ? row.locale : null,
    currency: row.currency === "COP" || row.currency === "USD" ? row.currency : null,
    exchangeRateCopPerUsd: typeof row.exchangeRateCopPerUsd === "number" && Number.isFinite(row.exchangeRateCopPerUsd) ? row.exchangeRateCopPerUsd : null,
    rateUpdatedAt: nullableString(row.rateUpdatedAt),
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
    approvedOrdersCop: finiteNumber(summary.approvedOrdersCop),
    approvedOrdersUsd: finiteNumber(summary.approvedOrdersUsd),
    grossRevenueCop: finiteNumber(summary.grossRevenueCop),
    grossRevenueUsd: finiteNumber(summary.grossRevenueUsd),
    netPayoutCop: finiteNumber(summary.netPayoutCop),
    averageTicketCop: finiteNumber(summary.averageTicketCop),
    averageTicketUsd: finiteNumber(summary.averageTicketUsd),
    approvalRatePercent: finiteNumber(summary.approvalRatePercent),
    pendingOrders: finiteNumber(summary.pendingOrders),
    declinedOrders: finiteNumber(summary.declinedOrders),
    fulfillmentPending: finiteNumber(summary.fulfillmentPending),
    fulfillmentInTransit: finiteNumber(summary.fulfillmentInTransit),
    shippingRevenueCop: finiteNumber(summary.shippingRevenueCop),
    shippingRevenueUsd: finiteNumber(summary.shippingRevenueUsd),
    supplierShippingCostCop: finiteNumber(summary.supplierShippingCostCop),
    supplierShippingCostUsd: finiteNumber(summary.supplierShippingCostUsd),
    shippingMarginCop: finiteNumber(summary.shippingMarginCop),
    contributionCop: finiteNumber(summary.contributionCop),
    recentOrders,
    dailySales,
  };
}

/** Lee sólo desde una página administrativa autenticada; nunca desde el navegador público. */
export async function getPersistedSalesDashboard() {
  if (!getConfiguration()) return null;
  const result = await sendSignedAction<unknown>({ action: "admin.read" });
  return parseDashboard(result);
}

function emptyIntelligenceEvents(): IntelligenceEventSummary {
  return { firstEventAt: null, lastEventAt: null, trackedEvents: 0, trackedSessions: 0, productViews: 0, cartAdds: 0, shippingQuotes: 0, checkoutStarts: 0, checkoutCreated: 0, eventCoveragePercent: 0 };
}

function parseStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
}

function parseIntelligenceProposal(value: unknown): IntelligenceProposal | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = stringValue(row.id);
  const title = stringValue(row.title);
  const action = stringValue(row.action) as IntelligenceProposal["action"];
  const niche = stringValue(row.niche) as IntelligenceProposal["niche"];
  const persistedStatus = stringValue(row.status) as IntelligenceProposal["status"];
  const decisionNote = nullableString(row.decisionNote) || undefined;
  const status = persistedStatus === "authorized" && decisionNote?.includes("[NEXORA_EXECUTED_V1]")
    ? "executed"
    : persistedStatus;
  const execution = stringValue(row.execution) as IntelligenceProposal["execution"];
  if (!id || !title || !["promote_product", "monitor_product", "pause_product", "start_experiment", "source_candidate"].includes(action)) return null;
  if (!["jewelry", "technologyHome", "wellbeing"].includes(niche) || !["proposed", "authorized", "rejected", "executed", "expired"].includes(status)) return null;
  if (!["advisory", "merchandising", "catalog_workflow"].includes(execution)) return null;
  return {
    id,
    createdAt: stringValue(row.createdAt),
    expiresAt: stringValue(row.expiresAt),
    action,
    status,
    targetSku: nullableString(row.targetSku) || undefined,
    targetSlug: nullableString(row.targetSlug) || undefined,
    niche,
    title,
    summary: stringValue(row.summary),
    rationale: parseStringArray(row.rationale),
    benefits: parseStringArray(row.benefits),
    risks: parseStringArray(row.risks),
    implications: stringValue(row.implications),
    rollback: stringValue(row.rollback),
    confidencePercent: Math.max(0, Math.min(100, finiteNumber(row.confidencePercent))),
    evidence: Array.isArray(row.evidence) ? row.evidence.filter((item): item is IntelligenceProposal["evidence"][number] => Boolean(item) && typeof item === "object").slice(0, 20) : [],
    execution,
    decidedAt: nullableString(row.decidedAt) || undefined,
    decisionNote,
  };
}

export async function recordIntelligenceEvents(events: IntelligenceEvent[]) {
  if (!events.length) return { accepted: 0, duplicates: 0 };
  return sendSignedAction<{ accepted: number; duplicates: number }>({ action: "intelligence.events.write", events: events.slice(0, 50) });
}

export async function syncIntelligenceProposals(proposals: IntelligenceProposal[]) {
  return sendSignedAction<{ inserted: number; preserved: number }>({ action: "intelligence.proposals.sync", proposals: proposals.slice(0, 40) });
}

export async function decideIntelligenceProposal(proposalId: string, decision: "authorized" | "rejected", note: string) {
  return sendSignedAction<{ proposalId: string; status: string; decidedAt: string }>({ action: "intelligence.decision", proposalId, decision, note });
}

function parsePaymentStatus(value: unknown): SalesLedgerPaymentStatus | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const reference = stringValue(row.reference);
  const currency = stringValue(row.currency).toUpperCase();
  if (!reference) return null;
  return {
    reference,
    paymentStatus: stringValue(row.paymentStatus) || "PENDING",
    fulfillmentStatus: stringValue(row.fulfillmentStatus) || "PENDIENTE DE PAGO",
    paymentProvider: nullableString(row.paymentProvider),
    paymentTransactionId: nullableString(row.paymentTransactionId),
    expectedAmount: typeof row.expectedAmount === "number" && Number.isFinite(row.expectedAmount) ? row.expectedAmount : null,
    paidAmount: typeof row.paidAmount === "number" && Number.isFinite(row.paidAmount) ? row.paidAmount : null,
    currency: currency === "COP" || currency === "USD" ? currency : null,
    needsReview: row.needsReview === true,
  };
}

/** Lectura firmada y sin efectos financieros de una orden privada concreta. */
export async function getPersistedSalesOrder(reference: string) {
  if (!getConfiguration()) return null;
  const result = await sendSignedAction<unknown>({ action: "sales.order.read", reference });
  return parsePaymentStatus(result);
}

function parseFulfillmentOrder(value: unknown): SalesLedgerFulfillmentOrder | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const reference = stringValue(row.reference);
  const market = stringValue(row.market).toLowerCase();
  const currency = stringValue(row.currency).toUpperCase();
  const customer = row.customer && typeof row.customer === "object" ? row.customer as Record<string, unknown> : {};
  const shipping = row.shipping && typeof row.shipping === "object" ? row.shipping as Record<string, unknown> : {};
  const rawItems = Array.isArray(row.items) ? row.items : [];
  const items = rawItems.map((item) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { sku: stringValue(value.sku), variantSku: stringValue(value.variantSku), providerVariantId: stringValue(value.providerVariantId), productName: stringValue(value.productName), quantity: finiteNumber(value.quantity) };
  }).filter((item) => item.variantSku && item.productName && Number.isInteger(item.quantity) && item.quantity > 0).slice(0, 6);
  if (!reference || (market !== "co" && market !== "us") || (currency !== "COP" && currency !== "USD") || !items.length) return null;
  return {
    reference,
    paymentStatus: stringValue(row.paymentStatus),
    fulfillmentStatus: stringValue(row.fulfillmentStatus),
    needsReview: row.needsReview === true,
    cjOrderId: nullableString(row.cjOrderId),
    fulfillmentNote: nullableString(row.fulfillmentNote),
    market,
    currency,
    customer: { name: stringValue(customer.name), email: stringValue(customer.email), phone: stringValue(customer.phone) },
    shipping: {
      recipient: stringValue(shipping.recipient), address1: stringValue(shipping.address1), address2: stringValue(shipping.address2), houseNumber: stringValue(shipping.houseNumber), city: stringValue(shipping.city), region: stringValue(shipping.region), country: stringValue(shipping.country), postalCode: stringValue(shipping.postalCode), method: stringValue(shipping.method), carrier: stringValue(shipping.carrier), estimatedDelivery: stringValue(shipping.estimatedDelivery), originCountryCode: stringValue(shipping.originCountryCode), optionId: stringValue(shipping.optionId),
    },
    items,
  };
}

/** Lectura firmada con PII limitada exclusivamente al backend de postventa. */
export async function getPersistedSalesFulfillmentOrder(reference: string) {
  if (!getConfiguration()) return null;
  const result = await sendSignedAction<unknown>({ action: "sales.order.fulfillment.read", reference });
  return parseFulfillmentOrder(result);
}

/** Registra propuesta y decisión bajo una sola operación firmada. */
export async function decideIntelligenceProposalAtomically(
  proposal: IntelligenceProposal,
  decision: "authorized" | "rejected",
  note: string,
) {
  return sendSignedAction<{ proposalId: string; status: string; decidedAt: string }>({
    action: "intelligence.proposal.decide",
    proposal,
    decision,
    note,
  });
}

export async function getIntelligenceLedgerSnapshot(): Promise<IntelligenceLedgerSnapshot | null> {
  if (!getConfiguration()) return null;
  const result = await sendSignedAction<unknown>({ action: "intelligence.read" });
  if (!result || typeof result !== "object") return null;
  const payload = result as Record<string, unknown>;
  const rawEvents = payload.events && typeof payload.events === "object" ? payload.events as Record<string, unknown> : {};
  const events = emptyIntelligenceEvents();
  events.firstEventAt = nullableString(rawEvents.firstEventAt);
  events.lastEventAt = nullableString(rawEvents.lastEventAt);
  events.trackedEvents = finiteNumber(rawEvents.trackedEvents);
  events.trackedSessions = finiteNumber(rawEvents.trackedSessions);
  events.productViews = finiteNumber(rawEvents.productViews);
  events.cartAdds = finiteNumber(rawEvents.cartAdds);
  events.shippingQuotes = finiteNumber(rawEvents.shippingQuotes);
  events.checkoutStarts = finiteNumber(rawEvents.checkoutStarts);
  events.checkoutCreated = finiteNumber(rawEvents.checkoutCreated);
  events.eventCoveragePercent = finiteNumber(rawEvents.eventCoveragePercent);
  const proposals = Array.isArray(payload.proposals) ? payload.proposals.map(parseIntelligenceProposal).filter((proposal): proposal is IntelligenceProposal => Boolean(proposal)) : [];
  return { events, proposals };
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
