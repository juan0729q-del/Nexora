import { NextResponse } from "next/server";
import { PaymentConfigurationError, PaymentProviderError, createHostedCheckout } from "@/lib/payments/hosted-checkout";
import { getProduct } from "@/lib/catalog-store";
import { isStoreProductAvailable } from "@/lib/products";
import { getSiteUrl } from "@/lib/site";
import { verifyCheckoutInventory } from "@/lib/automation/supplier-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getCheckoutSiteUrl(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredUrl && !configuredUrl.includes("tu-dominio.com")) return getSiteUrl();
  const origin = new URL(request.url).origin;
  return origin.startsWith("https://") ? origin : getSiteUrl();
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { productSlug?: unknown };
    if (typeof body.productSlug !== "string") return NextResponse.json({ message: "Solicitud de compra inválida." }, { status: 400 });
    const product = await getProduct(body.productSlug);
    if (!product || !isStoreProductAvailable(product)) return NextResponse.json({ message: "Este producto no está disponible temporalmente." }, { status: 400 });
    const inventory = await verifyCheckoutInventory(product);
    if (["unavailable", "unverified", "quota-exhausted"].includes(inventory.status)) {
      return NextResponse.json({
        message: inventory.reason || "No fue posible confirmar el inventario del proveedor antes del cobro.",
      }, { status: 409 });
    }
    return NextResponse.json(await createHostedCheckout(product, getCheckoutSiteUrl(request)), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Solicitud de compra inválida." }, { status: 400 });
    if (error instanceof PaymentConfigurationError) return NextResponse.json({ message: error.message }, { status: 503 });
    if (error instanceof PaymentProviderError) return NextResponse.json({ message: error.message }, { status: 502 });
    console.error("Unexpected checkout error", error);
    return NextResponse.json({ message: "No fue posible preparar el pago." }, { status: 500 });
  }
}
