/* eslint-disable @next/next/no-img-element */
import type { Product } from "@/lib/products";

export function ProductArt({ product, priority = false, alt }: { product: Product; priority?: boolean; alt?: string }) {
  if (product.image.source !== "provider" || !product.image.src.startsWith("https://")) return null;

  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl border border-silver/15 bg-[#151515]">
      <img src={product.image.src} alt={alt || product.image.alt} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/65 to-transparent" />
      <span className="absolute bottom-4 left-4 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-white/90 uppercase backdrop-blur-sm">{product.category}</span>
    </div>
  );
}
