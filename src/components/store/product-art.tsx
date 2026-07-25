/* eslint-disable @next/next/no-img-element */
import Image from "next/image";
import type { Product } from "@/lib/products";

export function ProductArt({ product, priority = false }: { product: Product; priority?: boolean }) {
  const externalProviderImage = product.image.source === "provider" && product.image.src.startsWith("https://");
  return <div className="relative aspect-square overflow-hidden rounded-2xl border border-silver/15 bg-[#151515]">{externalProviderImage ? <>{/* The supplier host is dynamic; preserving its native image avoids unsafe allow-listing. */}<img src={product.image.src} alt={product.image.alt} loading={priority ? "eager" : "lazy"} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" /></> : <Image src={product.image.src} alt={product.image.alt} fill priority={priority} sizes="(min-width: 1280px) 32vw, (min-width: 768px) 48vw, 100vw" className="object-cover transition duration-500 group-hover:scale-[1.03]" />}<div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/65 to-transparent" /><span className="absolute bottom-4 left-4 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-white/90 uppercase backdrop-blur-sm">{product.category}</span></div>;
}
