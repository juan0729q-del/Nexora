import { NextResponse } from "next/server";
import { verifyWompiWebhook } from "@/lib/payments/webhooks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const verification = verifyWompiWebhook(await request.json());
    if (!verification.ok) return NextResponse.json({ message: verification.reason }, { status: 401 });
    // La confirmación oficial se conserva en Wompi; este evento validado queda
    // disponible en los logs de Vercel hasta que se conecte un almacén de órdenes.
    console.info("Verified Wompi transaction event", verification);
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ message: "Evento Wompi inválido." }, { status: 400 });
  }
}
