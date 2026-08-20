import { getStoreCatalog } from "@/lib/catalog-store";
import Link from "next/link";
import { categoryPath, getDictionary, type Market } from "@/lib/i18n/config";
import { getExchangeRateSnapshot } from "@/lib/market-pricing";
import { hasCompleteEditorial, toStorefrontProduct } from "@/lib/product-presentation";
import type { ProductNiche } from "@/lib/products";
import { ProductCard } from "./product-card";

const anchorByNiche: Record<ProductNiche, string> = {
  jewelry: "joyeria",
  technologyHome: "tecnologia-hogar",
  wellbeing: "bienestar",
};

export async function NicheCatalogSection({ niche, market = "co", priority = false, headingLevel = "h2" }: { niche: ProductNiche; market?: Market; priority?: boolean; headingLevel?: "h1" | "h2" }) {
  const dictionary = getDictionary(market);
  const exchangeRate = getExchangeRateSnapshot();
  const products = (await getStoreCatalog(niche))
    .filter((product) => hasCompleteEditorial(product, market))
    .map((product) => toStorefrontProduct(product, market, exchangeRate))
    .filter((product) => product.available);
  const Heading = headingLevel;
  const localizedDefinition = niche === "jewelry"
    ? { label: dictionary.jewelry, description: market === "co" ? "Accesorios con materiales, medidas y estilos trazables al proveedor." : "Accessories with materials, measurements, and styles traceable to the supplier." }
    : niche === "technologyHome"
      ? { label: dictionary.technology, description: market === "co" ? "Accesorios prácticos para conectividad, carga y uso cotidiano." : "Practical accessories for connectivity, charging, and everyday use." }
      : { label: dictionary.wellbeing, description: market === "co" ? "Accesorios para rutinas generales, sin promesas médicas." : "Accessories for general routines, with no medical claims." };
  return (
    <section id={anchorByNiche[niche]} className="scroll-mt-24 border-t border-silver/15 px-5 py-14 first:border-t-0 sm:px-8 sm:py-20 lg:px-12" aria-labelledby={`${niche}-title`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-emerald uppercase">{dictionary.categoryEyebrow}</p>
            <Heading id={`${niche}-title`} className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{localizedDefinition.label}</Heading>
          </div>
          <p className="max-w-sm text-sm leading-6 text-silver/70">{localizedDefinition.description}</p>
        </div>
        {products.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product, index) => <ProductCard key={product.slug} product={product} priority={priority && index === 0} />)}
          </div>
        ) : (
          <p className="rounded-2xl border border-silver/15 bg-white/[.025] p-5 text-sm text-silver/70">{dictionary.emptyCategory}</p>
        )}
        {headingLevel === "h1" ? <nav className="mt-8 text-sm text-silver/70" aria-label={market === "co" ? "Categorías relacionadas" : "Related categories"}>
          <Link href={categoryPath(market, niche === "jewelry" ? "technologyHome" : "jewelry")} className="font-semibold text-emerald hover:text-white">{market === "co" ? "Explorar otra categoría" : "Explore another category"}</Link>
        </nav> : null}
      </div>
    </section>
  );
}
