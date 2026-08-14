import { NextResponse } from "next/server";
import { parsePayPalWebhookCapture, verifyPayPalWebhook } from "@/lib/payments/paypal";
import { getPersistedSalesOrder, getSalesLedgerStatus, recordPayPalTransaction } from "@/lib/sales-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const maximumWebhookBytes = 128_000;

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!raw || new TextEncoder().encode(raw).byteLength > maximumWebhookBytes) {
      return NextResponse.json({ message: "Invalid webhook payload." }, { status: 413 });
    }
    const event = JSON.parse(raw) as unknown;
    if (!(await verifyPayPalWebhook(request.headers, event))) {
      return NextResponse.json({ message: "Invalid PayPal webhook signature." }, { status: 401 });
    }
    const transaction = parsePayPalWebhookCapture(event);
    if (!transaction) return NextResponse.json({ received: true, processed: false });

    const ledger = getSalesLedgerStatus();
    if (!ledger.configured) {
      console.error("Verified PayPal event cannot be persisted because the sales ledger is unavailable");
      return NextResponse.json({ message: "Private order ledger temporarily unavailable." }, { status: 503 });
    }
    const existingOrder = await getPersistedSalesOrder(transaction.reference);
    if (!existingOrder
      || existingOrder.currency !== "USD"
      || existingOrder.reference !== transaction.reference
      || existingOrder.expectedAmount === null
      || Math.abs(existingOrder.expectedAmount - transaction.amount) >= 0.005) {
      console.error("Verified PayPal capture does not match a private Nexora order");
      return NextResponse.json({ message: "Verified capture does not match a private order." }, { status: 409 });
    }
    const persisted = await recordPayPalTransaction(transaction);
    return NextResponse.json({ received: true, processed: true, duplicate: persisted.duplicate === true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ message: "Invalid webhook payload." }, { status: 400 });
    }
    console.error("Verified PayPal event could not be persisted", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ message: "The event could not be recorded yet." }, { status: 503 });
  }
}
