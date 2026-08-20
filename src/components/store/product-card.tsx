"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { cartPath, formatMoney, getDictionary, markets, productPath } from "@/lib/i18n/config";
import { getProductPresentation, type StorefrontProduct } from "@/lib/product-presentation";
import { trackIntelligenceEvent } from "@/lib/intelligence/client";
import { trackCommerceEvent } from "@/lib/analytics/client";
import { maxCartLines, maxCartUnits, maxUnitsPerLine, useCart } from "./cart-context";
import { useNexy } from "./nexy-context";
import { ProductArt } from "./product-art";
import { QuantityStepper } from "./quantity-stepper";
import { useOptionalProductVariant } from "./product-variant-context";

type ProductStatus = {
  message: string;
  tone: "success" | "warning";
};

export function ProductCard({ product, priority = false, showArt = true }: { product: StorefrontProduct; priority?: boolean; showArt?: boolean }) {
  const [status, setStatus] = useState<ProductStatus | null>(null);
  const [quantity, setQuantity] = useState(1);
  const styleSelectRef = useRef<HTMLSelectElement>(null);
  const variantContext = useOptionalProductVariant();
  const [localVariantSku, setLocalVariantSku] = useState(product.variants.length === 1 ? product.variants[0].sku : "");
  const variantSku = variantContext?.variantSku ?? localVariantSku;
  const setVariantSku = variantContext?.setVariantSku ?? setLocalVariantSku;
  const selectedVariant = product.variants.find((variant) => variant.sku === variantSku);
  const displayedPrice = selectedVariant?.price ?? product.price;
  const displayedPriceCop = selectedVariant?.sourcePriceCop ?? product.sourcePriceCop;
  const presentation = getProductPresentation(product, product.market);
  const dictionary = getDictionary(product.market);
  const productHref = productPath(product.market, product.slug);
  const intelligenceContext = {
    market: product.market,
    locale: markets[product.market].locale,
    currency: markets[product.market].currency,
  } as const;
  const { announceProduct } = useNexy();
  const { addItem, hydrated, itemCount, items } = useCart();
  const maximumProductQuantity = Math.min(maxUnitsPerLine, Math.max(1, product.stock));

  function announceInterest(intent: "view" | "buy") {
    announceProduct({ category: product.category, market: product.market }, intent);
    if (intent === "view") {
      trackIntelligenceEvent({ type: "product_viewed", page: productHref, productSlug: product.slug, productSku: product.sku, niche: product.niche, ...intelligenceContext });
      trackCommerceEvent({ name: "select_item", market: product.market, itemListId: product.niche, items: [{ item_id: product.sku, item_name: presentation.title, item_category: product.niche, price: displayedPrice ?? undefined, quantity: 1 }] });
    }
  }

  function addToCart() {
    if (!hydrated || !product.available) return;
    if (!variantSku) {
      setStatus({ message: product.market === "co" ? "Antes de agregar este producto, selecciona el estilo que prefieres." : "Choose your preferred style before adding this product.", tone: "warning" });
      styleSelectRef.current?.focus();
      styleSelectRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const existing = items.find((item) => item.productSlug === product.slug && item.variantSku === variantSku);
    if (!existing && items.length >= maxCartLines) {
      setStatus({ message: product.market === "co" ? `El carrito admite hasta ${maxCartLines} estilos distintos. Finaliza este pedido o quita uno antes de agregar otro.` : `Your cart supports up to ${maxCartLines} different styles. Complete this order or remove one before adding another.`, tone: "warning" });
      return;
    }
    if ((existing?.quantity || 0) + quantity > maximumProductQuantity) {
      setStatus({ message: product.market === "co" ? `Puedes llevar máximo ${maximumProductQuantity} unidad${maximumProductQuantity === 1 ? "" : "es"} de este estilo en el pedido actual.` : `You may add up to ${maximumProductQuantity} unit${maximumProductQuantity === 1 ? "" : "s"} of this style to the current order.`, tone: "warning" });
      return;
    }
    if (itemCount + quantity > maxCartUnits) {
      setStatus({ message: product.market === "co" ? `El pedido admite hasta ${maxCartUnits} unidades en total para poder cotizarlo con CJ.` : `An order may contain up to ${maxCartUnits} total units so CJ can quote it reliably.`, tone: "warning" });
      return;
    }
    addItem({ productSlug: product.slug, variantSku, quantity });
    trackIntelligenceEvent({ type: "cart_added", page: window.location.pathname, productSlug: product.slug, productSku: product.sku, variantSku, niche: product.niche, quantity, valueCop: displayedPriceCop === null ? undefined : displayedPriceCop * quantity, value: displayedPrice === null ? undefined : displayedPrice * quantity, ...intelligenceContext });
    trackCommerceEvent({ name: "add_to_cart", market: product.market, value: displayedPrice === null ? undefined : displayedPrice * quantity, items: [{ item_id: product.sku, item_name: presentation.title, item_category: product.niche, item_variant: selectedVariant?.options || selectedVariant?.label || variantSku, price: displayedPrice ?? undefined, quantity }] });
    announceInterest("buy");
    setStatus({ message: product.market === "co" ? `${quantity} unidad${quantity === 1 ? "" : "es"} agregada${quantity === 1 ? "" : "s"}. Puedes seguir comprando o revisar el carrito.` : `${quantity} unit${quantity === 1 ? "" : "s"} added. Continue shopping or review your cart.`, tone: "success" });
  }

  const reviewSummary = product.reviewCount > 0 && product.rating > 0
    ? `★ ${product.rating} (${product.reviewCount})`
    : dictionary.noReviews;
  const purchaseLabel = !hydrated ? (product.market === "co" ? "Preparando carrito…" : "Preparing cart…") : !product.available ? product.stock < 1 ? dictionary.outOfStock : dictionary.unavailable : dictionary.addToCart;

  return <article className="group rounded-2xl border border-silver/15 bg-white/[0.025] p-3 transition hover:border-silver/35">
    {showArt && <Link href={productHref} onClick={() => announceInterest("view")} aria-label={`${dictionary.viewProduct} ${presentation.title}`} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald"><ProductArt product={product} image={selectedVariant?.image} priority={priority} alt={selectedVariant?.image?.alt || presentation.imageAlt} market={product.market} /></Link>}
    <div className="px-1 pt-5 pb-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald">{reviewSummary}</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{showArt ? <Link href={productHref} onClick={() => announceInterest("view")} className="hover:text-emerald">{presentation.title}</Link> : presentation.title}</h3>
        </div>
        {product.stock < 5 && <span className="rounded-full bg-red-400/10 px-2 py-1 text-[10px] font-bold uppercase text-red-300">{dictionary.lastUnits}</span>}
      </div>
      <p className="mt-2 min-h-10 text-sm leading-5 text-silver/70">{presentation.cardDescription}</p>
      <div className="mt-5">
        <p className="text-lg font-semibold text-white">{displayedPrice === null ? dictionary.exchangeUnavailable : <>{!selectedVariant && product.variants.length > 1 ? (product.market === "co" ? "Desde " : "From ") : ""}{formatMoney(displayedPrice, product.market)}</>}</p>
        <p className="mt-1 text-[11px] text-silver/55">{dictionary.shippingCalculated}</p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_9rem]">
        <label className="text-xs font-semibold text-white">{dictionary.style}
          <select ref={styleSelectRef} value={variantSku} onChange={(event) => { const next = event.target.value; setVariantSku(next); setStatus(null); if (next) trackIntelligenceEvent({ type: "variant_selected", page: window.location.pathname, productSlug: product.slug, productSku: product.sku, variantSku: next, niche: product.niche, ...intelligenceContext }); }} disabled={!product.available} required aria-invalid={status?.tone === "warning" && !variantSku} aria-describedby={`${product.slug}-style-help`} className={`mt-1.5 min-h-11 w-full rounded-lg border bg-onyx px-3 py-2 text-sm font-normal text-white focus:border-emerald focus:outline-none disabled:opacity-50 ${status?.tone === "warning" && !variantSku ? "border-amber-300" : "border-silver/25"}`}>
            {product.variants.length !== 1 && <option value="">{dictionary.selectStyle}</option>}
            {product.variants.map((variant) => <option key={variant.sku} value={variant.sku}>{variant.options || variant.label}</option>)}
          </select>
        </label>
        <QuantityStepper value={quantity} max={maximumProductQuantity} onChange={setQuantity} disabled={!product.available} market={product.market} />
      </div>
      {product.variants.length > 1 && !variantSku && <p id={`${product.slug}-style-help`} className="mt-2 text-xs text-amber-100">{dictionary.selectStyleHelp}</p>}
      {!product.variants.length && <p className="mt-3 rounded-lg bg-red-400/10 px-3 py-2 text-xs text-red-200">{product.market === "co" ? "CJ no reportó un estilo verificable; este artículo no puede añadirse al checkout todavía." : "CJ did not report a verifiable style, so this item cannot be added to checkout yet."}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={addToCart} disabled={!hydrated || !product.available || !product.variants.length || displayedPrice === null} className="rounded-full bg-emerald px-4 py-2.5 text-sm font-bold text-onyx transition hover:bg-emerald/85 disabled:cursor-not-allowed disabled:bg-silver/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald">{purchaseLabel}</button>
        <Link href={cartPath(product.market)} className="rounded-full border border-silver/25 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-emerald hover:text-emerald">{dictionary.viewCart}</Link>
      </div>
      {status && <p role={status.tone === "warning" ? "alert" : "status"} className={`mt-3 rounded-lg px-3 py-2 text-xs ${status.tone === "warning" ? "bg-amber-300/10 text-amber-100" : "bg-emerald/10 text-emerald"}`}>{status.message}</p>}
    </div>
  </article>;
}
