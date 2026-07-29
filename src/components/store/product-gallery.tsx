"use client";

import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/lib/products";

type GalleryProduct = Pick<Product, "name" | "image" | "images">;

/**
 * Galería ligera: únicamente la imagen activa es prioritaria; las miniaturas
 * restantes se cargan de forma diferida y todas proceden de CJ.
 */
export function ProductGallery({ product }: { product: GalleryProduct }) {
  const images = product.images.length ? product.images : [product.image];
  const [activeIndex, setActiveIndex] = useState(0);
  const active = images[activeIndex] || images[0];

  return (
    <section aria-label={`Galería de ${product.name}`} className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-3xl border border-silver/20 bg-[#151515] shadow-2xl shadow-black/25">
        <Image
          src={active.src}
          alt={active.alt}
          fill
          priority
          sizes="(min-width: 1024px) 46vw, 92vw"
          className="object-contain"
        />
        <span className="absolute right-4 bottom-4 rounded-full border border-white/15 bg-black/55 px-3 py-1.5 text-[11px] font-semibold tracking-[0.12em] text-white uppercase backdrop-blur-sm">
          Imagen oficial CJ {activeIndex + 1}/{images.length}
        </span>
      </div>

      {images.length > 1 && (
        <div className="grid grid-cols-5 gap-2 sm:grid-cols-6" aria-label="Seleccionar imagen del producto">
          {images.map((image, index) => (
            <button
              key={image.src}
              type="button"
              aria-label={`Ver imagen ${index + 1} de ${product.name}`}
              aria-pressed={index === activeIndex}
              onClick={() => setActiveIndex(index)}
              className={`relative aspect-square overflow-hidden rounded-xl border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald ${index === activeIndex ? "border-emerald ring-1 ring-emerald/70" : "border-silver/20 hover:border-silver/60"}`}
            >
              <Image src={image.src} alt="" fill sizes="112px" loading="lazy" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
