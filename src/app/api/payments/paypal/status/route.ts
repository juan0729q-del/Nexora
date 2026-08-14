import { NextResponse } from "next/server";
import {
  capturePayPalOrder,
  PayPalConfigurationError,
  PayPalProviderError,
  queryPayPalOrder,
} from "@/lib/payments/paypal";
import type { VerifiedPayPalCapture } from "@/lib/payments/paypal-core";
import {
  getPersistedSalesOrder,
  getSalesLedgerStatus,
  recordPayPalTransaction,
  SalesLedgerError,
  type SalesLedgerPaymentStatus,
} from "@/lib/sales-ledger";
import { enforcePaymentStatusRateLimit, PaymentStatusRateLimitError } from "@/lib/shipping/quote-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validOrderId(value: unknown) {
  return typeof value === "string" && /^[A-Z0-9]{8,40}$/i.test(value) ? value : null;
}

function validReference(value: unknown) {
  return typeof value === "string" && /^NXR-CART-[A-Z0-9]{12,32}$/.test(value) ? value : null;
}

function sameUsd(left: number | null, right: number) {
  return left !== null && Math.abs(left - right) < 0.005;
}

function transactionMatchesOrder(
  transaction: VerifiedPayPalCapture,
  orderId: string,
  reference: string,
  ledger: SalesLedgerPaymentStatus,
) {
  return transaction.orderId === orderId
    && transaction.reference === reference
    && transaction.currency === "USD"
    && ledger.reference === reference
    && ledger.currency === "USD"
    && sameUsd(ledger.expectedAmount, transaction.amount);
}

function ledgerHasApprovedCapture(transaction: VerifiedPayPalCapture, ledger: SalesLedgerPaymentStatus) {
  return transaction.status === "APPROVED"
    && ledger.paymentStatus.toUpperCase() === "APPROVED"
    && ledger.fulfillmentStatus.toUpperCase() === "PAGO CONFIRMADO"
    && ledger.paymentProvider?.toLowerCase() === "paypal"
    && ledger.paymentTransactionId === transaction.captureId
    && sameUsd(ledger.paidAmount, transaction.amount)
    && !ledger.needsReview;
}

function publicStatus(
  transaction: VerifiedPayPalCapture,
  status: VerifiedPayPalCapture["status"] | "REVIEW" = transaction.status,
  message?: string,
) {
  return {
    id: transaction.captureId,
    reference: transaction.reference,
    status,
    amount: transaction.amount,
    currency: transaction.currency,
    provider: "paypal",
    ...(message ? { message } : {}),
  };
}

function errorResponse(error: unknown) {
  if (error instanceof PaymentStatusRateLimitError) {
    return NextResponse.json({ message: error.message }, { status: 429, headers: { "Retry-After": "60" } });
  }
  if (error instanceof PayPalConfigurationError) return NextResponse.json({ message: error.message }, { status: 503 });
  if (error instanceof SalesLedgerError) {
    return NextResponse.json({ message: "PayPal responded, but the private ledger is temporarily unavailable. Do not pay again." }, { status: 503 });
  }
  if (error instanceof PayPalProviderError) return NextResponse.json({ message: error.message }, { status: 502 });
  console.error("PayPal status verification failed", { error: error instanceof Error ? error.message : "unknown" });
  return NextResponse.json({ message: "The payment could not be confirmed at this time." }, { status: 502 });
}

/**
 * Consulta posterior estrictamente de sólo lectura. Usa GET en PayPal y una
 * lectura HMAC del libro; no captura, no reconcilia y no notifica.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orderId = validOrderId(url.searchParams.get("token") || url.searchParams.get("id"));
    const reference = validReference(url.searchParams.get("reference"));
    if (!orderId || !reference) {
      return NextResponse.json({ message: "The PayPal order reference is invalid." }, { status: 400 });
    }
    enforcePaymentStatusRateLimit(request, `paypal-read|${orderId}|${reference}`);
    if (!getSalesLedgerStatus().configured) {
      return NextResponse.json({ message: "The private order ledger is not available for payment reconciliation." }, { status: 503 });
    }

    const [transaction, ledger] = await Promise.all([
      queryPayPalOrder(orderId),
      getPersistedSalesOrder(reference),
    ]);
    if (!ledger) return NextResponse.json({ message: "The private Nexora order was not found." }, { status: 404 });
    if (!transactionMatchesOrder(transaction, orderId, reference, ledger)) {
      return NextResponse.json({ message: "This PayPal payment does not match the expected Nexora order." }, { status: 409 });
    }
    if (transaction.status === "APPROVED" && !ledgerHasApprovedCapture(transaction, ledger)) {
      return NextResponse.json(publicStatus(
        transaction,
        "PENDING",
        "PayPal confirmed the capture; Nexora is waiting for the private ledger reconciliation. Do not pay again.",
      ), { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(publicStatus(transaction), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Único punto de captura iniciado por el retorno aprobado de PayPal. Antes de
 * capturar verifica que la orden ya exista en el libro privado y que coincidan
 * referencia, moneda e importe.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { token?: unknown; id?: unknown; reference?: unknown };
    const orderId = validOrderId(body.token || body.id);
    const reference = validReference(body.reference);
    if (!orderId || !reference) {
      return NextResponse.json({ message: "The PayPal order reference is invalid." }, { status: 400 });
    }
    enforcePaymentStatusRateLimit(request, `paypal-capture|${orderId}|${reference}`);
    if (!getSalesLedgerStatus().configured) {
      return NextResponse.json({ message: "The private order ledger is required before capturing PayPal." }, { status: 503 });
    }

    const [preCapture, existingOrder] = await Promise.all([
      queryPayPalOrder(orderId),
      getPersistedSalesOrder(reference),
    ]);
    if (!existingOrder) return NextResponse.json({ message: "The private Nexora order was not found. No capture was attempted." }, { status: 409 });
    if (!transactionMatchesOrder(preCapture, orderId, reference, existingOrder)) {
      return NextResponse.json({ message: "This PayPal order does not match the private Nexora order. No capture was attempted." }, { status: 409 });
    }

    const transaction = await capturePayPalOrder(orderId);
    if (!transactionMatchesOrder(transaction, orderId, reference, existingOrder)) {
      return NextResponse.json({ message: "The captured PayPal payment does not match the expected Nexora order." }, { status: 409 });
    }
    const persisted = await recordPayPalTransaction(transaction);
    const reconciled = await getPersistedSalesOrder(reference);
    if (!reconciled || persisted.reference !== reference || !ledgerHasApprovedCapture(transaction, reconciled)) {
      return NextResponse.json(publicStatus(transaction, "REVIEW", "The capture was received and requires private-ledger reconciliation. Do not pay again."), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json(publicStatus(transaction), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Invalid payment confirmation request." }, { status: 400 });
    return errorResponse(error);
  }
}
