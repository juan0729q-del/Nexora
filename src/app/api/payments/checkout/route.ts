import { NextResponse } from "next/server";
import { getProduct } from "@/lib/catalog-store";
import { verifyCheckoutInventory } from "@/lib/automation/supplier-sync";
import { PaymentConfigurationError, PaymentProviderError, createHostedCheckout, toPublicCheckoutSession } from "@/lib/payments/hosted-checkout";
import { isStoreProductAvailable } from "@/lib/products";
import { getSalesLedgerStatus, recordCheckoutCreated } from "@/lib/sales-ledger";
import { getSiteUrl } from "@/lib/site";
import { CjShippingQuoteError, normalizeCjShippingDestination } from "@/lib/shipping/cj-shipping";
import { readShippingQuoteToken, selectShippingQuote, ShippingQuoteTokenError } from "@/lib/shipping/quote-token";
import type { CheckoutShipping, ShippingDestinationInput } from "@/lib/shipping/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getCheckoutSiteUrl(request: Request) {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (configuredUrl && !configuredUrl.includes("tu-dominio.com")) return getSiteUrl();
  const origin = new URL(request.url).origin;
  return origin.startsWith("https://") ? origin : getSiteUrl();
}

function customerEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function destinationFrom(value: unknown, fallbackEmail: string): ShippingDestinationInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const string = (key: string) => typeof input[key] === "string" ? input[key] : "";
  return {
    recipientName: string("recipientName"),
    email: string("email") || fallbackEmail,
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

function requireSalesLedger() {
  return process.env.REQUIRE_SALES_LEDGER_FOR_CHECKOUT?.trim().toLowerCase() !== "false";
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      productSlug?: unknown;
      customerEmail?: unknown;
      variantSku?: unknown;
      destination?: unknown;
      shippingQuoteToken?: unknown;
      shippingMethodId?: unknown;
    };
    if (typeof body.productSlug !== "string") return NextResponse.json({ message: "Solicitud de compra inválida." }, { status: 400 });
    const email = customerEmail(body.customerEmail);
    if (!email) return NextResponse.json({ message: "Ingresa un correo válido para recibir la confirmación y el seguimiento del pedido." }, { status: 400 });
    const rawDestination = destinationFrom(body.destination, email);
    if (!rawDestination) return NextResponse.json({ message: "Completa la dirección de entrega y vuelve a cotizar antes de pagar." }, { status: 400 });
    const destination = normalizeCjShippingDestination(rawDestination);
    if (destination.email.trim().toLowerCase() !== email) return NextResponse.json({ message: "Usa el mismo correo para la cotización y la confirmación del pedido." }, { status: 400 });
    const product = await getProduct(body.productSlug);
    if (!product || !isStoreProductAvailable(product)) return NextResponse.json({ message: "Este producto no está disponible temporalmente." }, { status: 409 });

    const quoteToken = readShippingQuoteToken(body.shippingQuoteToken);
    const requestedVariantSku = typeof body.variantSku === "string" ? body.variantSku.trim().toUpperCase() : "";
    if (quoteToken.productSlug !== product.slug || quoteToken.productPriceCop !== product.price || (requestedVariantSku && quoteToken.variantSku.toUpperCase() !== requestedVariantSku)) {
      return NextResponse.json({ message: "El producto, la variante o el precio cambió. Vuelve a calcular el envío." }, { status: 409 });
    }
    const selectedShipping = selectShippingQuote(quoteToken, body.shippingMethodId, destination);
    const shipping: CheckoutShipping = {
      ...destination,
      selected: { ...selectedShipping, selectedAt: new Date().toISOString(), variantSku: quoteToken.variantSku },
      quoteExpiresAt: quoteToken.expiresAt,
    };
    const inventory = await verifyCheckoutInventory(product, {
      variantSku: quoteToken.variantSku,
      forceLiveCheck: true,
    });
    if (["unavailable", "unverified", "quota-exhausted"].includes(inventory.status)) {
      return NextResponse.json({ message: inventory.reason || "No fue posible confirmar el inventario del proveedor antes del cobro." }, { status: 409 });
    }
    const ledger = getSalesLedgerStatus();
    if (!ledger.configured && requireSalesLedger()) {
      return NextResponse.json({ message: "El registro seguro de pedidos está terminando de conectarse. Intenta nuevamente en unos minutos; no se realizará ningún cobro mientras no quede listo." }, { status: 503 });
    }
    const checkout = await createHostedCheckout(product, getCheckoutSiteUrl(request), email, shipping);
    // La cotización se registra antes de revelar la pasarela. Así Wompi puede
    // conciliar exactamente producto + envío sin crear pedidos no auditados.
    if (ledger.configured) await recordCheckoutCreated(product, checkout, {
      supplierCostUsd: quoteToken.supplierCostUsd,
      exchangeRateCopPerUsd: quoteToken.exchangeRateCopPerUsd,
    });
    // La dirección completa sólo se conserva en el registro privado firmado.
    // No hace falta reflejarla al navegador una vez que el cliente la envió.
    return NextResponse.json(toPublicCheckoutSession(checkout), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Solicitud de compra inválida." }, { status: 400 });
    if (error instanceof ShippingQuoteTokenError) return NextResponse.json({ message: error.message }, { status: 409 });
    if (error instanceof CjShippingQuoteError) return NextResponse.json({ message: error.message }, { status: 400 });
    if (error instanceof PaymentConfigurationError) return NextResponse.json({ message: error.message }, { status: 503 });
    if (error instanceof PaymentProviderError) return NextResponse.json({ message: error.message }, { status: 502 });
    console.error("Unexpected checkout error", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ message: "No fue posible preparar el pago." }, { status: 500 });
  }
}
