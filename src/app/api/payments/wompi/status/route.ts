import { NextResponse } from "next/server";
import { getSalesLedgerStatus, recordWompiTransaction, SalesLedgerError } from "@/lib/sales-ledger";
import type { VerifiedWompiTransaction } from "@/lib/payments/webhooks";
import { enforcePaymentStatusRateLimit, PaymentStatusRateLimitError } from "@/lib/shipping/quote-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedStatuses = new Set(["PENDING", "APPROVED", "DECLINED", "VOIDED", "ERROR"]);

function publicKey() {
  return process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY?.trim() || process.env.WOMPI_PUBLIC_KEY?.trim();
}

function validIdentifier(value: string | null, maximum: number) {
  return value && value.length <= maximum && /^[A-Za-z0-9-]+$/.test(value) ? value : null;
}

function stringValue(value: unknown, maximum = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maximum) : undefined;
}

function integerValue(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = validIdentifier(url.searchParams.get("id"), 120);
    const expectedReference = validIdentifier(url.searchParams.get("reference"), 80);
    if (!id || !expectedReference || !expectedReference.startsWith("NXR-CART-")) {
      return NextResponse.json({ message: "La referencia de pago no es válida." }, { status: 400 });
    }
    enforcePaymentStatusRateLimit(request, `${id}|${expectedReference}`);

    const key = publicKey();
    if (!key?.startsWith("pub_")) return NextResponse.json({ message: "Wompi no está configurado para consultar la transacción." }, { status: 503 });
    if (!getSalesLedgerStatus().configured) {
      return NextResponse.json({ message: "El registro privado no está disponible para conciliar el pago." }, { status: 503 });
    }
    const baseUrl = key.startsWith("pub_test_") ? "https://sandbox.wompi.co" : "https://production.wompi.co";
    const response = await fetch(`${baseUrl}/v1/transactions/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => null) as { data?: Record<string, unknown> } | null;
    if (!response.ok || !payload?.data) return NextResponse.json({ message: "Wompi todavía no permite confirmar esta transacción." }, { status: response.status === 404 ? 404 : 502 });

    const wompiId = stringValue(payload.data.id, 140);
    const reference = stringValue(payload.data.reference, 140) || "";
    const status = stringValue(payload.data.status, 40)?.toUpperCase() || "";
    const currency = stringValue(payload.data.currency, 8)?.toUpperCase() || "";
    const amountInCents = integerValue(payload.data.amount_in_cents ?? payload.data.amountInCents);
    const createdAt = stringValue(payload.data.created_at ?? payload.data.createdAt, 80);
    const finalizedAt = stringValue(payload.data.finalized_at ?? payload.data.finalizedAt, 80);
    const updatedAt = stringValue(payload.data.updated_at ?? payload.data.updatedAt, 80);
    const stableDate = updatedAt || finalizedAt || createdAt;
    const stableTimestamp = stableDate ? Date.parse(stableDate) : NaN;
    if (wompiId !== id || reference !== expectedReference || currency !== "COP" || !amountInCents
      || !createdAt || !Number.isFinite(stableTimestamp) || !allowedStatuses.has(status)) {
      return NextResponse.json({ message: "La transacción no coincide con el pedido Nexora esperado." }, { status: 409 });
    }

    const transaction: VerifiedWompiTransaction = {
      id,
      reference,
      status,
      currency,
      amountInCents,
      customerEmail: stringValue(payload.data.customer_email ?? payload.data.customerEmail, 254),
      paymentMethodType: stringValue(payload.data.payment_method_type ?? payload.data.paymentMethodType, 120),
      createdAt,
      finalizedAt,
      environment: key.startsWith("pub_test_") ? "test" : "prod",
      webhookTimestamp: String(stableTimestamp),
      verificationSource: "api",
    };
    const persisted = await recordWompiTransaction(transaction);
    if (persisted.reference && persisted.reference !== reference) {
      return NextResponse.json({ message: "La conciliación no coincide con el pedido esperado." }, { status: 409 });
    }
    if (status === "APPROVED" && (persisted.paymentStatus?.toUpperCase() !== "APPROVED"
      || persisted.fulfillmentStatus?.toUpperCase() !== "PAGO CONFIRMADO" || persisted.needsReview)) {
      return NextResponse.json({ id, reference, status: "REVIEW" }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ id, reference, status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PaymentStatusRateLimitError) return NextResponse.json({ message: error.message }, { status: 429, headers: { "Retry-After": "60" } });
    if (error instanceof SalesLedgerError) return NextResponse.json({ message: "Wompi respondió, pero el registro privado aún no pudo conciliar el pago. No repitas el cobro." }, { status: 503 });
    console.error("Wompi status verification failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ message: "No fue posible confirmar el pago en este momento." }, { status: 502 });
  }
}
