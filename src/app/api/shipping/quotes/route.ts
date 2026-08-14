import { NextResponse } from "next/server";
import {
  CjAuthenticationError,
  CjQuotaError,
  CjRequestError,
} from "@/lib/automation/cj-client";
import { getCatalog } from "@/lib/catalog-store";
import { isMarket, markets, type Market } from "@/lib/i18n/config";
import { getExchangeRateSnapshot, marketPriceFromCop } from "@/lib/market-pricing";
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
  let requestMarket: Market = "co";
  try {
    enforceShippingQuoteRateLimit(request);
    const body = await request.json() as { market?: unknown; items?: unknown; destination?: unknown };
    const market: Market | null = typeof body.market === "string" && isMarket(body.market) ? body.market : null;
    if (!market) return NextResponse.json({ message: "Selecciona un mercado válido antes de cotizar." }, { status: 400 });
    requestMarket = market;
    const requestedItems = cartItemsFrom(body.items);
    if (!requestedItems) return NextResponse.json({ message: "El carrito debe incluir entre 1 y 6 artículos distintos y máximo 20 unidades." }, { status: 400 });
    const rawDestination = destinationFrom(body.destination);
    if (!rawDestination) return NextResponse.json({ message: "Completa la información de entrega para cotizar." }, { status: 400 });
    const destination = normalizeCjShippingDestination(rawDestination);
    if (destination.countryCode !== markets[market].countryCode) {
      return NextResponse.json({ message: market === "co" ? "La dirección debe corresponder a Colombia para esta tienda." : "The shipping address must be in the United States for this store." }, { status: 409 });
    }
    const exchangeRate = getExchangeRateSnapshot();
    if (!exchangeRate.valid || !exchangeRate.copPerUsd || !exchangeRate.updatedAt) {
      return NextResponse.json({ message: market === "co" ? "La tasa COP/USD aprobada debe actualizarse antes de cotizar el envío real." : "The approved COP/USD rate must be updated before requesting an actual shipping quote.", reason: "exchange-rate-unavailable" }, { status: 503 });
    }
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
        return NextResponse.json({ message: market === "co" ? "Uno de los productos del carrito ya no está disponible." : "One of the products in your cart is no longer available." }, { status: 409 });
      }
      if (product.stock < requested.quantity) {
        return NextResponse.json({ message: market === "co" ? `Solo quedan ${product.stock} unidades disponibles de ${getProductPresentation(product, market).title}.` : `Only ${product.stock} units of ${getProductPresentation(product, market).title} remain available.` }, { status: 409 });
      }
      const quote = await quoteCjShipping({
        product,
        variantSku: requested.variantSku,
        quantity: requested.quantity,
        destination,
        exchangeRateCopPerUsd: exchangeRate.copPerUsd,
        client,
      });
      const selectedVariant = product.variants.find((variant) => variant.sku.toUpperCase() === quote.variantSku.toUpperCase());
      const productSubtotalCop = product.price * requested.quantity;
      const localizedPrice = marketPriceFromCop(product.price, market, exchangeRate);
      if (!localizedPrice) return NextResponse.json({ message: market === "co" ? "La tasa de cambio aprobada no permite calcular el total del mercado." : "The approved exchange rate cannot produce a valid market total." }, { status: 503 });
      const productSubtotal = Math.round(localizedPrice.amount * requested.quantity * 100) / 100;
      const quoteToken = createShippingQuoteToken({
        version: 4,
        market,
        locale: markets[market].locale,
        currency: markets[market].currency,
        productSlug: product.slug,
        productPrice: localizedPrice.amount,
        productSubtotal,
        productPriceCop: product.price,
        productSubtotalCop,
        quantity: requested.quantity,
        variantSku: quote.variantSku,
        destinationFingerprint: destinationFingerprint(destination),
        issuedAt: quote.quotedAt,
        expiresAt: quote.expiresAt,
        supplierCostUsd: quote.supplierCostUsd,
        exchangeRateCopPerUsd: quote.exchangeRateCopPerUsd,
        rateUpdatedAt: exchangeRate.updatedAt,
        inventoryVerifiedAt: quote.inventoryVerifiedAt,
        verifiedStock: quote.verifiedStock,
        selectedOptions: quote.options,
      });
      lines.push({
        quoteToken,
        expiresAt: quote.expiresAt,
        market,
        locale: markets[market].locale,
        productSubtotal,
        productSubtotalCop,
        currency: markets[market].currency,
        exchangeRateCopPerUsd: quote.exchangeRateCopPerUsd,
        rateUpdatedAt: exchangeRate.updatedAt,
        options: quote.options,
        productSlug: product.slug,
        productName: getProductPresentation(product, market).title,
        variantSku: quote.variantSku,
        variantLabel: selectedVariant?.options || selectedVariant?.label || quote.variantSku,
        quantity: requested.quantity,
      });
    }

    return NextResponse.json({
      expiresAt: lines.reduce((earliest, line) => line.expiresAt < earliest ? line.expiresAt : earliest, lines[0].expiresAt),
      market,
      locale: markets[market].locale,
      productSubtotal: Math.round(lines.reduce((total, line) => total + line.productSubtotal, 0) * 100) / 100,
      productSubtotalCop: lines.reduce((total, line) => total + line.productSubtotalCop, 0),
      currency: markets[market].currency,
      exchangeRateCopPerUsd: exchangeRate.copPerUsd,
      rateUpdatedAt: exchangeRate.updatedAt,
      items: lines,
    });
  } catch (error) {
    const us = requestMarket === "us";
    if (error instanceof SyntaxError) return NextResponse.json({ message: us ? "The shipping quote request is invalid." : "Solicitud de cotización inválida." }, { status: 400 });
    if (error instanceof CjShippingConfigurationError) return NextResponse.json({ message: us ? "Real shipping quotes are not configured. Your cart has been preserved and no charge will be made." : error.message }, { status: 503 });
    if (error instanceof ShippingQuoteRateLimitError) return NextResponse.json({ message: us ? "Too many quote attempts. Wait one minute and try again." : error.message }, { status: 429, headers: { "Retry-After": "60" } });
    if (error instanceof CjShippingQuoteError) return NextResponse.json({ message: us ? "CJ could not return a valid shipping option for this product and address. Try a different style or destination." : error.message }, { status: 422 });
    if (error instanceof CjAuthenticationError) {
      console.error("CJ shipping authentication failed", { error: error.message });
      return NextResponse.json({
        message: us ? "The secure CJ connection needs attention. Your cart is preserved and no charge will be made until it is restored." : "La conexión segura con CJ requiere atención. Conservamos tu carrito y no se realizará ningún cobro hasta restablecerla.",
        reason: "provider-authentication",
        provider: "cj",
        code: error.code || null,
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof CjQuotaError) {
      const retryAfter = String(error.retryAfterSeconds || 60);
      console.warn("CJ shipping points unavailable", {
        code: error.code || null,
        points: error.points || null,
        retryAfterSeconds: Number(retryAfter),
      });
      return NextResponse.json({
        message: us ? "CJ has temporarily reached its query quota. Your cart is preserved; request a new quote after the indicated wait." : "CJ alcanzó temporalmente su cuota de consultas. Conservamos tu carrito; intenta cotizar nuevamente cuando termine la espera indicada.",
        reason: "provider-quota",
        provider: "cj",
        retryAfterSeconds: Number(retryAfter),
      }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": retryAfter } });
    }
    if (error instanceof CjRequestError) {
      console.error("CJ shipping request failed", { error: error.message });
      return NextResponse.json({
        message: us ? "CJ could not confirm a shipping rate right now. No charge will be made; please try again later." : "CJ no pudo confirmar una tarifa en este momento. No se realizará ningún cobro; intenta nuevamente más tarde.",
        reason: "provider-unavailable",
        provider: "cj",
      }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    console.error("Unexpected CJ shipping quote error", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ message: us ? "Shipping could not be quoted. Try again before paying." : "No fue posible cotizar el envío. Intenta nuevamente antes de pagar." }, { status: 503 });
  }
}
