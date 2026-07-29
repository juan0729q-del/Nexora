import { NextResponse } from "next/server";
import { getProduct } from "@/lib/catalog-store";
import { CjShippingConfigurationError, CjShippingQuoteError, normalizeCjShippingDestination, quoteCjShipping } from "@/lib/shipping/cj-shipping";
import { enforceShippingQuoteRateLimit, ShippingQuoteRateLimitError } from "@/lib/shipping/quote-rate-limit";
import { createShippingQuoteToken, destinationFingerprint } from "@/lib/shipping/quote-token";
import type { ShippingDestinationInput } from "@/lib/shipping/types";
import { isStoreProductAvailable } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function destinationFrom(value: unknown): ShippingDestinationInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const string = (key: string) => typeof input[key] === "string" ? input[key] : "";
  return {
    recipientName: string("recipientName"),
    email: string("email"),
    phone: string("phone"),
    address1: string("address1"),
    address2: string("address2") || undefined,
    city: string("city"),
    region: string("region"),
    countryCode: string("countryCode"),
    postalCode: string("postalCode"),
    houseNumber: string("houseNumber") || undefined,
  };
}

export async function POST(request: Request) {
  try {
    enforceShippingQuoteRateLimit(request);
    const body = await request.json() as { productSlug?: unknown; variantSku?: unknown; destination?: unknown };
    if (typeof body.productSlug !== "string") return NextResponse.json({ message: "Selecciona un producto válido antes de cotizar." }, { status: 400 });
    const rawDestination = destinationFrom(body.destination);
    if (!rawDestination) return NextResponse.json({ message: "Completa la información de entrega para cotizar." }, { status: 400 });
    // Una sola normalización se utiliza para CJ, caché, token y checkout.
    const destination = normalizeCjShippingDestination(rawDestination);
    const product = await getProduct(body.productSlug);
    if (!product || !isStoreProductAvailable(product)) return NextResponse.json({ message: "Este producto no está disponible temporalmente." }, { status: 409 });
    const quote = await quoteCjShipping({
      product,
      variantSku: typeof body.variantSku === "string" ? body.variantSku : undefined,
      destination,
    });
    const quoteToken = createShippingQuoteToken({
      version: 1,
      productSlug: product.slug,
      productPriceCop: product.price,
      variantSku: quote.variantSku,
      destinationFingerprint: destinationFingerprint(destination),
      issuedAt: quote.quotedAt,
      expiresAt: quote.expiresAt,
      supplierCostUsd: quote.supplierCostUsd,
      exchangeRateCopPerUsd: quote.exchangeRateCopPerUsd,
      selectedOptions: quote.options,
    });
    return NextResponse.json({
      quoteToken,
      expiresAt: quote.expiresAt,
      productSubtotalCop: product.price,
      currency: "COP",
      exchangeRateCopPerUsd: quote.exchangeRateCopPerUsd,
      options: quote.options,
    });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Solicitud de cotización inválida." }, { status: 400 });
    if (error instanceof CjShippingConfigurationError) return NextResponse.json({ message: error.message }, { status: 503 });
    if (error instanceof ShippingQuoteRateLimitError) return NextResponse.json({ message: error.message }, { status: 429, headers: { "Retry-After": "60" } });
    if (error instanceof CjShippingQuoteError) return NextResponse.json({ message: error.message }, { status: 422 });
    console.error("Unexpected CJ shipping quote error", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ message: "No fue posible cotizar el envío. Intenta nuevamente antes de pagar." }, { status: 503 });
  }
}
