import { NextResponse } from "next/server";
import { verifyCheckoutInventory } from "@/lib/automation/supplier-sync";
import { createCjClient } from "@/lib/automation/cj-client";
import { getCatalog } from "@/lib/catalog-store";
import {
  PaymentConfigurationError,
  PaymentProviderError,
  createHostedCheckout,
  toPublicCheckoutSession,
  type CheckoutLineItem,
} from "@/lib/payments/hosted-checkout";
import { isStoreProductAvailable } from "@/lib/products";
import { getSalesLedgerStatus, recordCheckoutCreated } from "@/lib/sales-ledger";
import { getSiteUrl } from "@/lib/site";
import { CjShippingQuoteError, normalizeCjShippingDestination } from "@/lib/shipping/cj-shipping";
import { readShippingQuoteToken, selectShippingQuote, ShippingQuoteTokenError } from "@/lib/shipping/quote-token";
import type { CheckoutShipping, ShippingDestinationInput } from "@/lib/shipping/types";
import { CheckoutRateLimitError, enforceCheckoutRateLimit } from "@/lib/shipping/quote-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckoutRequestItem = {
  productSlug: string;
  variantSku: string;
  quantity: number;
  shippingQuoteToken: string;
  shippingMethodId: string;
};

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
    district: string("district") || undefined,
    city: string("city"),
    region: string("region"),
    countryCode: string("countryCode"),
    postalCode: string("postalCode"),
    houseNumber: string("houseNumber") || undefined,
  };
}

function checkoutItemsFrom(value: unknown): CheckoutRequestItem[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 6) return null;
  const items: CheckoutRequestItem[] = [];
  const unique = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    const productSlug = typeof item.productSlug === "string" ? item.productSlug.trim() : "";
    const variantSku = typeof item.variantSku === "string" ? item.variantSku.trim() : "";
    const shippingQuoteToken = typeof item.shippingQuoteToken === "string" ? item.shippingQuoteToken : "";
    const shippingMethodId = typeof item.shippingMethodId === "string" ? item.shippingMethodId.trim() : "";
    const quantity = Number(item.quantity);
    if (!productSlug || !variantSku || !shippingQuoteToken || !shippingMethodId || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return null;
    const identity = `${productSlug}|${variantSku}`.toLowerCase();
    if (unique.has(identity)) return null;
    unique.add(identity);
    items.push({ productSlug, variantSku, quantity, shippingQuoteToken, shippingMethodId });
  }
  if (items.reduce((total, item) => total + item.quantity, 0) > 20) return null;
  return items;
}

function requireSalesLedger() {
  return process.env.REQUIRE_SALES_LEDGER_FOR_CHECKOUT?.trim().toLowerCase() !== "false";
}

function canTrustQuotedInventory(verifiedAt: string, verifiedStock: number, quantity: number) {
  const configuredSeconds = Number(process.env.CJ_INVENTORY_QUOTE_TRUST_SECONDS || 120);
  const trustSeconds = Number.isFinite(configuredSeconds) ? Math.max(30, Math.min(300, configuredSeconds)) : 120;
  const configuredBuffer = Number(process.env.CJ_INVENTORY_SAFETY_BUFFER || 1);
  const safetyBuffer = Number.isFinite(configuredBuffer) ? Math.max(0, Math.min(10, Math.floor(configuredBuffer))) : 1;
  const age = Date.now() - Date.parse(verifiedAt);
  return age >= 0 && age <= trustSeconds * 1_000 && verifiedStock >= quantity + safetyBuffer;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { customerEmail?: unknown; destination?: unknown; items?: unknown };
    const requestedItems = checkoutItemsFrom(body.items);
    if (!requestedItems) return NextResponse.json({ message: "El carrito o sus cantidades no son válidos. Vuelve a revisarlo antes de pagar." }, { status: 400 });
    const email = customerEmail(body.customerEmail);
    if (!email) return NextResponse.json({ message: "Ingresa un correo válido para recibir la confirmación y el seguimiento del pedido." }, { status: 400 });
    const rawDestination = destinationFrom(body.destination, email);
    if (!rawDestination) return NextResponse.json({ message: "Completa la dirección de entrega y vuelve a cotizar antes de pagar." }, { status: 400 });
    const destination = normalizeCjShippingDestination(rawDestination);
    if (destination.email.trim().toLowerCase() !== email) return NextResponse.json({ message: "Usa el mismo correo para la cotización y la confirmación del pedido." }, { status: 400 });
    enforceCheckoutRateLimit(request, `${email}|${requestedItems.map((item) => item.shippingQuoteToken).sort().join("|")}`);

    const catalog = await getCatalog();
    const productsBySlug = new Map(catalog.map((product) => [product.slug, product]));
    const checkoutItems: CheckoutLineItem[] = [];
    let inventoryClient: ReturnType<typeof createCjClient> | undefined;
    for (const requested of requestedItems) {
      const product = productsBySlug.get(requested.productSlug);
      if (!product || !isStoreProductAvailable(product)) return NextResponse.json({ message: "Uno de los productos del carrito ya no está disponible." }, { status: 409 });
      const quoteToken = readShippingQuoteToken(requested.shippingQuoteToken);
      if (quoteToken.productSlug !== product.slug || quoteToken.productPriceCop !== product.price
        || quoteToken.productSubtotalCop !== product.price * requested.quantity || quoteToken.quantity !== requested.quantity
        || quoteToken.variantSku.toUpperCase() !== requested.variantSku.toUpperCase()) {
        return NextResponse.json({ message: "Un producto, variante, cantidad o precio cambió. Vuelve a calcular el envío." }, { status: 409 });
      }
      const selectedShipping = selectShippingQuote(quoteToken, requested.shippingMethodId, destination);
      const shipping: CheckoutShipping = {
        ...destination,
        selected: {
          ...selectedShipping,
          selectedAt: new Date().toISOString(),
          variantSku: quoteToken.variantSku,
          quantity: requested.quantity,
        },
        quoteExpiresAt: quoteToken.expiresAt,
      };
      if (!canTrustQuotedInventory(quoteToken.inventoryVerifiedAt, quoteToken.verifiedStock, requested.quantity)) {
        inventoryClient ||= createCjClient({ minimumPointsReserve: 0 });
        const inventory = await verifyCheckoutInventory(product, {
          variantSku: quoteToken.variantSku,
          quantity: requested.quantity,
          forceLiveCheck: true,
          client: inventoryClient,
        });
        if (inventory.status === "quota-exhausted") {
          return NextResponse.json({ message: inventory.reason || "CJ no tiene cuota para confirmar el inventario antes del cobro." }, { status: 429, headers: { "Retry-After": "900" } });
        }
        if (["snapshot", "unavailable", "unverified"].includes(inventory.status)) {
          return NextResponse.json({ message: inventory.reason || "No fue posible confirmar el inventario del proveedor antes del cobro." }, { status: inventory.status === "unavailable" ? 409 : 503 });
        }
      }
      checkoutItems.push({
        product,
        quantity: requested.quantity,
        shipping,
        supplierCostUsd: quoteToken.supplierCostUsd,
        exchangeRateCopPerUsd: quoteToken.exchangeRateCopPerUsd,
      });
    }

    const ledger = getSalesLedgerStatus();
    if (!ledger.configured && requireSalesLedger()) {
      return NextResponse.json({ message: "El registro seguro de pedidos está terminando de conectarse. Intenta nuevamente en unos minutos; no se realizará ningún cobro mientras no quede listo." }, { status: 503 });
    }
    const checkout = await createHostedCheckout(checkoutItems, getCheckoutSiteUrl(request), email);
    if (ledger.configured) await recordCheckoutCreated(checkout);
    return NextResponse.json(toPublicCheckoutSession(checkout), { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Solicitud de compra inválida." }, { status: 400 });
    if (error instanceof CheckoutRateLimitError) return NextResponse.json({ message: error.message }, { status: 429, headers: { "Retry-After": "60" } });
    if (error instanceof ShippingQuoteTokenError) return NextResponse.json({ message: error.message }, { status: 409 });
    if (error instanceof CjShippingQuoteError) return NextResponse.json({ message: error.message }, { status: 400 });
    if (error instanceof PaymentConfigurationError) return NextResponse.json({ message: error.message }, { status: 503 });
    if (error instanceof PaymentProviderError) return NextResponse.json({ message: error.message }, { status: 502 });
    console.error("Unexpected checkout error", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ message: "No fue posible preparar el pago." }, { status: 500 });
  }
}
