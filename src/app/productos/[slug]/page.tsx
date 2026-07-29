import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/store/product-card";
import { ProductGallery } from "@/components/store/product-gallery";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";
import { getCatalog, getProduct } from "@/lib/catalog-store";
import { getProductPresentation, toStorefrontProduct } from "@/lib/product-presentation";
import { formatCOP, isStoreProductAvailable } from "@/lib/products";
import { siteUrlFor } from "@/lib/site";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

function grams(value: number | undefined) {
  return value ? `${new Intl.NumberFormat("es-CO").format(value)} g` : undefined;
}

function dimensions(value: { lengthMm?: number; widthMm?: number; heightMm?: number } | undefined) {
  if (!value) return undefined;
  const pieces = [value.lengthMm, value.widthMm, value.heightMm].filter((entry): entry is number => typeof entry === "number");
  return pieces.length ? `${pieces.join(" × ")} mm` : undefined;
}

export async function generateStaticParams() {
  const products = await getCatalog();
  return products.filter(isStoreProductAvailable).map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product || !isStoreProductAvailable(product)) {
    return { title: "Producto no disponible", robots: { index: false, follow: false } };
  }

  const presentation = getProductPresentation(product);
  const url = siteUrlFor(`/productos/${product.slug}`);

  return {
    title: `${presentation.title} | ${product.category}`,
    description: presentation.cardDescription,
    alternates: { canonical: `/productos/${product.slug}` },
    openGraph: {
      title: presentation.title,
      description: presentation.cardDescription,
      type: "website",
      url,
      images: [{ url: product.image.src, alt: presentation.imageAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: presentation.title,
      description: presentation.cardDescription,
      images: [product.image.src],
    },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product || !isStoreProductAvailable(product)) notFound();

  const presentation = getProductPresentation(product);
  const storefrontProduct = toStorefrontProduct(product);
  const canonicalUrl = siteUrlFor(`/productos/${product.slug}`);
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonicalUrl}#product`,
    url: canonicalUrl,
    name: presentation.title,
    description: presentation.detailDescription,
    image: product.images.map((image) => image.src),
    sku: product.sku,
    category: product.category,
    material: product.material,
    mainEntityOfPage: canonicalUrl,
    additionalProperty: product.providerDetails.specifications.map((specification) => ({
      "@type": "PropertyValue",
      name: specification.label,
      value: specification.value,
    })),
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "COP",
      price: product.price,
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: "Nexora", url: siteUrlFor() },
    },
  };
  const schemaJson = JSON.stringify(schema).replace(/</g, "\\u003c");
  const shippingFacts = [
    ["Peso del producto", grams(product.shipping.productWeightGrams)],
    ["Peso con empaque", grams(product.shipping.packingWeightGrams)],
    ["Unidad del proveedor", product.shipping.unit],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return (
    <>
      <StoreHeader />
      <main className="px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <article className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
          <ProductGallery product={product} />
          <div>
            <p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">{product.category}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{presentation.title}</h1>
            <p className="mt-6 text-lg leading-8 text-silver/80">{presentation.detailDescription}</p>
            <dl className="mt-8 grid grid-cols-2 gap-4 border-y border-silver/15 py-5 text-sm">
              <div>
                <dt className="text-silver/55">Material</dt>
                <dd className="mt-1 font-medium text-white">{product.material}</dd>
              </div>
              <div>
                <dt className="text-silver/55">Disponibilidad</dt>
                <dd className="mt-1 font-medium text-white">{product.stock} unidades</dd>
              </div>
              {shippingFacts.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-silver/55">{label}</dt>
                  <dd className="mt-1 font-medium text-white">{value}</dd>
                </div>
              ))}
            </dl>
            {product.shipping.logisticsProperties.length > 0 && <p className="mt-4 text-xs leading-5 text-silver/60">Propiedades logísticas CJ: {product.shipping.logisticsProperties.join(", ")}</p>}
            <p className="mt-6 text-2xl font-semibold text-white">{formatCOP(product.price)}</p>
            <div className="mt-6">
              <ProductCard product={storefrontProduct} showArt={false} />
            </div>
          </div>
        </article>

        <section className="mx-auto mt-16 max-w-7xl border-t border-silver/15 pt-12" aria-labelledby="provider-details-title">
          <div className="max-w-3xl">
            <p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">Ficha oficial</p>
            <h2 id="provider-details-title" className="mt-3 text-3xl font-semibold tracking-tight text-white">Información completa del proveedor</h2>
            <p className="mt-3 text-sm leading-6 text-silver/70">Descripción, medidas, contenido y recursos visuales recibidos directamente de CJ Dropshipping. No usamos imágenes ni especificaciones de relleno.</p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            {product.providerDetails.sections.map((section) => (
              <section key={section.title} className="rounded-2xl border border-silver/15 bg-white/[0.025] p-5">
                <h3 className="text-base font-semibold text-white">{section.title}</h3>
                <div className="mt-3 space-y-2 text-sm leading-6 text-silver/75">
                  {section.content.map((line, index) => <p key={`${section.title}-${index}`}>{line}</p>)}
                </div>
              </section>
            ))}
          </div>

          {product.providerDetails.specifications.length > 0 && (
            <section className="mt-5 rounded-2xl border border-silver/15 bg-white/[0.025] p-5" aria-labelledby="specifications-title">
              <h3 id="specifications-title" className="text-base font-semibold text-white">Especificaciones y medidas</h3>
              <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {product.providerDetails.specifications.map((specification) => (
                  <div key={`${specification.label}-${specification.value}`} className="border-b border-silver/10 pb-3 text-sm">
                    <dt className="text-silver/55">{specification.label}</dt>
                    <dd className="mt-1 font-medium text-white">{specification.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {product.providerDetails.packageContents.length > 0 && (
            <section className="mt-5 rounded-2xl border border-silver/15 bg-white/[0.025] p-5" aria-labelledby="package-title">
              <h3 id="package-title" className="text-base font-semibold text-white">Contenido del paquete</h3>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-silver/75">
                {product.providerDetails.packageContents.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          )}

          {product.variants.length > 0 && (
            <section className="mt-5 rounded-2xl border border-silver/15 bg-white/[0.025] p-5" aria-labelledby="variants-title">
              <h3 id="variants-title" className="text-base font-semibold text-white">Opciones indicadas por el proveedor</h3>
              <p className="mt-2 text-xs leading-5 text-silver/60">Se muestran como referencia de medidas y acabados. Nexora validará el SKU correcto antes de habilitar selección individual de variantes en checkout.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {product.variants.map((variant) => (
                  <div key={variant.sku} className="rounded-xl border border-silver/10 p-3 text-sm">
                    <p className="font-medium text-white">{variant.label}</p>
                    {variant.options && <p className="mt-1 text-silver/65">{variant.options}</p>}
                    <p className="mt-2 text-xs text-silver/55">{[dimensions(variant.dimensions), grams(variant.weightGrams)].filter(Boolean).join(" · ") || "Sin medidas adicionales reportadas"}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson }} />
      </main>
      <StoreFooter />
    </>
  );
}
