"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { checkoutAuditActive, downloadCheckoutAudit, recordCheckoutAuditEvent, startCheckoutAudit } from "@/lib/checkout-audit";
import { storePendingPurchase, trackCommerceEvent } from "@/lib/analytics/client";
import { trackIntelligenceEvent } from "@/lib/intelligence/client";
import { beginCheckout } from "@/lib/payments";
import { cartPath, formatMoney, markets, type Market } from "@/lib/i18n/config";
import type { StorefrontProduct } from "@/lib/product-presentation";
import type { CartShippingQuoteResponse, CjShippingQuoteOption, ShippingDestinationInput } from "@/lib/shipping/types";
import { maxCartUnits, maxUnitsPerLine, useCart } from "./cart-context";
import { ProductArt } from "./product-art";
import { MarketLocationFields } from "./colombia-location-fields";
import { QuantityStepper } from "./quantity-stepper";

function emptyDestination(market: Market): ShippingDestinationInput { return {
  recipientName: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  district: "",
  city: "",
  region: "",
  countryCode: markets[market].countryCode,
  postalCode: "",
  houseNumber: "",
}; }

function lineId(productSlug: string, variantSku: string) {
  return `${productSlug}|${variantSku}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function validShippingOption(value: unknown): value is CjShippingQuoteOption {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.method === "string"
    && (value.carrier === null || typeof value.carrier === "string")
    && (value.estimatedDelivery === null || typeof value.estimatedDelivery === "string")
    && typeof value.amountCop === "number"
    && Number.isFinite(value.amountCop)
    && value.amountCop >= 0
    && typeof value.amountUsd === "number"
    && Number.isFinite(value.amountUsd)
    && value.amountUsd >= 0
    && typeof value.sourceCountryCode === "string"
    && ["cheapest", "fastest", "none"].includes(String(value.recommendation))
    && (value.remoteFeeCop === null || (typeof value.remoteFeeCop === "number" && Number.isFinite(value.remoteFeeCop)))
    && Array.isArray(value.notices)
    && value.notices.every((notice) => typeof notice === "string");
}

function validQuotePayload(value: unknown, market: Market): value is CartShippingQuoteResponse {
  if (!isRecord(value)) return false;
  return typeof value.expiresAt === "string"
    && Number.isFinite(Date.parse(value.expiresAt))
    && typeof value.productSubtotalCop === "number"
    && Number.isFinite(value.productSubtotalCop)
    && value.productSubtotalCop >= 0
    && value.market === market
    && value.currency === markets[market].currency
    && typeof value.productSubtotal === "number"
    && Number.isFinite(value.productSubtotal)
    && typeof value.exchangeRateCopPerUsd === "number"
    && Number.isFinite(value.exchangeRateCopPerUsd)
    && typeof value.rateUpdatedAt === "string"
    && Number.isFinite(Date.parse(value.rateUpdatedAt))
    && Array.isArray(value.items)
    && value.items.length > 0
    && value.items.every((item) => isRecord(item)
      && typeof item.productSlug === "string"
      && typeof item.productName === "string"
      && typeof item.variantSku === "string"
      && typeof item.variantLabel === "string"
      && Number.isInteger(item.quantity)
      && Number(item.quantity) > 0
      && typeof item.quoteToken === "string"
      && item.quoteToken.length > 0
      && Array.isArray(item.options)
      && item.options.length > 0
      && item.options.every(validShippingOption));
}

function deliveryText(option: CjShippingQuoteOption, market: Market) {
  return option.estimatedDelivery
    ? market === "co" ? `Entrega estimada por CJ: ${option.estimatedDelivery}` : `CJ estimated delivery: ${option.estimatedDelivery}`
    : market === "co" ? "CJ confirmará el tiempo de entrega cuando procese el despacho." : "CJ will confirm the delivery time when dispatching the order.";
}

function optionBadge(option: CjShippingQuoteOption, market: Market) {
  if (option.recommendation === "cheapest") return market === "co" ? "Más económica · sugerida" : "Lowest cost · suggested";
  if (option.recommendation === "fastest") return market === "co" ? "Más rápida" : "Fastest";
  return null;
}

export function CartCheckout({ products, market }: { products: StorefrontProduct[]; market: Market }) {
  const es = market === "co";
  const intelligenceContext = {
    market,
    locale: markets[market].locale,
    currency: markets[market].currency,
  } as const;
  const { items, itemCount, hydrated, updateQuantity, removeItem } = useCart();
  const [destination, setDestination] = useState<ShippingDestinationInput>(() => emptyDestination(market));
  const [quote, setQuote] = useState<CartShippingQuoteResponse | null>(null);
  const [selectedMethods, setSelectedMethods] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [quoteExpired, setQuoteExpired] = useState(false);
  const [auditId, setAuditId] = useState<string | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const auditStartedRef = useRef(false);
  const productsBySlug = useMemo(() => new Map(products.map((product) => [product.slug, product])), [products]);
  const visibleItems = useMemo(() => items.flatMap((item) => {
    const product = productsBySlug.get(item.productSlug);
    if (!product) return [];
    const variant = product.variants.find((entry) => entry.sku === item.variantSku);
    return [{
      ...item,
      product,
      variant,
      unitPrice: variant?.price ?? null,
      unitPriceCop: variant?.sourcePriceCop ?? null,
    }];
  }), [items, productsBySlug]);
  const orphanedItems = useMemo(() => items.filter((item) => !productsBySlug.has(item.productSlug)), [items, productsBySlug]);
  const invalidItems = useMemo(() => items.filter((item) => {
    const product = productsBySlug.get(item.productSlug);
    const variant = product?.variants.find((entry) => entry.sku === item.variantSku);
    return !product || !product.available || variant?.price === null || variant?.price === undefined
      || variant.sourcePriceCop === null || product.stock < item.quantity || !variant;
  }), [items, productsBySlug]);

  useEffect(() => () => requestControllerRef.current?.abort(), []);

  useEffect(() => {
    if (!hydrated || !visibleItems.length) return;
    trackCommerceEvent({
      name: "view_cart",
      market,
      value: visibleItems.reduce((total, item) => total + (item.unitPrice ?? 0) * item.quantity, 0),
      items: visibleItems.map((item) => ({ item_id: item.product.sku, item_name: item.product.name, item_category: item.product.niche, item_variant: item.variantSku, price: item.unitPrice ?? undefined, quantity: item.quantity })),
      dedupeKey: `view_cart:${market}:${items.map((item) => `${item.productSlug}:${item.variantSku}:${item.quantity}`).join("|")}`,
    });
  }, [hydrated, items, market, visibleItems]);

  useEffect(() => {
    if (!hydrated || auditStartedRef.current || !checkoutAuditActive()) return;
    auditStartedRef.current = true;
    const id = startCheckoutAudit({
      lineCount: items.length,
      unitCount: itemCount,
      items: items.map((item) => ({ productSlug: item.productSlug, variantSku: item.variantSku, quantity: item.quantity })),
    });
    if (id) queueMicrotask(() => setAuditId(id));
  }, [hydrated, itemCount, items]);

  useEffect(() => {
    if (!quote) return;
    const remaining = Date.parse(quote.expiresAt) - Date.now();
    const timeout = window.setTimeout(() => setQuoteExpired(true), Math.max(0, remaining));
    return () => window.clearTimeout(timeout);
  }, [quote]);

  const clearQuote = useCallback(() => {
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    setQuote(null);
    setSelectedMethods({});
    setStatus(null);
    setQuoteExpired(false);
    setIsPreparing(false);
  }, []);

  const updateDestination = useCallback((field: keyof ShippingDestinationInput, value: string) => {
    clearQuote();
    setDestination((current) => ({
      ...current,
      [field]: field === "countryCode" ? value.toUpperCase() : value,
      ...(["address1", "houseNumber"].includes(field) ? { postalCode: "" } : {}),
    }));
  }, [clearQuote]);

  async function calculateShipping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!visibleItems.length || isPreparing) return;
    clearQuote();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    let failureRecorded = false;
    recordCheckoutAuditEvent("shipping-requested", {
      lineCount: visibleItems.length,
      unitCount: visibleItems.reduce((total, item) => total + item.quantity, 0),
      countryCode: destination.countryCode,
      items: visibleItems.map((item) => ({ productSlug: item.productSlug, variantSku: item.variantSku, quantity: item.quantity })),
    });
    trackIntelligenceEvent({ type: "shipping_quote_requested", page: cartPath(market), quantity: visibleItems.reduce((total, item) => total + item.quantity, 0), ...intelligenceContext });
    try {
      setIsPreparing(true);
      setStatus(es ? "Consultando tarifas reales de CJ para cada artículo del carrito…" : "Requesting actual CJ shipping rates for every cart item…");
      const response = await fetch("/api/shipping/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market,
          items: visibleItems.map((item) => ({ productSlug: item.productSlug, variantSku: item.variantSku, quantity: item.quantity })),
          destination,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as ({ message?: string; reason?: string; retryAfterSeconds?: number } & Partial<CartShippingQuoteResponse>) | null;
      if (!response.ok) {
        failureRecorded = true;
        recordCheckoutAuditEvent("shipping-failed", {
          httpStatus: response.status,
          reason: payload?.reason || "unknown",
          retryAfterSeconds: payload?.retryAfterSeconds || null,
        });
        throw new Error(payload?.message || (es ? "No fue posible cotizar el envío." : "Shipping could not be quoted."));
      }
      if (!validQuotePayload(payload, market)) throw new Error(es ? "CJ no devolvió una cotización completa. Intenta de nuevo antes de pagar." : "CJ did not return a complete quote. Try again before payment.");
      if (requestControllerRef.current !== controller) return;
      const suggestions = Object.fromEntries(payload.items.map((line) => [
        lineId(line.productSlug, line.variantSku),
        (line.options.find((option) => option.recommendation === "cheapest") || line.options[0]).id,
      ]));
      setQuote(payload);
      setSelectedMethods(suggestions);
      setStatus(es ? "Cotización lista. Revisa o cambia el método de cada envío antes de pagar." : "Quote ready. Review or change each shipping method before checkout.");
      recordCheckoutAuditEvent("shipping-succeeded", {
        productSubtotalCop: payload.productSubtotalCop,
        shippingOptionCount: payload.items.reduce((total, item) => total + item.options.length, 0),
        lines: payload.items.map((line) => ({
          productSlug: line.productSlug,
          variantSku: line.variantSku,
          quantity: line.quantity,
          options: line.options.map((option) => ({ id: option.id, method: option.method, amountCop: option.amountCop, estimatedDelivery: option.estimatedDelivery })),
        })),
      });
      trackIntelligenceEvent({ type: "shipping_quote_succeeded", page: cartPath(market), quantity: payload.items.reduce((total, item) => total + item.quantity, 0), valueCop: payload.productSubtotalCop, value: payload.productSubtotal, ...intelligenceContext });
      const suggestedShipping = payload.items.reduce((total, line) => total + (line.options.find((option) => option.recommendation === "cheapest") || line.options[0]).amountUsd, 0);
      trackCommerceEvent({ name: "add_shipping_info", market, value: market === "co" ? payload.productSubtotalCop + payload.items.reduce((total, line) => total + (line.options.find((option) => option.recommendation === "cheapest") || line.options[0]).amountCop, 0) : payload.productSubtotal + suggestedShipping, shippingTier: "cj-lowest-cost", items: visibleItems.map((item) => ({ item_id: item.product.sku, item_name: item.product.name, item_category: item.product.niche, item_variant: item.variantSku, price: item.unitPrice ?? undefined, quantity: item.quantity })) });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!failureRecorded) recordCheckoutAuditEvent("shipping-failed", { reason: "client-or-validation" });
      trackIntelligenceEvent({ type: "shipping_quote_failed", page: cartPath(market), quantity: visibleItems.reduce((total, item) => total + item.quantity, 0), ...intelligenceContext });
      trackCommerceEvent({ name: "checkout_error", market, errorCode: "shipping_quote_failed" });
      setStatus(error instanceof Error ? error.message : (es ? "No fue posible cotizar el envío." : "Shipping could not be quoted."));
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
        setIsPreparing(false);
      }
    }
  }

  async function pay() {
    if (!quote || isPreparing) return;
    if (quoteExpired) {
      setQuoteExpired(true);
      setStatus(es ? "La cotización de CJ venció. Vuelve a calcular el envío antes de pagar." : "The CJ quote expired. Request a new shipping quote before checkout.");
      return;
    }
    const checkoutItems = quote.items.map((line) => ({
      productSlug: line.productSlug,
      variantSku: line.variantSku,
      quantity: line.quantity,
      shippingQuoteToken: line.quoteToken,
      shippingMethodId: selectedMethods[lineId(line.productSlug, line.variantSku)] || "",
    }));
    if (checkoutItems.some((item) => !item.shippingMethodId)) {
      setStatus(es ? "Selecciona un método de envío para cada artículo." : "Select a shipping method for every item.");
      return;
    }
    recordCheckoutAuditEvent("checkout-requested", {
      lineCount: checkoutItems.length,
      unitCount: checkoutItems.reduce((total, item) => total + item.quantity, 0),
      productSubtotalCop: quote.productSubtotalCop,
      shippingCostCop: selectedShippingTotal,
      amountCop: checkoutTotal,
      methods: quote.items.map((line) => {
        const selectedId = selectedMethods[lineId(line.productSlug, line.variantSku)] || "";
        const option = line.options.find((entry) => entry.id === selectedId);
        return { productSlug: line.productSlug, variantSku: line.variantSku, methodId: selectedId, method: option?.method || "unknown" };
      }),
    });
    trackIntelligenceEvent({ type: "checkout_started", page: cartPath(market), quantity: checkoutItems.reduce((total, item) => total + item.quantity, 0), valueCop: quote.productSubtotalCop + quote.items.reduce((total, line) => total + (line.options.find((option) => option.id === selectedMethods[lineId(line.productSlug, line.variantSku)])?.amountCop || 0), 0), value: checkoutTotal, ...intelligenceContext });
    const analyticsItems = visibleItems.map((item) => ({ item_id: item.product.sku, item_name: item.product.name, item_category: item.product.niche, item_variant: item.variantSku, price: item.unitPrice ?? undefined, quantity: item.quantity }));
    trackCommerceEvent({ name: "begin_checkout", market, value: checkoutTotal, items: analyticsItems });
    try {
      setIsPreparing(true);
      setStatus(es ? "Verificando inventario, registrando el pedido y preparando Wompi…" : "Verifying inventory and preparing secure checkout…");
      const result = await beginCheckout({ market, customerEmail: destination.email, destination, items: checkoutItems });
      recordCheckoutAuditEvent("checkout-created", {
        provider: result.provider,
        reference: result.externalReference,
        productSubtotalCop: result.productSubtotalCop,
        shippingCostCop: result.shippingCostCop,
        amountCop: result.amountCop,
      });
      trackIntelligenceEvent({ type: "checkout_created", page: cartPath(market), quantity: checkoutItems.reduce((total, item) => total + item.quantity, 0), valueCop: result.amountCop, value: result.amount, ...intelligenceContext });
      storePendingPurchase(result.externalReference, { market, currency: result.currency, value: result.amount, paymentType: result.provider, items: analyticsItems });
      trackCommerceEvent({ name: "add_payment_info", market, currency: result.currency, value: result.amount, paymentType: result.provider, items: analyticsItems });
      setStatus(result.message || (es ? "Redirigiendo al pago seguro…" : "Redirecting to secure payment…"));
      window.location.assign(result.checkoutUrl);
    } catch (error) {
      recordCheckoutAuditEvent("checkout-failed", { reason: "checkout-api-or-provider" });
      trackIntelligenceEvent({ type: "checkout_failed", page: cartPath(market), quantity: checkoutItems.reduce((total, item) => total + item.quantity, 0), valueCop: checkoutTotal, value: checkoutTotal, ...intelligenceContext });
      trackCommerceEvent({ name: "checkout_error", market, value: checkoutTotal, errorCode: "payment_preparation_failed", items: analyticsItems });
      setStatus(error instanceof Error ? error.message : (es ? "No fue posible iniciar el pago." : "Payment could not be started."));
      setIsPreparing(false);
    }
  }

  const optionAmount = (option: CjShippingQuoteOption) => market === "co" ? option.amountCop : option.amountUsd;
  const selectedShippingTotal = quote?.items.reduce((total, line) => {
    const selected = line.options.find((option) => option.id === selectedMethods[lineId(line.productSlug, line.variantSku)]);
    return total + (selected ? optionAmount(selected) : 0);
  }, 0) || 0;
  const checkoutTotal = Math.round(((quote?.productSubtotal || 0) + selectedShippingTotal) * 100) / 100;

  return <section aria-labelledby="cart-title">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-emerald">{es ? "Compra segura" : "Secure shopping"}</p>
        <h1 id="cart-title" className="mt-2 text-3xl font-semibold text-white sm:text-4xl">{es ? "Tu carrito" : "Your cart"}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-silver/70">{es ? "Ajusta cantidades y consulta las opciones oficiales de CJ. El envío se suma al total antes de pagar." : "Adjust quantities and request official CJ shipping options. Shipping is added to the total before checkout."}</p>
      </div>
      <Link href={markets[market].homePath} className="rounded-full border border-silver/25 px-4 py-2 text-sm font-semibold text-white hover:border-emerald hover:text-emerald">{es ? "Seguir comprando" : "Continue shopping"}</Link>
    </div>

    {auditId && <aside className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-300/30 bg-sky-300/[.06] p-4" aria-label={es ? "Auditoría de compra activa" : "Active purchase audit"}>
      <div>
        <p className="text-sm font-semibold text-sky-100">{es ? "Bitácora privada de prueba activa" : "Private test log active"}</p>
        <p className="mt-1 text-xs leading-5 text-silver/65">{es ? "Registra tiempos, estilos, tarifas, totales y estados técnicos. No guarda tus datos de contacto, dirección, tarjeta ni credenciales." : "It records timing, styles, rates, totals, and technical states. It does not store contact details, addresses, card data, or credentials."}</p>
      </div>
      <button type="button" onClick={() => downloadCheckoutAudit()} className="rounded-lg border border-sky-200/35 px-3 py-2 text-xs font-semibold text-sky-100 hover:border-sky-100">{es ? "Descargar bitácora JSON" : "Download JSON log"}</button>
    </aside>}

    {!hydrated ? <div className="mt-10 rounded-2xl border border-silver/15 bg-white/[.025] p-8 text-center" role="status">
      <p className="text-lg font-semibold text-white">{es ? "Restaurando tu carrito…" : "Restoring your cart…"}</p>
      <p className="mt-2 text-sm text-silver/70">{es ? "Estamos recuperando los artículos guardados en este dispositivo." : "We are restoring the items saved on this device."}</p>
    </div> : !items.length ? <div className="mt-10 rounded-2xl border border-silver/15 bg-white/[.025] p-8 text-center">
      <p className="text-lg font-semibold text-white">{es ? "Tu carrito está vacío." : "Your cart is empty."}</p>
      <p className="mt-2 text-sm text-silver/65">{es ? "Elige un estilo y la cantidad desde cualquier producto." : "Choose a style and quantity from any product."}</p>
      <Link href={markets[market].homePath} className="mt-5 inline-flex rounded-full bg-emerald px-5 py-2.5 text-sm font-bold text-onyx">{es ? "Explorar productos" : "Explore products"}</Link>
    </div> : <>
      {invalidItems.length > 0 && <div className="mt-8 rounded-2xl border border-amber-300/30 bg-amber-300/[.07] p-4" role="alert">
        <p className="font-semibold text-amber-100">{es ? `Revisa ${invalidItems.length === 1 ? "un artículo" : `${invalidItems.length} artículos`} antes de cotizar.` : `Review ${invalidItems.length} item${invalidItems.length === 1 ? "" : "s"} before requesting shipping.`}</p>
        <p className="mt-1 text-sm leading-6 text-silver/75">{es ? "Algún estilo cambió, perdió disponibilidad o ya no está en el catálogo. Retira el artículo del carrito y elige una opción vigente." : "A style changed, became unavailable, or left the catalog. Remove that cart item and choose an available option."}</p>
      </div>}
      <div className="mt-8 space-y-3">
        {visibleItems.map((item) => {
          const variant = item.variant;
          const maximumQuantity = Math.max(1, Math.min(
            maxUnitsPerLine,
            item.product.stock,
            maxCartUnits - (itemCount - item.quantity),
          ));
          return <article key={lineId(item.productSlug, item.variantSku)} className="grid gap-4 rounded-2xl border border-silver/15 bg-white/[.025] p-4 sm:grid-cols-[7rem_1fr_auto] sm:items-center">
            <div className="w-28"><ProductArt product={item.product} image={variant?.image} alt={variant?.image?.alt || item.product.image.alt} /></div>
            <div>
              <h2 className="font-semibold text-white">{item.product.name}</h2>
              <p className="mt-1 text-xs text-silver/60">{es ? "Estilo" : "Style"}: {variant?.options || variant?.label || item.variantSku}</p>
              <p className="mt-2 text-sm font-semibold text-emerald">{formatMoney(item.unitPrice ?? 0, market)} {es ? "por unidad" : "per unit"}</p>
              {!item.product.available || !variant || item.product.stock < item.quantity ? <p className="mt-2 text-xs font-semibold text-amber-100">{es ? "No disponible para esta cantidad o estilo." : "Unavailable for this quantity or style."}</p> : null}
            </div>
            <div className="flex items-end gap-3">
              <QuantityStepper value={item.quantity} max={maximumQuantity} onChange={(quantity) => { updateQuantity(item.productSlug, item.variantSku, quantity); recordCheckoutAuditEvent("cart-quantity-changed", { productSlug: item.productSlug, variantSku: item.variantSku, quantity }); clearQuote(); }} className="w-36" market={market} />
              <button type="button" onClick={() => { removeItem(item.productSlug, item.variantSku); recordCheckoutAuditEvent("cart-item-removed", { productSlug: item.productSlug, variantSku: item.variantSku }); trackIntelligenceEvent({ type: "cart_removed", page: cartPath(market), productSlug: item.productSlug, productSku: item.product.sku, variantSku: item.variantSku, niche: item.product.niche, quantity: item.quantity, valueCop: (item.unitPriceCop ?? 0) * item.quantity, value: (item.unitPrice ?? 0) * item.quantity, ...intelligenceContext }); trackCommerceEvent({ name: "remove_from_cart", market, value: (item.unitPrice ?? 0) * item.quantity, items: [{ item_id: item.product.sku, item_name: item.product.name, item_category: item.product.niche, item_variant: item.variantSku, price: item.unitPrice ?? undefined, quantity: item.quantity }] }); clearQuote(); }} className="rounded-lg border border-red-300/30 px-3 py-2 text-xs font-semibold text-red-200 hover:border-red-300">{es ? "Quitar" : "Remove"}</button>
            </div>
          </article>;
        })}
        {orphanedItems.map((item) => <article key={lineId(item.productSlug, item.variantSku)} className="grid gap-4 rounded-2xl border border-amber-300/30 bg-amber-300/[.06] p-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <h2 className="font-semibold text-white">{es ? "Artículo retirado del catálogo" : "Item removed from the catalog"}</h2>
            <p className="mt-1 text-xs text-silver/70">{es ? "Referencia guardada" : "Saved reference"}: {item.productSlug} · {item.variantSku}</p>
            <p className="mt-2 text-xs font-semibold text-amber-100">{es ? "Ya no puede cotizarse ni pagarse. Quítalo para continuar." : "It can no longer be quoted or purchased. Remove it to continue."}</p>
          </div>
          <button type="button" onClick={() => { removeItem(item.productSlug, item.variantSku); trackIntelligenceEvent({ type: "cart_removed", page: cartPath(market), productSlug: item.productSlug, variantSku: item.variantSku, quantity: item.quantity, ...intelligenceContext }); clearQuote(); }} className="w-fit rounded-lg border border-red-300/30 px-3 py-2 text-xs font-semibold text-red-200 hover:border-red-300">{es ? "Quitar" : "Remove"}</button>
        </article>)}
      </div>

      <form onSubmit={calculateShipping} className="mt-8 space-y-5 rounded-2xl border border-emerald/30 bg-emerald/[.05] p-5">
        <div>
          <h2 className="text-xl font-semibold text-white">{es ? `Entrega y envío (${itemCount} unidad${itemCount === 1 ? "" : "es"})` : `Delivery and shipping (${itemCount} unit${itemCount === 1 ? "" : "s"})`}</h2>
          <p className="mt-2 text-xs leading-5 text-silver/65">{es ? "CJ puede despachar productos desde bodegas diferentes. Nexora cotiza cada línea sin estimaciones inventadas, marca la alternativa más económica y permite elegir opciones más rápidas cuando el proveedor las ofrece." : "CJ may dispatch products from different warehouses. Nexora quotes every line without invented estimates, highlights the lowest-cost option, and lets you choose faster options when CJ offers them."}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={es ? "Nombre de quien recibe" : "Recipient name"}><input value={destination.recipientName} onChange={(event) => updateDestination("recipientName", event.target.value)} required autoComplete="name" /></Field>
          <Field label={es ? "Correo para confirmación" : "Confirmation email"}><input type="email" value={destination.email} onChange={(event) => updateDestination("email", event.target.value)} required autoComplete="email" placeholder={es ? "tu@correo.com" : "you@example.com"} /></Field>
          <Field label={es ? "Teléfono con indicativo" : "Phone with country code"}><input type="tel" value={destination.phone} onChange={(event) => updateDestination("phone", event.target.value)} required autoComplete="tel" placeholder={es ? "+57…" : "+1…"} /></Field>
          <div className="sm:col-span-2"><p className="text-[11px] leading-4 text-silver/55">{es ? "El país determina las opciones logísticas que CJ puede ofrecer." : "The country determines which CJ logistics options are available."}</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_.35fr]">
          <Field label={es ? "Dirección de entrega" : "Street address"}><input value={destination.address1} onChange={(event) => updateDestination("address1", event.target.value)} required autoComplete="address-line1" /></Field>
          <Field label={es ? "Número de la dirección" : "Street number"}><input value={destination.houseNumber || ""} onChange={(event) => updateDestination("houseNumber", event.target.value)} required placeholder={es ? "12-34" : "123"} autoComplete="address-line1" /></Field>
        </div>
        <Field label={es ? "Complemento (opcional)" : "Apartment, suite, or unit (optional)"}><input value={destination.address2 || ""} onChange={(event) => updateDestination("address2", event.target.value)} autoComplete="address-line2" placeholder={es ? "Torre, piso, indicaciones" : "Apartment, suite, unit"} /></Field>
        <Field label={es ? "Barrio / localidad" : "County"}><input value={destination.district || ""} onChange={(event) => updateDestination("district", event.target.value)} required placeholder={es ? "Dato requerido por algunos métodos CJ" : "Required by some CJ shipping methods"} /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <MarketLocationFields market={market} destination={destination} onChange={updateDestination} />
        </div>
        <p className="text-[11px] leading-4 text-silver/55">{es ? "Estos datos se usan para la cotización real, el registro privado del pedido y su seguimiento. Nexora nunca recibe ni almacena datos de tarjeta." : "These details are used for the actual quote and order operations. Nexora never receives or stores card data."}</p>
        <button type="submit" disabled={isPreparing || invalidItems.length > 0} className="rounded-lg bg-emerald px-4 py-2.5 text-sm font-bold text-onyx disabled:cursor-not-allowed disabled:bg-silver/30">{isPreparing && !quote ? (es ? "Cotizando con CJ…" : "Requesting CJ rates…") : quoteExpired ? (es ? "Volver a cotizar el envío" : "Request a new quote") : (es ? "Cotizar envío real del carrito" : "Get actual cart shipping rates")}</button>

        {quote && <div className="space-y-5 border-t border-emerald/20 pt-5">
          {quote.items.map((line) => <fieldset key={lineId(line.productSlug, line.variantSku)} className="space-y-2 rounded-xl border border-silver/15 bg-onyx/45 p-4">
            <legend className="px-2 text-sm font-semibold text-white">{line.quantity}× {line.productName} · {line.variantLabel}</legend>
            {line.options.map((option) => {
              const badge = optionBadge(option, market);
              const checked = selectedMethods[lineId(line.productSlug, line.variantSku)] === option.id;
              return <label key={option.id} className={`block cursor-pointer rounded-xl border p-3 ${checked ? "border-emerald bg-emerald/[.09]" : "border-silver/20"}`}>
                <div className="flex items-start gap-3">
                  <input type="radio" name={`shipping-${lineId(line.productSlug, line.variantSku)}`} value={option.id} checked={checked} onChange={() => { setSelectedMethods((current) => ({ ...current, [lineId(line.productSlug, line.variantSku)]: option.id })); recordCheckoutAuditEvent("shipping-method-selected", { productSlug: line.productSlug, variantSku: line.variantSku, methodId: option.id, method: option.method, amountCop: option.amountCop }); trackIntelligenceEvent({ type: "shipping_method_selected", page: cartPath(market), productSlug: line.productSlug, variantSku: line.variantSku, quantity: line.quantity, valueCop: option.amountCop, value: optionAmount(option), ...intelligenceContext }); }} className="mt-1 accent-[#009473]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold text-white">{option.method}</span><span className="font-semibold text-emerald">{formatMoney(optionAmount(option), market)}</span></div>
                    {badge && <span className="mt-1 inline-flex rounded-full bg-emerald/15 px-2 py-0.5 text-[10px] font-bold text-emerald">{badge}</span>}
                    <p className="mt-1 text-xs text-silver/65">{option.carrier && option.carrier !== option.method ? `${option.carrier} · ` : ""}{deliveryText(option, market)}</p>
                    <p className="mt-1 text-[11px] text-silver/50">{es ? "Origen de inventario CJ" : "CJ inventory origin"}: {option.sourceCountryCode}</p>
                    {option.remoteFeeCop ? <p className="mt-1 text-[11px] text-silver/50">{es ? "Incluye zona remota" : "Includes remote-area fee"}: {formatMoney(market === "co" ? option.remoteFeeCop : (option.remoteFeeUsd || 0), market)}</p> : null}
                    {option.notices.map((notice) => <p key={notice} className="mt-1 text-[11px] text-amber-100">{notice}</p>)}
                  </div>
                </div>
              </label>;
            })}
          </fieldset>)}

          <div className="rounded-xl border border-silver/20 bg-onyx/70 p-4 text-sm">
            <div className="flex justify-between text-silver/70"><span>{es ? "Productos" : "Products"}</span><span>{formatMoney(quote.productSubtotal, market)}</span></div>
            <div className="mt-2 flex justify-between text-silver/70"><span>{es ? "Envíos CJ seleccionados" : "Selected CJ shipping"}</span><span>{formatMoney(selectedShippingTotal, market)}</span></div>
            <div className="mt-3 flex justify-between border-t border-silver/15 pt-3 font-semibold text-white"><span>{es ? "Total en Wompi" : "Total in PayPal"}</span><span>{formatMoney(checkoutTotal, market)}</span></div>
            <p className={`mt-2 text-[11px] ${quoteExpired ? "font-semibold text-amber-100" : "text-silver/70"}`}>{quoteExpired ? (es ? "Esta cotización venció; vuelve a consultar CJ antes de pagar." : "This quote expired; request new CJ rates before checkout.") : (es ? `Tarifas válidas hasta ${new Date(quote.expiresAt).toLocaleTimeString(markets[market].locale, { hour: "2-digit", minute: "2-digit" })}. Si cambias artículos, cantidades o dirección, vuelve a cotizar.` : `Rates valid until ${new Date(quote.expiresAt).toLocaleTimeString(markets[market].locale, { hour: "numeric", minute: "2-digit" })}. Request a new quote after changing items, quantities, or address.`)}</p>
            <button type="button" onClick={pay} disabled={isPreparing || quoteExpired} className="mt-4 w-full rounded-lg bg-emerald px-4 py-3 text-sm font-bold text-onyx disabled:cursor-not-allowed disabled:bg-silver/30">{isPreparing ? (es ? "Preparando pago seguro…" : "Preparing secure payment…") : quoteExpired ? (es ? "Cotización vencida · vuelve a cotizar" : "Quote expired · request new rates") : es ? `Pagar de forma segura con Wompi · ${formatMoney(checkoutTotal, market)}` : `Pay securely with PayPal · ${formatMoney(checkoutTotal, market)}`}</button>
          </div>
        </div>}
        {status && <p aria-live="polite" className="text-sm text-silver/75">{status}</p>}
      </form>
    </>}
  </section>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-white">{label}
    <span className="mt-1.5 block [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-silver/25 [&_input]:bg-onyx [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_input]:font-normal [&_input]:text-white [&_input]:placeholder:text-silver/40 [&_input]:focus:border-emerald [&_input]:focus:outline-none">{children}</span>
  </label>;
}
