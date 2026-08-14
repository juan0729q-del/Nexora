import Image from "next/image";
import type { Product } from "@/lib/products";
import type { ProviderImage } from "@/lib/provider-product-details";
import { isOfficialCjImageUrl } from "@/lib/cj-assets";
import { getDictionary, type Market } from "@/lib/i18n/config";

export function ProductArt({ product, image, priority = false, alt, market = "co" }: { product: Pick<Product, "category" | "image" | "niche">; image?: ProviderImage; priority?: boolean; alt?: string; market?: Market }) {
  const activeImage = image || product.image;
  if (activeImage.source !== "provider" || !isOfficialCjImageUrl(activeImage.src)) return null;
  const dictionary = getDictionary(market);
  const category = product.niche === "jewelry" ? dictionary.jewelry : product.niche === "wellbeing" ? dictionary.wellbeing : dictionary.technology;

  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl border border-silver/15 bg-[#151515]">
      <Image src={activeImage.src} alt={alt || activeImage.alt} fill priority={priority} sizes="(min-width: 1280px) 31vw, (min-width: 768px) 45vw, 92vw" className="object-cover transition duration-500 group-hover:scale-[1.03]" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/65 to-transparent" />
      <span className="absolute bottom-4 left-4 rounded-full border border-white/15 bg-black/40 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-white/90 uppercase backdrop-blur-sm">{category}</span>
    </div>
  );
}
