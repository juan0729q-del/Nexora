import { NextRequest, NextResponse } from "next/server";
import { getProductBySku } from "@/lib/catalog-store";
import { isStoreProductAvailable } from "@/lib/products";

type Context = {
  params: Promise<{ sku: string }>;
};

export async function GET(request: NextRequest, { params }: Context) {
  const { sku } = await params;
  const normalizedSku = sku.trim();

  if (!/^[a-z0-9-]{4,64}$/i.test(normalizedSku)) {
    return new NextResponse("Producto no disponible", { status: 404 });
  }

  const product = await getProductBySku(normalizedSku);
  if (!product || !isStoreProductAvailable(product)) {
    return new NextResponse("Producto no disponible", { status: 404 });
  }

  const response = NextResponse.redirect(new URL(`/co/productos/${product.slug}`, request.url), 308);
  response.headers.set("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  return response;
}
