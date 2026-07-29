"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { beginCheckout } from "@/lib/payments";
import { getProductPresentation, type StorefrontProduct } from "@/lib/product-presentation";
import { formatCOP } from "@/lib/products";
import type { CjShippingQuoteOption, ShippingDestinationInput } from "@/lib/shipping/types";
import { useNexy } from "./nexy-context";
import { ProductArt } from "./product-art";

type QuoteState = {
  quoteToken: string;
  expiresAt: string;
  productSubtotalCop: number;
  options: CjShippingQuoteOption[];
};

const emptyDestination: ShippingDestinationInput = {
  recipientName: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  countryCode: "",
  postalCode: "",
  houseNumber: "",
};

function deliveryText(option: CjShippingQuoteOption) {
  return option.estimatedDelivery
    ? `Entrega estimada por CJ: ${option.estimatedDelivery}`
    : "CJ confirmará el tiempo de entrega al procesar el despacho.";
}

function optionBadge(option: CjShippingQuoteOption) {
  if (option.recommendation === "cheapest") return "Más económica · sugerida";
  if (option.recommendation === "fastest") return "Más rápida";
  return null;
}

function validQuotePayload(value: unknown): value is QuoteState {
  if (!value || typeof value !== "object") return false;
  const quote = value as Partial<QuoteState>;
  return typeof quote.quoteToken === "string"
    && typeof quote.expiresAt === "string"
    && typeof quote.productSubtotalCop === "number"
    && Array.isArray(quote.options)
    && quote.options.length > 0;
}

export function ProductCard({ product, priority = false, showArt = true }: { product: StorefrontProduct; priority?: boolean; showArt?: boolean }) {
  const [status, setStatus] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [destination, setDestination] = useState<ShippingDestinationInput>(emptyDestination);
  const [variantSku, setVariantSku] = useState(product.variants.length === 1 ? product.variants[0].sku : "");
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [selectedShippingMethodId, setSelectedShippingMethodId] = useState("");
  const available = product.available;
  const presentation = getProductPresentation(product);
  const { announceProduct } = useNexy();
  const selectedShipping = quote?.options.find((option) => option.id === selectedShippingMethodId) || null;

  function announceInterest(intent: "view" | "buy") {
    announceProduct({ category: product.category }, intent);
  }

  function clearQuote() {
    setQuote(null);
    setSelectedShippingMethodId("");
  }

  function startCheckout() {
    if (!available || isPreparing) return;
    announceInterest("buy");
    setStatus(null);
    setShowCheckout(true);
  }

  function updateDestination(field: keyof ShippingDestinationInput, value: string) {
    clearQuote();
    setDestination((current) => ({
      ...current,
      [field]: field === "countryCode" ? value.toUpperCase() : value,
    }));
  }

  function updateVariant(value: string) {
    clearQuote();
    setVariantSku(value);
  }

  async function calculateShipping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!available || isPreparing) return;
    clearQuote();
    try {
      setIsPreparing(true);
      setStatus("Consultando las opciones reales de envío en CJ…");
      const response = await fetch("/api/shipping/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productSlug: product.slug, variantSku, destination }),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "No fue posible cotizar el envío.");
      if (!validQuotePayload(payload)) throw new Error("CJ no devolvió una cotización válida. Intenta de nuevo antes de pagar.");
      const suggested = payload.options.find((option) => option.recommendation === "cheapest") || payload.options[0];
      setQuote(payload);
      setSelectedShippingMethodId(suggested.id);
      setStatus("Elige una opción de envío y continúa al pago seguro.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No fue posible cotizar el envío.");
    } finally {
      setIsPreparing(false);
    }
  }

  async function buy() {
    if (!available || isPreparing || !quote || !selectedShipping) return;
    try {
      setIsPreparing(true);
      setStatus("Registrando el pedido y preparando el pago seguro…");
      const result = await beginCheckout(product, {
        customerEmail: destination.email,
        variantSku,
        destination,
        shippingQuoteToken: quote.quoteToken,
        shippingMethodId: selectedShipping.id,
      });
      setStatus(result.message || "Redirigiendo al checkout seguro…");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No fue posible iniciar el pago.");
      setIsPreparing(false);
    }
  }

  const reviewSummary = product.reviewCount > 0 && product.rating > 0
    ? `★ ${product.rating} (${product.reviewCount})`
    : "Nuevo · sin reseñas verificadas";
  const purchaseLabel = isPreparing
    ? "Preparando…"
    : !available
      ? product.stock < 1 ? "Agotado" : "No disponible"
      : "Comprar";
  const checkoutTotal = quote && selectedShipping ? quote.productSubtotalCop + selectedShipping.amountCop : null;

  return <article className="group rounded-2xl border border-silver/15 bg-white/[0.025] p-3 transition hover:border-silver/35">
    {showArt && <Link href={`/productos/${product.slug}`} onClick={() => announceInterest("view")} aria-label={`Ver ${presentation.title}`} className="block rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald"><ProductArt product={product} priority={priority} alt={presentation.imageAlt} /></Link>}
    <div className="px-1 pt-5 pb-2">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-emerald">{reviewSummary}</p>
          <h3 className="mt-2 text-lg font-semibold text-white">{showArt ? <Link href={`/productos/${product.slug}`} onClick={() => announceInterest("view")} className="hover:text-emerald">{presentation.title}</Link> : presentation.title}</h3>
        </div>
        {product.stock < 5 && <span className="rounded-full bg-red-400/10 px-2 py-1 text-[10px] font-bold uppercase text-red-300">Últimas unidades</span>}
      </div>
      <p className="mt-2 min-h-10 text-sm leading-5 text-silver/70">{presentation.cardDescription}</p>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-white">{formatCOP(product.price)}</p>
          <p className="mt-1 text-[11px] text-silver/55">Envío cotizado por destino antes de pagar.</p>
          {product.compareAtPrice && <p className="text-xs text-silver/45 line-through">{formatCOP(product.compareAtPrice)}</p>}
        </div>
        <button onClick={startCheckout} disabled={!available || isPreparing} className="rounded-full bg-emerald px-4 py-2.5 text-sm font-bold text-onyx transition hover:bg-emerald/85 disabled:cursor-not-allowed disabled:bg-silver/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald">{purchaseLabel}</button>
      </div>

      {showCheckout && <form onSubmit={calculateShipping} className="mt-4 space-y-4 rounded-xl border border-emerald/30 bg-emerald/[.06] p-3" aria-label={`Entrega y envío para ${presentation.title}`}>
        <div>
          <p className="text-sm font-semibold text-white">Entrega y método de envío</p>
          <p className="mt-1 text-[11px] leading-4 text-silver/65">Cotizamos directamente con CJ para tu variante y destino. Nexora sugiere la opción más económica, pero puedes escoger cualquiera antes de pagar.</p>
        </div>

        {product.variants.length > 1 && <label className="block text-xs font-semibold text-white">Variante
          <select value={variantSku} onChange={(event) => updateVariant(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-silver/25 bg-onyx px-3 py-2 text-sm font-normal text-white focus:border-emerald focus:outline-none">
            <option value="">Selecciona una variante</option>
            {product.variants.map((variant) => <option key={variant.sku} value={variant.sku}>{variant.options || variant.label}</option>)}
          </select>
        </label>}
        {!product.variants.length && <p className="rounded-lg bg-red-400/10 px-3 py-2 text-xs text-red-200">Este producto no tiene una variante verificable para cotizar. No se puede cobrar hasta que CJ complete su ficha.</p>}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre de quien recibe"><input value={destination.recipientName} onChange={(event) => updateDestination("recipientName", event.target.value)} required autoComplete="name" placeholder="Nombre completo" /></Field>
          <Field label="Correo para confirmación"><input type="email" value={destination.email} onChange={(event) => updateDestination("email", event.target.value)} required autoComplete="email" placeholder="tu@correo.com" /></Field>
          <Field label="Teléfono de entrega"><input type="tel" value={destination.phone} onChange={(event) => updateDestination("phone", event.target.value)} required autoComplete="tel" placeholder="Con indicativo" /></Field>
          <Field label="País (ISO)"><input list={`countries-${product.slug}`} value={destination.countryCode} onChange={(event) => updateDestination("countryCode", event.target.value)} required maxLength={2} autoComplete="country" className="uppercase" placeholder="CO" /><datalist id={`countries-${product.slug}`}><option value="CO">Colombia</option><option value="US">Estados Unidos</option></datalist></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_.4fr]">
          <Field label="Dirección de entrega"><input value={destination.address1} onChange={(event) => updateDestination("address1", event.target.value)} required autoComplete="address-line1" placeholder="Calle o vía principal" /></Field>
          <Field label="Número de casa"><input value={destination.houseNumber || ""} onChange={(event) => updateDestination("houseNumber", event.target.value)} autoComplete="address-line1" placeholder="Ej. 12-34" /></Field>
        </div>
        <Field label="Complemento de dirección (opcional)"><input value={destination.address2 || ""} onChange={(event) => updateDestination("address2", event.target.value)} autoComplete="address-line2" placeholder="Torre, piso, indicaciones" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Ciudad"><input value={destination.city} onChange={(event) => updateDestination("city", event.target.value)} required autoComplete="address-level2" /></Field>
          <Field label="Departamento / estado"><input value={destination.region} onChange={(event) => updateDestination("region", event.target.value)} required autoComplete="address-level1" /></Field>
          <Field label="Código postal"><input value={destination.postalCode} onChange={(event) => updateDestination("postalCode", event.target.value)} required autoComplete="postal-code" /></Field>
        </div>
        <p className="text-[11px] leading-4 text-silver/55">Usamos estos datos mínimos para obtener una tarifa real de CJ y, tras un pago aprobado, cumplir y dar seguimiento al pedido. Nexora no recibe ni guarda datos de tarjeta.</p>
        <button type="submit" disabled={!available || !variantSku || !product.variants.length || isPreparing} className="rounded-lg border border-emerald/50 bg-emerald px-3 py-2 text-xs font-bold text-onyx transition hover:bg-emerald/85 disabled:cursor-not-allowed disabled:bg-silver/30">{isPreparing && !quote ? "Cotizando con CJ…" : "Cotizar envío real"}</button>

        {quote && <fieldset className="space-y-2 border-t border-emerald/20 pt-4">
          <legend className="text-sm font-semibold text-white">Opciones verificadas por CJ</legend>
          <p className="mt-1 text-[11px] leading-4 text-silver/65">Tarifas para 1 unidad. La primera marcada como sugerida es la menor tarifa que CJ devolvió para este destino.</p>
          {quote.options.map((option) => {
            const badge = optionBadge(option);
            const checked = selectedShippingMethodId === option.id;
            return <label key={option.id} className={`block cursor-pointer rounded-xl border p-3 transition ${checked ? "border-emerald bg-emerald/[.09]" : "border-silver/20 bg-onyx/40 hover:border-silver/45"}`}>
              <div className="flex items-start gap-3">
                <input type="radio" name={`shipping-${product.slug}`} value={option.id} checked={checked} onChange={() => setSelectedShippingMethodId(option.id)} className="mt-1 accent-[#009473]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-white">{option.method}</p><p className="font-semibold text-emerald">{formatCOP(option.amountCop)}</p></div>
                  {badge && <span className="mt-1 inline-flex rounded-full bg-emerald/15 px-2 py-0.5 text-[10px] font-bold text-emerald">{badge}</span>}
                  <p className="mt-1 text-xs text-silver/65">{option.carrier && option.carrier !== option.method ? `${option.carrier} · ` : ""}{deliveryText(option)}</p>
                  <p className="mt-1 text-[11px] text-silver/50">Origen de inventario reportado por CJ: {option.sourceCountryCode}</p>
                  {option.remoteFeeCop ? <p className="mt-1 text-[11px] text-silver/50">Incluye recargo por zona remota de CJ: {formatCOP(option.remoteFeeCop)}</p> : null}
                  {option.notices.map((notice) => <p key={notice} className="mt-1 text-[11px] leading-4 text-amber-100">{notice}</p>)}
                </div>
              </div>
            </label>;
          })}
        </fieldset>}

        {quote && selectedShipping && <div className="rounded-xl border border-silver/20 bg-onyx/60 p-3 text-sm">
          <div className="flex justify-between gap-4 text-silver/70"><span>Producto</span><span>{formatCOP(quote.productSubtotalCop)}</span></div>
          <div className="mt-2 flex justify-between gap-4 text-silver/70"><span>Envío ({selectedShipping.method})</span><span>{formatCOP(selectedShipping.amountCop)}</span></div>
          <div className="mt-3 flex justify-between gap-4 border-t border-silver/15 pt-3 font-semibold text-white"><span>Total a pagar</span><span>{formatCOP(checkoutTotal || 0)}</span></div>
          <p className="mt-2 text-[11px] leading-4 text-silver/55">Cotización válida hasta {new Date(quote.expiresAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}. Si cambias dirección o variante, vuelve a cotizar.</p>
          <button type="button" onClick={buy} disabled={isPreparing || !selectedShipping} className="mt-3 w-full rounded-lg bg-emerald px-3 py-2.5 text-sm font-bold text-onyx transition hover:bg-emerald/85 disabled:cursor-not-allowed disabled:bg-silver/30">{isPreparing ? "Preparando pago seguro…" : `Continuar a pago seguro · ${formatCOP(checkoutTotal || 0)}`}</button>
        </div>}
        <button type="button" onClick={() => { setShowCheckout(false); setStatus(null); }} className="text-xs text-silver/60 hover:text-white">Cancelar</button>
      </form>}
      {status && <p aria-live="polite" className="mt-3 text-xs text-silver/70">{status}</p>}
    </div>
  </article>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-white">{label}
    <span className="mt-1.5 block [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-silver/25 [&_input]:bg-onyx [&_input]:px-3 [&_input]:py-2 [&_input]:text-sm [&_input]:font-normal [&_input]:text-white [&_input]:placeholder:text-silver/40 [&_input]:focus:border-emerald [&_input]:focus:outline-none">{children}</span>
  </label>;
}
