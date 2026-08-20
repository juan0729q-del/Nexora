import { getStoreCatalog } from "@/lib/catalog-store";
import { getDictionary, type Market } from "@/lib/i18n/config";
import { getExchangeRateSnapshot } from "@/lib/market-pricing";
import { hasCompleteEditorial, toStorefrontProduct } from "@/lib/product-presentation";
import { getTechnologySegment, type TechnologySegment } from "@/lib/products";
import { ProductCard } from "./product-card";

const anchorBySegment: Record<TechnologySegment, string> = {
  traditional: "tecnologia-tradicional",
  artificialIntelligence: "tecnologia-ia",
};

export async function TechnologyCatalogSection({ segment, market = "co" }: { segment: TechnologySegment; market?: Market }) {
  const dictionary = getDictionary(market);
  const exchangeRate = getExchangeRateSnapshot();
  const products = (await getStoreCatalog("technologyHome"))
    .filter((product) => getTechnologySegment(product) === segment)
    .filter((product) => hasCompleteEditorial(product, market))
    .map((product) => toStorefrontProduct(product, market, exchangeRate))
    .filter((product) => product.available);
  const label = segment === "traditional"
    ? dictionary.technology
    : dictionary.aiTechnology;
  const description = segment === "traditional"
    ? (market === "co" ? "Tecnología funcional para conectividad, carga y rutinas cotidianas." : "Functional technology for connectivity, charging, and everyday routines.")
    : (market === "co" ? "Sólo productos cuya ficha oficial confirma una función real de inteligencia artificial." : "Only products whose official listing confirms an actual artificial-intelligence feature.");

  // A verified empty segment is omitted from the public storefront. The
  // internal intelligence panel may still propose candidates for human review.
  if (segment === "artificialIntelligence" && products.length === 0) return null;

  return (
    <section id={anchorBySegment[segment]} className="scroll-mt-24 border-t border-silver/15 px-5 py-14 sm:px-8 sm:py-20 lg:px-12" aria-labelledby={`technology-${segment}-title`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-emerald uppercase">{dictionary.categoryEyebrow}</p>
            <h2 id={`technology-${segment}-title`} className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{label}</h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-silver/70">{description}</p>
        </div>
        {products.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => <ProductCard key={product.slug} product={product} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald/20 bg-emerald/[.045] p-5">
            <p className="font-medium text-white">{market === "co" ? "Selección en validación" : "Selection under review"}</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-silver/70">{market === "co" ? "Esta sección permanecerá vacía hasta verificar una función real de IA, inventario, estilos e imágenes oficiales de CJ; no se publican productos de relleno." : "This section remains empty until an actual AI function, inventory, styles, and official CJ images are verified; no filler products are published."}</p>
          </div>
        )}
      </div>
    </section>
  );
}
