import { NextResponse } from "next/server";
import { getProduct } from "@/lib/products";

export async function POST(request: Request) {
  const { productSlug } = await request.json() as { productSlug?: string };
  const product = productSlug ? getProduct(productSlug) : undefined;
  if (!product || !product.active || product.stock < 1) return NextResponse.json({ message: "Este producto no está disponible." }, { status: 400 });
  // Integración real: crear aquí la preferencia de Mercado Pago o la transacción Wompi
  // usando solo credenciales del servidor y devolver la URL de redirección recibida.
  return NextResponse.json({ message: "Pasarela de pago lista para conectar. Configura WOMPI_PRIVATE_KEY o MERCADOPAGO_ACCESS_TOKEN en Vercel." }, { status: 501 });
}
