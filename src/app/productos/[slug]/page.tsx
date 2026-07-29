import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/store/product-card";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";
import { getCatalog, getProduct } from "@/lib/catalog-store";
import { getProductPresentation, toStorefrontProduct } from "@/lib/product-presentation";
import { formatCOP, isStoreProductAvailable } from "@/lib/products";
import { siteUrlFor } from "@/lib/site";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

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
    image: product.image.src,
    sku: product.sku,
    category: product.category,
    material: product.material,
    mainEntityOfPage: canonicalUrl,
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

  return (
    <>
      <StoreHeader />
      <main className="px-5 py-12 sm:px-8 sm:py-20 lg:px-12">
        <article className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:items-start">
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
            </dl>
            <p className="mt-6 text-2xl font-semibold text-white">{formatCOP(product.price)}</p>
          </div>
          <ProductCard product={storefrontProduct} priority />
        </article>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: schemaJson }} />
      </main>
      <StoreFooter />
    </>
  );
}
