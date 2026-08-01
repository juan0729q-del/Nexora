"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { beginCheckout } from "@/lib/payments";
import type { StorefrontProduct } from "@/lib/product-presentation";
import { formatCOP } from "@/lib/products";
import type { CartShippingQuoteResponse, CjShippingQuoteOption, ShippingDestinationInput } from "@/lib/shipping/types";
import { maxCartUnits, maxUnitsPerLine, useCart } from "./cart-context";
import { ProductArt } from "./product-art";

const emptyDestination: ShippingDestinationInput = {
  recipientName: "",
  email: "",
  phone: "",
  address1: "",
  address2: "",
  city: "",
  region: "",
  countryCode: "CO",
  postalCode: "",
  houseNumber: "",
};

function lineId(productSlug: string, variantSku: string) {
  return `${productSlug}|${variantSku}`;
}

function validQuotePayload(value: unknown): value is CartShippingQuoteResponse {
  if (!value || typeof value !== "object") return false;
  const quote = value as Partial<CartShippingQuoteResponse>;
  return typeof quote.expiresAt === "string" && typeof quote.productSubtotalCop === "number"
    && Array.isArray(quote.items) && quote.items.length > 0
    && quote.items.every((item) => typeof item.quoteToken === "string" && item.options.length > 0);
}

function deliveryText(option: CjShippingQuoteOption) {
  return option.estimatedDelivery
    ? `Entrega estimada por CJ: ${option.estimatedDelivery}`
    : "CJ confirmará el tiempo de entrega cuando procese el despacho.";
}

function optionBadge(option: CjShippingQuoteOption) {
  if (option.recommendation === "cheapest") return "Más económica · sugerida";
  if (option.recommendation === "fastest") return "Más rápida";
  return null;
}

export function CartCheckout({ products }: { products: StorefrontProduct[] }) {
  const { items, itemCount, updateQuantity, removeItem } = useCart();
  const [destination, setDestination] = useState<ShippingDestinationInput>(emptyDestination);
  const [quote, setQuote] = useState<CartShippingQuoteResponse | null>(null);
  const [selectedMethods, setSelectedMethods] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const productsBySlug = useMemo(() => new Map(products.map((product) => [product.slug, product])), [products]);
  const visibleItems = items.flatMap((item) => {
    const product = productsBySlug.get(item.productSlug);
    return product ? [{ ...item, product }] : [];
  });

  function clearQuote() {
    setQuote(null);
    setSelectedMethods({});
    setStatus(null);
  }

  function updateDestination(field: keyof ShippingDestinationInput, value: string) {
    clearQuote();
    setDestination((current) => ({ ...current, [field]: field === "countryCode" ? value.toUpperCase() : value }));
  }

  async function calculateShipping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!visibleItems.length || isPreparing) return;
    clearQuote();
    try {
      setIsPreparing(true);
      setStatus("Consultando tarifas reales de CJ para cada artículo del carrito…");
      const response = await fetch("/api/shipping/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: visibleItems.map((item) => ({ productSlug: item.productSlug, variantSku: item.variantSku, quantity: item.quantity })),
          destination,
        }),
      });
      const payload = await response.json().catch(() => null) as ({ message?: string } & Partial<CartShippingQuoteResponse>) | null;
      if (!response.ok) throw new Error(payload?.message || "No fue posible cotizar el envío.");
      if (!validQuotePayload(payload)) throw new Error("CJ no devolvió una cotización completa. Intenta de nuevo antes de pagar.");
      const suggestions = Object.fromEntries(payload.items.map((line) => [
        lineId(line.productSlug, line.variantSku),
        (line.options.find((option) => option.recommendation === "cheapest") || line.options[0]).id,
      ]));
      setQuote(payload);
      setSelectedMethods(suggestions);
      setStatus("Cotización lista. Revisa o cambia el método de cada envío antes de pagar.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No fue posible cotizar el envío.");
    } finally {
      setIsPreparing(false);
    }
  }

  async function pay() {
    if (!quote || isPreparing) return;
    const checkoutItems = quote.items.map((line) => ({
      productSlug: line.productSlug,
      variantSku: line.variantSku,
      quantity: line.quantity,
      shippingQuoteToken: line.quoteToken,
      shippingMethodId: selectedMethods[lineId(line.productSlug, line.variantSku)] || "",
    }));
    if (checkoutItems.some((item) => !item.shippingMethodId)) {
      setStatus("Selecciona un método de envío para cada artículo.");
      return;
    }
    try {
      setIsPreparing(true);
      setStatus("Verificando inventario, registrando el pedido y preparando Wompi…");
      const result = await beginCheckout({ customerEmail: destination.email, destination, items: checkoutItems });
      setStatus(result.message || "Redirigiendo al pago seguro…");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No fue posible iniciar el pago.");
      setIsPreparing(false);
    }
  }

  const selectedShippingTotal = quote?.items.reduce((total, line) => {
    const selected = line.options.find((option) => option.id === selectedMethods[lineId(line.productSlug, line.variantSku)]);
    return total + (selected?.amountCop || 0);
  }, 0) || 0;
  const checkoutTotal = (quote?.productSubtotalCop || 0) + selectedShippingTotal;

  return <section aria-labelledby="cart-title">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[.18em] text-emerald">Compra segura</p>
        <h1 id="cart-title" className="mt-2 text-3xl font-semibold text-white sm:text-4xl">Tu carrito</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-silver/70">Ajusta cantidades, agrega otros productos y después consulta las opciones oficiales de CJ. El costo de envío corre por cuenta del cliente y queda incluido en el total de Wompi.</p>
      </div>
      <Link href="/#catalogo" className="rounded-full border border-silver/25 px-4 py-2 text-sm font-semibold text-white hover:border-emerald hover:text-emerald">Seguir comprando</Link>
    </div>

    {!visibleItems.length ? <div className="mt-10 rounded-2xl border border-silver/15 bg-white/[.025] p-8 text-center">
      <p className="text-lg font-semibold text-white">Tu carrito está vacío.</p>
      <p className="mt-2 text-sm text-silver/65">Elige una variante y cantidad desde cualquier producto.</p>
      <Link href="/" className="mt-5 inline-flex rounded-full bg-emerald px-5 py-2.5 text-sm font-bold text-onyx">Explorar productos</Link>
    </div> : <>
      <div className="mt-8 space-y-3">
        {visibleItems.map((item) => {
          const variant = item.product.variants.find((entry) => entry.sku === item.variantSku);
          const maximumQuantity = Math.max(1, Math.min(
            maxUnitsPerLine,
            item.product.stock,
            maxCartUnits - (itemCount - item.quantity),
          ));
          return <article key={lineId(item.productSlug, item.variantSku)} className="grid gap-4 rounded-2xl border border-silver/15 bg-white/[.025] p-4 sm:grid-cols-[7rem_1fr_auto] sm:items-center">
            <div className="w-28"><ProductArt product={item.product} alt={item.product.image.alt} /></div>
            <div>
              <h2 className="font-semibold text-white">{item.product.name}</h2>
              <p className="mt-1 text-xs text-silver/60">Variante: {variant?.options || variant?.label || item.variantSku}</p>
              <p className="mt-2 text-sm font-semibold text-emerald">{formatCOP(item.product.price)} por unidad</p>
            </div>
            <div className="flex items-end gap-3">
              <label className="text-xs font-semibold text-white">Cantidad
                <input type="number" min={1} max={maximumQuantity} value={item.quantity} onChange={(event) => { updateQuantity(item.productSlug, item.variantSku, Math.min(maximumQuantity, Math.max(1, Number(event.target.value) || 1))); clearQuote(); }} className="mt-1 block w-20 rounded-lg border border-silver/25 bg-onyx px-3 py-2 text-sm text-white focus:border-emerald focus:outline-none" />
              </label>
              <button type="button" onClick={() => { removeItem(item.productSlug, item.variantSku); clearQuote(); }} className="rounded-lg border border-red-300/30 px-3 py-2 text-xs font-semibold text-red-200 hover:border-red-300">Quitar</button>
            </div>
          </article>;
        })}
      </div>

      <form onSubmit={calculateShipping} className="mt-8 space-y-5 rounded-2xl border border-emerald/30 bg-emerald/[.05] p-5">
        <div>
          <h2 className="text-xl font-semibold text-white">Entrega y envío ({itemCount} unidad{itemCount === 1 ? "" : "es"})</h2>
          <p className="mt-2 text-xs leading-5 text-silver/65">CJ puede despachar productos desde bodegas diferentes. Nexora cotiza cada línea sin estimaciones inventadas, marca la alternativa más económica y permite elegir opciones más rápidas cuando el proveedor las ofrece.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre de quien recibe"><input value={destination.recipientName} onChange={(event) => updateDestination("recipientName", event.target.value)} required autoComplete="name" /></Field>
          <Field label="Correo para confirmación"><input type="email" value={destination.email} onChange={(event) => updateDestination("email", event.target.value)} required autoComplete="email" placeholder="tu@correo.com" /></Field>
          <Field label="Teléfono con indicativo"><input type="tel" value={destination.phone} onChange={(event) => updateDestination("phone", event.target.value)} required autoComplete="tel" placeholder="+57…" /></Field>
          <Field label="País (código ISO)"><input list="nexora-countries" value={destination.countryCode} onChange={(event) => updateDestination("countryCode", event.target.value)} required maxLength={2} className="uppercase" /><datalist id="nexora-countries"><option value="CO">Colombia</option><option value="US">Estados Unidos</option></datalist></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_.35fr]">
          <Field label="Dirección de entrega"><input value={destination.address1} onChange={(event) => updateDestination("address1", event.target.value)} required autoComplete="address-line1" /></Field>
          <Field label="Número de casa"><input value={destination.houseNumber || ""} onChange={(event) => updateDestination("houseNumber", event.target.value)} placeholder="12-34" /></Field>
        </div>
        <Field label="Complemento (opcional)"><input value={destination.address2 || ""} onChange={(event) => updateDestination("address2", event.target.value)} autoComplete="address-line2" placeholder="Torre, piso, indicaciones" /></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Ciudad"><input value={destination.city} onChange={(event) => updateDestination("city", event.target.value)} required autoComplete="address-level2" /></Field>
          <Field label="Departamento / estado"><input value={destination.region} onChange={(event) => updateDestination("region", event.target.value)} required autoComplete="address-level1" /></Field>
          <Field label="Código postal"><input value={destination.postalCode} onChange={(event) => updateDestination("postalCode", event.target.value)} required autoComplete="postal-code" /></Field>
        </div>
        <p className="text-[11px] leading-4 text-silver/55">Estos datos se usan para la cotización real, el registro privado del pedido y su seguimiento. Nexora nunca recibe ni almacena datos de tarjeta.</p>
        <button type="submit" disabled={isPreparing} className="rounded-lg bg-emerald px-4 py-2.5 text-sm font-bold text-onyx disabled:cursor-not-allowed disabled:bg-silver/30">{isPreparing && !quote ? "Cotizando con CJ…" : "Cotizar envío real del carrito"}</button>

        {quote && <div className="space-y-5 border-t border-emerald/20 pt-5">
          {quote.items.map((line) => <fieldset key={lineId(line.productSlug, line.variantSku)} className="space-y-2 rounded-xl border border-silver/15 bg-onyx/45 p-4">
            <legend className="px-2 text-sm font-semibold text-white">{line.quantity}× {line.productName} · {line.variantLabel}</legend>
            {line.options.map((option) => {
              const badge = optionBadge(option);
              const checked = selectedMethods[lineId(line.productSlug, line.variantSku)] === option.id;
              return <label key={option.id} className={`block cursor-pointer rounded-xl border p-3 ${checked ? "border-emerald bg-emerald/[.09]" : "border-silver/20"}`}>
                <div className="flex items-start gap-3">
                  <input type="radio" name={`shipping-${lineId(line.productSlug, line.variantSku)}`} value={option.id} checked={checked} onChange={() => setSelectedMethods((current) => ({ ...current, [lineId(line.productSlug, line.variantSku)]: option.id }))} className="mt-1 accent-[#009473]" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap justify-between gap-2"><span className="font-semibold text-white">{option.method}</span><span className="font-semibold text-emerald">{formatCOP(option.amountCop)}</span></div>
                    {badge && <span className="mt-1 inline-flex rounded-full bg-emerald/15 px-2 py-0.5 text-[10px] font-bold text-emerald">{badge}</span>}
                    <p className="mt-1 text-xs text-silver/65">{option.carrier && option.carrier !== option.method ? `${option.carrier} · ` : ""}{deliveryText(option)}</p>
                    <p className="mt-1 text-[11px] text-silver/50">Origen de inventario CJ: {option.sourceCountryCode}</p>
                    {option.remoteFeeCop ? <p className="mt-1 text-[11px] text-silver/50">Incluye zona remota: {formatCOP(option.remoteFeeCop)}</p> : null}
                    {option.notices.map((notice) => <p key={notice} className="mt-1 text-[11px] text-amber-100">{notice}</p>)}
                  </div>
                </div>
              </label>;
            })}
          </fieldset>)}

          <div className="rounded-xl border border-silver/20 bg-onyx/70 p-4 text-sm">
            <div className="flex justify-between text-silver/70"><span>Productos</span><span>{formatCOP(quote.productSubtotalCop)}</span></div>
            <div className="mt-2 flex justify-between text-silver/70"><span>Envíos CJ seleccionados</span><span>{formatCOP(selectedShippingTotal)}</span></div>
            <div className="mt-3 flex justify-between border-t border-silver/15 pt-3 font-semibold text-white"><span>Total en Wompi</span><span>{formatCOP(checkoutTotal)}</span></div>
            <p className="mt-2 text-[11px] text-silver/55">Tarifas válidas hasta {new Date(quote.expiresAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}. Si cambias artículos, cantidades o dirección, vuelve a cotizar.</p>
            <button type="button" onClick={pay} disabled={isPreparing} className="mt-4 w-full rounded-lg bg-emerald px-4 py-3 text-sm font-bold text-onyx disabled:cursor-not-allowed disabled:bg-silver/30">{isPreparing ? "Preparando pago seguro…" : `Continuar a Wompi · ${formatCOP(checkoutTotal)}`}</button>
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
