"use client";

import Link from "next/link";
import { useState } from "react";
import { beginCheckout } from "@/lib/payments";
import { getProductPresentation } from "@/lib/product-presentation";
import { formatCOP, isStoreProductAvailable, type Product } from "@/lib/products";
import { ProductArt } from "./product-art";

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const [status, setStatus] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const available = isStoreProductAvailable(product);
  const presentation = getProductPresentation(product);

  async function buy() {
    if (!available || isPreparing) return;

    try {
      setIsPreparing(true);
      setStatus("Preparando pago seguro…");
      const result = await beginCheckout(product);
      setStatus(result.message || "Redirigiendo al checkout seguro…");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "No fue posible iniciar el pago.");
      setIsPreparing(false);
    }
  }

  const reviewSummary = product.reviewCount > 0 && product.rating > 0
    ? `★ ${product.rating} (${product.reviewCount})`
    : "Nuevo · sin reseñas verificadas";
  const purchaseLabel = isPreparing ? "Preparando…" : !available ? product.stock < 1 ? "Agotado" : "No disponible" : "Comprar";

  return (
    <article className="group rounded-2xl border border-silver/15 bg-white/[0.025] p-3 transition hover:border-silver/35">
      <ProductArt product={product} priority={priority} alt={presentation.imageAlt} />
      <div className="px-1 pt-5 pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-emerald">{reviewSummary}</p>
            <h3 className="mt-2 text-lg font-semibold text-white">
              <Link href={`/productos/${product.slug}`} className="hover:text-emerald">{presentation.title}</Link>
            </h3>
          </div>
          {product.stock < 5 && <span className="rounded-full bg-red-400/10 px-2 py-1 text-[10px] font-bold text-red-300 uppercase">Últimas unidades</span>}
        </div>
        <p className="mt-2 min-h-10 text-sm leading-5 text-silver/70">{presentation.cardDescription}</p>
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-white">{formatCOP(product.price)}</p>
            {product.compareAtPrice && <p className="text-xs text-silver/45 line-through">{formatCOP(product.compareAtPrice)}</p>}
          </div>
          <button onClick={buy} disabled={!available || isPreparing} className="rounded-full bg-emerald px-4 py-2.5 text-sm font-bold text-onyx transition hover:bg-emerald/85 disabled:cursor-not-allowed disabled:bg-silver/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald">
            {purchaseLabel}
          </button>
        </div>
        {status && <p aria-live="polite" className="mt-3 text-xs text-silver/70">{status}</p>}
      </div>
    </article>
  );
}
