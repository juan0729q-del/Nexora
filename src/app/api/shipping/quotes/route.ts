import { NextResponse } from "next/server";
import {
  CjAuthenticationError,
  CjQuotaError,
  CjRequestError,
} from "@/lib/automation/cj-client";
import { getCatalog } from "@/lib/catalog-store";
import { getProductPresentation } from "@/lib/product-presentation";
import { isStoreProductAvailable } from "@/lib/products";
import {
  CjShippingConfigurationError,
  CjShippingQuoteError,
  createCjShippingClient,
  normalizeCjShippingDestination,
  quoteCjShipping,
} from "@/lib/shipping/cj-shipping";
import { enforceShippingQuoteRateLimit, ShippingQuoteRateLimitError } from "@/lib/shipping/quote-rate-limit";
import { createShippingQuoteToken, destinationFingerprint } from "@/lib/shipping/quote-token";
import type { CartShippingQuoteLine, ShippingDestinationInput } from "@/lib/shipping/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestedCartItem = { productSlug: string; variantSku?: string; quantity: number };

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
    district: string("district") || undefined,
    city: string("city"),
    region: string("region"),
    countryCode: string("countryCode"),
    postalCode: string("postalCode"),
    houseNumber: string("houseNumber") || undefined,
  };
}

function cartItemsFrom(value: unknown): RequestedCartItem[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) return null;
  const items: RequestedCartItem[] = [];
  const unique = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const productSlug = typeof item.productSlug === "string" ? item.productSlug.trim() : "";
    const variantSku = typeof item.variantSku === "string" ? item.variantSku.trim() : undefined;
    const quantity = Number(item.quantity);
    if (!productSlug || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return null;
    const identity = `${productSlug}|${variantSku || ""}`.toLowerCase();
    if (unique.has(identity)) return null;
    unique.add(identity);
    items.push({ productSlug, variantSku, quantity });
  }
  if (items.reduce((total, item) => total + item.quantity, 0) > 20) return null;
  return items;
}

export async function POST(request: Request) {
  try {
    enforceShippingQuoteRateLimit(request);
    const body = await request.json() as { items?: unknown; destination?: unknown };
    const requestedItems = cartItemsFrom(body.items);
    if (!requestedItems) return NextResponse.json({ message: "El carrito debe incluir entre 1 y 6 artículos distintos y máximo 20 unidades." }, { status: 400 });
    const rawDestination = destinationFrom(body.destination);
    if (!rawDestination) return NextResponse.json({ message: "Completa la información de entrega para cotizar." }, { status: 400 });
    const destination = normalizeCjShippingDestination(rawDestination);
    const catalog = await getCatalog();
    const productsBySlug = new Map(catalog.map((product) => [product.slug, product]));
    const client = createCjShippingClient();
    const lines: CartShippingQuoteLine[] = [];

    // Se cotiza cada línea de forma independiente. CJ puede despachar artículos
    // desde bodegas distintas; sumar tarifas verificadas evita prometer una
    // consolidación que el proveedor no haya confirmado.
    for (const requested of requestedItems) {
      const product = productsBySlug.get(requested.productSlug);
      if (!product || !isStoreProductAvailable(product)) {
        return NextResponse.json({ message: "Uno de los productos del carrito ya no está disponible." }, { status: 409 });
      }
      if (product.stock < requested.quantity) {
        return NextResponse.json({ message: `Solo quedan ${product.stock} unidades disponibles de ${getProductPresentation(product).title}.` }, { status: 409 });
      }
      const quote = await quoteCjShipping({
        product,
        variantSku: requested.variantSku,
        quantity: requested.quantity,
        destination,
        client,
      });
      const selectedVariant = product.variants.find((variant) => variant.sku.toUpperCase() === quote.variantSku.toUpperCase());
      const productSubtotalCop = product.price * requested.quantity;
      const quoteToken = createShippingQuoteToken({
        version: 3,
        productSlug: product.slug,
        productPriceCop: product.price,
        productSubtotalCop,
        quantity: requested.quantity,
        variantSku: quote.variantSku,
        destinationFingerprint: destinationFingerprint(destination),
        issuedAt: quote.quotedAt,
        expiresAt: quote.expiresAt,
        supplierCostUsd: quote.supplierCostUsd,
        exchangeRateCopPerUsd: quote.exchangeRateCopPerUsd,
        inventoryVerifiedAt: quote.inventoryVerifiedAt,
        verifiedStock: quote.verifiedStock,
        selectedOptions: quote.options,
      });
      lines.push({
        quoteToken,
        expiresAt: quote.expiresAt,
        productSubtotalCop,
        currency: "COP",
        exchangeRateCopPerUsd: quote.exchangeRateCopPerUsd,
        options: quote.options,
        productSlug: product.slug,
        productName: getProductPresentation(product).title,
        variantSku: quote.variantSku,
        variantLabel: selectedVariant?.options || selectedVariant?.label || quote.variantSku,
        quantity: requested.quantity,
      });
    }

    return NextResponse.json({
      expiresAt: lines.reduce((earliest, line) => line.expiresAt < earliest ? line.expiresAt : earliest, lines[0].expiresAt),
      productSubtotalCop: lines.reduce((total, line) => total + line.productSubtotalCop, 0),
      currency: "COP",
      items: lines,
    });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Solicitud de cotización inválida." }, { status: 400 });
    if (error instanceof CjShippingConfigurationError) return NextResponse.json({ message: error.message }, { status: 503 });
    if (error instanceof ShippingQuoteRateLimitError) return NextResponse.json({ message: error.message }, { status: 429, headers: { "Retry-After": "60" } });
    if (error instanceof CjShippingQuoteError) return NextResponse.json({ message: error.message }, { status: 422 });
    if (error instanceof CjAuthenticationError) {
      console.error("CJ shipping authentication failed", { error: error.message });
      return NextResponse.json({ message: "La conexión segura con CJ requiere atención. No se realizará ningún cobro hasta restablecerla." }, { status: 503 });
    }
    if (error instanceof CjQuotaError) {
      return NextResponse.json({ message: "CJ alcanzó temporalmente su cuota de consultas. Conservamos tu carrito; intenta cotizar de nuevo más tarde." }, { status: 429, headers: { "Retry-After": "900" } });
    }
    if (error instanceof CjRequestError) {
      console.error("CJ shipping request failed", { error: error.message });
      return NextResponse.json({ message: "CJ no pudo confirmar una tarifa en este momento. No se realizará ningún cobro; intenta nuevamente más tarde." }, { status: 503 });
    }
    console.error("Unexpected CJ shipping quote error", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ message: "No fue posible cotizar el envío. Intenta nuevamente antes de pagar." }, { status: 503 });
  }
}
