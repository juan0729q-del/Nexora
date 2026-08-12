import { getStoreCatalog } from "@/lib/catalog-store";
import { toStorefrontProduct } from "@/lib/product-presentation";
import { getTechnologySegment, technologySegments, type TechnologySegment } from "@/lib/products";
import { ProductCard } from "./product-card";

const anchorBySegment: Record<TechnologySegment, string> = {
  traditional: "tecnologia-tradicional",
  artificialIntelligence: "tecnologia-ia",
};

export async function TechnologyCatalogSection({ segment }: { segment: TechnologySegment }) {
  const definition = technologySegments[segment];
  const products = (await getStoreCatalog("technologyHome"))
    .filter((product) => getTechnologySegment(product) === segment)
    .map(toStorefrontProduct);

  return (
    <section id={anchorBySegment[segment]} className="scroll-mt-24 border-t border-silver/15 px-5 py-14 sm:px-8 sm:py-20 lg:px-12" aria-labelledby={`technology-${segment}-title`}>
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-emerald uppercase">Tecnología Nexora</p>
            <h2 id={`technology-${segment}-title`} className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{definition.label}</h2>
          </div>
          <p className="max-w-sm text-sm leading-6 text-silver/70">{definition.description}</p>
        </div>
        {products.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {products.map((product) => <ProductCard key={product.slug} product={product} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald/20 bg-emerald/[.045] p-5">
            <p className="font-medium text-white">Selección en validación</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-silver/70">El radar de Nexora buscará coincidencias reales en CJ. Esta sección permanecerá vacía hasta confirmar funciones, inventario, estilos e imágenes oficiales; no se publicarán productos de relleno.</p>
          </div>
        )}
      </div>
    </section>
  );
}
