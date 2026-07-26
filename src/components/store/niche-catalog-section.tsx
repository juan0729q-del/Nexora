import { getStoreCatalog } from "@/lib/catalog-store";
import { niches, type ProductNiche } from "@/lib/products";
import { ProductCard } from "./product-card";

const anchorByNiche: Record<ProductNiche, string> = {
  jewelry: "joyeria",
  technologyHome: "tecnologia-hogar",
  wellbeing: "bienestar",
};

export async function NicheCatalogSection({ niche, priority = false }: { niche: ProductNiche; priority?: boolean }) {
  const definition = niches[niche];
  const products = await getStoreCatalog(niche);
  return (
    <section id={anchorByNiche[niche]} className="scroll-mt-24 border-t border-silver/15 px-5 py-14 first:border-t-0 sm:px-8 sm:py-20 lg:px-12" aria-labelledby={`${niche}-title`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-emerald uppercase">Nicho Nexora</p>
            <h2 id={`${niche}-title`} className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{definition.label}</h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-silver/70">{definition.description}</p>
        </div>
        {products.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product, index) => <ProductCard key={product.slug} product={product} priority={priority && index === 0} />)}
          </div>
        ) : (
          <p className="rounded-2xl border border-silver/15 bg-white/[.025] p-5 text-sm text-silver/70">La curaduría de este nicho se actualizará cuando finalice la importación verificada desde CJ Dropshipping.</p>
        )}
      </div>
    </section>
  );
}
