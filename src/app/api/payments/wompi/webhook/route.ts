import { NextResponse } from "next/server";
import { getProductBySku } from "@/lib/catalog-store";
import { getSalesLedgerStatus, recordWompiTransaction, skuFromPaymentReference } from "@/lib/sales-ledger";
import { resolveWompiPaymentLinkSku } from "@/lib/payments/hosted-checkout";
import { verifyWompiWebhook } from "@/lib/payments/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ledgerIsExplicitlyDisabled() {
  return process.env.GOOGLE_SHEETS_SYNC_ENABLED?.trim().toLowerCase() === "false";
}

export async function POST(request: Request) {
  try {
    const verification = verifyWompiWebhook(await request.json());
    if (!verification.ok) return NextResponse.json({ message: verification.reason }, { status: 401 });

    const ledger = getSalesLedgerStatus();
    if (!ledger.configured) {
      // No devolvemos 200 si el registro se esperaba pero no está disponible:
      // Wompi reintentará el evento y no se perderá un pedido aprobado.
      if (ledgerIsExplicitlyDisabled()) return NextResponse.json({ received: true, ledger: "disabled" });
      console.error("Wompi event cannot be persisted because the sales ledger is not configured", {
        transactionId: verification.transaction.id,
        reference: verification.transaction.reference,
      });
      return NextResponse.json({ message: "Registro privado temporalmente no disponible." }, { status: 503 });
    }

    const fallbackReference = verification.transaction.paymentLinkId
      ? await resolveWompiPaymentLinkSku(verification.transaction.paymentLinkId)
      : undefined;
    const transaction = fallbackReference && !skuFromPaymentReference(verification.transaction.reference)
      ? { ...verification.transaction, reference: fallbackReference }
      : verification.transaction;
    const sku = skuFromPaymentReference(transaction.reference);
    const product = sku ? await getProductBySku(sku) : undefined;
    await recordWompiTransaction(transaction, product);
    return NextResponse.json({ received: true });
  } catch (error) {
    // No registrar correo, dirección ni payload del cliente en logs de Vercel.
    console.error("Verified Wompi event could not be persisted", {
      error: error instanceof Error ? error.message : "unknown",
    });
    // Wompi reintentará ante una indisponibilidad transitoria del libro privado.
    return NextResponse.json({ message: "No fue posible registrar el evento todavía." }, { status: 503 });
  }
}
