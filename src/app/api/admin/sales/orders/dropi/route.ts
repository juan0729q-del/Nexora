import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** No customer data is sent until the Dropi draft-order contract is verified. */
export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ message: "Sesión administrativa requerida." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.reference !== "string" || !/^NXR-CART-[A-Z0-9]{12,32}$/.test(body.reference.trim().toUpperCase()) || body.confirm !== true) {
    return NextResponse.json({ message: "Confirma una referencia Nexora válida." }, { status: 400 });
  }
  return NextResponse.json({ created: false, message: "Dropi pendiente de habilitación: la integración devuelve Access denied y aún no se ha verificado la creación sin cobro ni despacho. No se reservó ni envió el pedido." }, { status: 503 });
}
