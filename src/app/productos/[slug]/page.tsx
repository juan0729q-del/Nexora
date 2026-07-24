import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/store/product-card";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";
import { formatCOP, getProduct, products } from "@/lib/products";

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return products.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> { const product = getProduct((await params).slug); if (!product) return {}; return { title: `${product.name} — ${product.category}`, description: product.description, alternates: { canonical: `/productos/${product.slug}` }, openGraph: { title: product.name, description: product.description, type: "website" } }; }

export default async function ProductPage({ params }: Props) {
  const product = getProduct((await params).slug); if (!product) notFound();
  const schema = { "@context": "https://schema.org", "@type": "Product", name: product.name, description: product.longDescription, sku: product.sku, material: product.material, brand: { "@type": "Brand", name: "Nexora" }, aggregateRating: { "@type": "AggregateRating", ratingValue: product.rating, reviewCount: product.reviewCount }, offers: { "@type": "Offer", priceCurrency: "COP", price: product.price, availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `${process.env.NEXT_PUBLIC_SITE_URL || "https://nexora.store"}/productos/${product.slug}` } };
  return <><StoreHeader /><main className="px-5 py-12 sm:px-8 sm:py-20 lg:px-12"><article className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-2 lg:items-start"><div><p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">{product.category}</p><h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{product.name}</h1><p className="mt-6 text-lg leading-8 text-silver/80">{product.longDescription}</p><dl className="mt-8 grid grid-cols-2 gap-4 border-y border-silver/15 py-5 text-sm"><div><dt className="text-silver/55">Material</dt><dd className="mt-1 font-medium text-white">{product.material}</dd></div><div><dt className="text-silver/55">Disponibilidad</dt><dd className="mt-1 font-medium text-white">{product.stock} unidades</dd></div></dl><p className="mt-6 text-2xl font-semibold text-white">{formatCOP(product.price)}</p></div><ProductCard product={product} /></article><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} /></main><StoreFooter /></>;
}
