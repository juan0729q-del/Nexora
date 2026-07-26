import { NextResponse } from "next/server";
import { mercadoPagoPaymentId } from "@/lib/payments/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!accessToken) return NextResponse.json({ message: "Mercado Pago no está configurado." }, { status: 503 });
  try {
    const paymentId = mercadoPagoPaymentId(await request.json());
    if (!paymentId) return NextResponse.json({ message: "Notificación de Mercado Pago inválida." }, { status: 400 });
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ message: "No se pudo verificar el pago con Mercado Pago." }, { status: 502 });
    const payment = await response.json() as { id?: string | number; status?: string; external_reference?: string };
    console.info("Verified Mercado Pago payment event", { id: payment.id, status: payment.status, reference: payment.external_reference });
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ message: "Notificación de Mercado Pago inválida." }, { status: 400 });
  }
}
