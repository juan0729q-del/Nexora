import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { SalesLedgerError, updateFulfillment } from "@/lib/sales-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const allowedStatuses = new Set([
  "PAGO CONFIRMADO",
  "CREACIÓN CJ EN CURSO",
  "PEDIDO EN CJ",
  "EN PREPARACIÓN",
  "ENVIADO",
  "EN TRÁNSITO",
  "ENTREGADO",
  "INCIDENCIA",
  "CANCELADO",
  "REEMBOLSADO",
]);

function text(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ message: "Sesión administrativa requerida." }, { status: 401 });
  try {
    const body = await request.json() as Record<string, unknown>;
    const reference = text(body.reference, 140);
    const fulfillmentStatus = text(body.fulfillmentStatus, 100);
    if (!reference || !allowedStatuses.has(fulfillmentStatus)) {
      return NextResponse.json({ message: "Referencia o estado de postventa inválido." }, { status: 400 });
    }
    const trackingUrl = text(body.trackingUrl, 500);
    if (trackingUrl) {
      try {
        const url = new URL(trackingUrl);
        if (url.protocol !== "https:") throw new Error("Only HTTPS");
      } catch {
        return NextResponse.json({ message: "La URL de seguimiento debe usar HTTPS." }, { status: 400 });
      }
    }
    await updateFulfillment({
      reference,
      fulfillmentStatus,
      cjOrderId: text(body.cjOrderId, 140),
      carrier: text(body.carrier, 120),
      trackingNumber: text(body.trackingNumber, 160),
      trackingUrl,
      note: text(body.note, 1000),
    });
    return NextResponse.json({ updated: true });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
    if (error instanceof SalesLedgerError) return NextResponse.json({ message: error.message }, { status: 503 });
    console.error("Administrative fulfillment update failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ message: "No fue posible actualizar el pedido." }, { status: 500 });
  }
}
