import type { Product } from "@/lib/products";

export function ProductArt({ product }: { product: Product }) {
  const decoration = product.accent === "warm" ? "bg-amber-200/80" : product.accent === "emerald" ? "bg-emerald/85" : "bg-silver/80";
  return <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-silver/15 bg-[linear-gradient(145deg,#202020,#101010)]"><div className={`absolute top-6 right-7 h-24 w-24 rounded-full blur-xl ${decoration}`} /><div className="absolute inset-0 grid place-items-center">{product.accent === "silver" && <div className="h-24 w-24 rounded-full border-[11px] border-silver/80 shadow-[0_0_28px_rgba(255,255,255,0.2)]" />}{product.accent === "warm" && <div className="h-28 w-44 rounded-xl border-[10px] border-amber-100/70 bg-amber-700/20 shadow-2xl" />}{product.accent === "emerald" && <div className="h-32 w-20 rounded-[2.5rem] border-[9px] border-emerald/85 shadow-[0_0_40px_rgba(0,148,115,.35)]" />}</div><span className="absolute bottom-4 left-4 rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-white/80 uppercase">{product.category}</span></div>;
}
