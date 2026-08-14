import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ProductCard } from "@/components/store/product-card";
import { CommerceViewTracker } from "@/components/analytics/commerce-view-tracker";
import { ProductGallery } from "@/components/store/product-gallery";
import { ProductVariantProvider } from "@/components/store/product-variant-context";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";
import { getCatalog, getProduct, getProductBySku, getStoreCatalog } from "@/lib/catalog-store";
import { categoryPath, formatMoney, getDictionary, isMarket, markets, productPath, type Market } from "@/lib/i18n/config";
import { getExchangeRateSnapshot, getMarketCommerceReadiness } from "@/lib/market-pricing";
import {
  getLocalizedMaterial,
  getLocalizedPackageContents,
  getLocalizedSpecifications,
  getProductPresentation,
  hasCompleteEditorial,
  localizeVariantOption,
  toStorefrontProduct,
} from "@/lib/product-presentation";
import { isStoreProductAvailable, type Product } from "@/lib/products";
import { siteUrlFor } from "@/lib/site";

export const revalidate = 3600;
type Props = { params: Promise<{ market: string; section: string; slug: string }> };

function validProductRoute(market: Market, section: string) {
  return section === markets[market].productSegment;
}

function localizedCategory(market: Market, niche: Product["niche"]) {
  const dictionary = getDictionary(market);
  return niche === "jewelry" ? dictionary.jewelry : niche === "technologyHome" ? dictionary.technology : dictionary.wellbeing;
}

function grams(value: number | undefined, market: Market) {
  return value ? `${new Intl.NumberFormat(markets[market].locale).format(value)} g` : undefined;
}

function dimensions(value: { lengthMm?: number; widthMm?: number; heightMm?: number } | undefined, market: Market) {
  if (!value) return undefined;
  const pieces = [value.lengthMm, value.widthMm, value.heightMm].filter((entry): entry is number => typeof entry === "number");
  return pieces.length ? `${pieces.map((entry) => new Intl.NumberFormat(markets[market].locale).format(entry)).join(" × ")} mm` : undefined;
}

export async function generateStaticParams() {
  const products = (await getCatalog()).filter(isStoreProductAvailable);
  return (["co", "us"] as Market[]).flatMap((market) => products
    .filter((product) => hasCompleteEditorial(product, market))
    .map((product) => ({ market, section: markets[market].productSegment, slug: product.slug })));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: rawMarket, section, slug } = await params;
  if (!isMarket(rawMarket)) return { title: "Not found", robots: { index: false, follow: false } };
  const market = rawMarket;
  if (section === "p") return { robots: { index: false, follow: true } };
  if (!validProductRoute(market, section)) return { title: "Not found", robots: { index: false, follow: false } };
  const product = await getProduct(slug);
  if (!product || !isStoreProductAvailable(product) || !hasCompleteEditorial(product, market)) {
    return { title: market === "co" ? "Producto no disponible" : "Product unavailable", robots: { index: false, follow: false } };
  }
  const presentation = getProductPresentation(product, market);
  const path = productPath(market, product.slug);
  const bothLocalesPublished = hasCompleteEditorial(product, "co") && hasCompleteEditorial(product, "us");
  return {
    title: presentation.seoTitle,
    description: presentation.metaDescription,
    alternates: {
      canonical: path,
      languages: bothLocalesPublished ? { "es-CO": productPath("co", product.slug), "en-US": productPath("us", product.slug), "x-default": productPath("co", product.slug) } : undefined,
    },
    openGraph: {
      type: "website",
      locale: market === "co" ? "es_CO" : "en_US",
      url: siteUrlFor(path),
      title: presentation.title,
      description: presentation.metaDescription,
      images: [{ url: product.image.src, alt: presentation.imageAlt }],
    },
    twitter: { card: "summary_large_image", title: presentation.title, description: presentation.metaDescription, images: [product.image.src] },
  };
}

export default async function LocalizedProductPage({ params }: Props) {
  const { market: rawMarket, section, slug } = await params;
  if (!isMarket(rawMarket)) notFound();
  const market = rawMarket;
  if (section === "p") {
    const shortProduct = await getProductBySku(slug);
    if (!shortProduct || !isStoreProductAvailable(shortProduct) || !hasCompleteEditorial(shortProduct, market)) notFound();
    permanentRedirect(productPath(market, shortProduct.slug));
  }
  if (!validProductRoute(market, section)) notFound();
  const product = await getProduct(slug);
  if (!product || !isStoreProductAvailable(product) || !hasCompleteEditorial(product, market)) notFound();

  const dictionary = getDictionary(market);
  const presentation = getProductPresentation(product, market);
  const exchangeRate = market === "us" ? getExchangeRateSnapshot() : undefined;
  const storefrontProduct = toStorefrontProduct(product, market, exchangeRate);
  const canonicalUrl = siteUrlFor(productPath(market, product.slug));
  const commerce = getMarketCommerceReadiness(market);
  const specifications = getLocalizedSpecifications(product, market);
  const packageContents = getLocalizedPackageContents(product, market);
  const categoryLabel = localizedCategory(market, product.niche);
  const localizedProduct = {
    ...product,
    name: presentation.title,
    image: { ...product.image, alt: presentation.imageAlt },
    images: product.images.map((image, index) => ({
      ...image,
      alt: market === "co"
        ? `${presentation.title}. Imagen oficial ${index + 1} de CJ Dropshipping.`
        : `${presentation.title}. Official image ${index + 1} from CJ Dropshipping.`,
    })),
    variants: product.variants.map((variant) => ({
      ...variant,
      label: localizeVariantOption(variant.label, market) || variant.label,
      options: localizeVariantOption(variant.options, market),
      image: variant.image ? { ...variant.image, alt: `${presentation.title} — ${localizeVariantOption(variant.options || variant.label, market) || variant.label}` } : undefined,
    })),
  };
  const offer = storefrontProduct.price !== null && commerce.checkoutEnabled ? {
    "@type": "Offer",
    url: canonicalUrl,
    priceCurrency: storefrontProduct.currency,
    price: storefrontProduct.price,
    availability: "https://schema.org/InStock",
    itemCondition: "https://schema.org/NewCondition",
    seller: { "@type": "Organization", name: "Nexora", url: siteUrlFor() },
  } : undefined;
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${canonicalUrl}#product`,
    url: canonicalUrl,
    inLanguage: markets[market].locale,
    name: presentation.title,
    description: presentation.detailDescription,
    image: product.images.map((image) => image.src),
    sku: product.sku,
    category: categoryLabel,
    material: getLocalizedMaterial(product.material, market),
    mainEntityOfPage: canonicalUrl,
    additionalProperty: specifications.map((specification) => ({ "@type": "PropertyValue", name: specification.label, value: specification.value })),
    ...(offer ? { offers: offer } : {}),
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: dictionary.home, item: siteUrlFor(markets[market].homePath) },
      { "@type": "ListItem", position: 2, name: categoryLabel, item: siteUrlFor(categoryPath(market, product.niche)) },
      { "@type": "ListItem", position: 3, name: presentation.title, item: canonicalUrl },
    ],
  };
  const related = (await getStoreCatalog(product.niche))
    .filter((candidate) => candidate.slug !== product.slug && isStoreProductAvailable(candidate) && hasCompleteEditorial(candidate, market))
    .slice(0, 3)
    .map((candidate) => toStorefrontProduct(candidate, market, exchangeRate));
  const shippingFacts = [
    [market === "co" ? "Peso del producto" : "Product weight", grams(product.shipping.productWeightGrams, market)],
    [market === "co" ? "Peso con empaque" : "Packed weight", grams(product.shipping.packingWeightGrams, market)],
    [market === "co" ? "Unidad informada por CJ" : "CJ unit", product.shipping.unit],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return <>
    <StoreHeader market={market} />
    <main id="page-content" tabIndex={-1} className="px-5 py-10 outline-none sm:px-8 sm:py-16 lg:px-12">
      <CommerceViewTracker market={market} type="view_item" id={product.sku} value={storefrontProduct.price ?? undefined} items={[{ item_id: product.sku, item_name: presentation.title, item_category: product.niche, price: storefrontProduct.price ?? undefined, quantity: 1 }]} />
      <nav aria-label={dictionary.breadcrumbs} className="mx-auto mb-8 flex max-w-7xl flex-wrap gap-2 text-xs text-silver/65">
        <Link href={markets[market].homePath} className="hover:text-emerald">{dictionary.home}</Link><span aria-hidden="true">/</span>
        <Link href={categoryPath(market, product.niche)} className="hover:text-emerald">{categoryLabel}</Link><span aria-hidden="true">/</span>
        <span aria-current="page" className="text-white">{presentation.title}</span>
      </nav>
      <ProductVariantProvider initialSku={product.variants.length === 1 ? product.variants[0].sku : ""}>
        <article className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-start">
          <ProductGallery product={localizedProduct} market={market} />
          <div>
            <p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">{categoryLabel}</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">{presentation.title}</h1>
            <p className="mt-6 text-lg leading-8 text-silver/80">{presentation.detailDescription}</p>
            <dl className="mt-8 grid grid-cols-2 gap-4 border-y border-silver/15 py-5 text-sm">
              <div><dt className="text-silver/55">{dictionary.material}</dt><dd className="mt-1 font-medium text-white">{getLocalizedMaterial(product.material, market)}</dd></div>
              <div><dt className="text-silver/55">{dictionary.availability}</dt><dd className="mt-1 font-medium text-white">{product.stock} {dictionary.units}</dd></div>
              {shippingFacts.map(([label, value]) => <div key={label}><dt className="text-silver/55">{label}</dt><dd className="mt-1 font-medium text-white">{value}</dd></div>)}
            </dl>
            <p className="mt-6 text-2xl font-semibold text-white">{storefrontProduct.price === null ? dictionary.exchangeUnavailable : formatMoney(storefrontProduct.price, market)}</p>
            <div className="mt-6"><ProductCard product={storefrontProduct} showArt={false} /></div>
          </div>
        </article>
      </ProductVariantProvider>

      <section className="mx-auto mt-16 max-w-7xl border-t border-silver/15 pt-12" aria-labelledby="editorial-details-title">
        <p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">{dictionary.commercialInfo}</p>
        <h2 id="editorial-details-title" className="mt-3 text-3xl font-semibold text-white">{dictionary.specifications}</h2>
        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-silver/15 bg-white/[.025] p-5"><h3 className="font-semibold text-white">{market === "co" ? "Beneficios verificables" : "Verifiable benefits"}</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-silver/75">{presentation.benefits.map((item) => <li key={item}>{item}</li>)}</ul></section>
          <section className="rounded-2xl border border-silver/15 bg-white/[.025] p-5"><h3 className="font-semibold text-white">{market === "co" ? "Características" : "Features"}</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-silver/75">{presentation.features.map((item) => <li key={item}>{item}</li>)}</ul></section>
        </div>
        {specifications.length ? <section className="mt-5 rounded-2xl border border-silver/15 bg-white/[.025] p-5"><h3 className="font-semibold text-white">{dictionary.specifications}</h3><dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{specifications.map((entry) => <div key={`${entry.label}-${entry.value}`} className="border-b border-silver/10 pb-3 text-sm"><dt className="text-silver/55">{entry.label}</dt><dd className="mt-1 font-medium text-white">{entry.value}</dd></div>)}</dl></section> : null}
        {packageContents.length ? <section className="mt-5 rounded-2xl border border-silver/15 bg-white/[.025] p-5"><h3 className="font-semibold text-white">{dictionary.packageContents}</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-silver/75">{packageContents.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
        <section className="mt-5 rounded-2xl border border-amber-300/25 bg-amber-300/[.05] p-5"><h3 className="font-semibold text-white">{dictionary.warnings}</h3><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-silver/75">{presentation.warnings.map((item) => <li key={item}>{item}</li>)}</ul></section>
        {product.variants.length ? <section className="mt-5 rounded-2xl border border-silver/15 bg-white/[.025] p-5"><h3 className="font-semibold text-white">{market === "co" ? "Estilos oficiales" : "Official styles"}</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{product.variants.map((variant) => <div key={variant.sku} className="rounded-xl border border-silver/10 p-3 text-sm"><p className="font-medium text-white">{localizeVariantOption(variant.options || variant.label, market)}</p><p className="mt-2 text-xs text-silver/55">{[dimensions(variant.dimensions, market), grams(variant.weightGrams, market)].filter(Boolean).join(" · ") || (market === "co" ? "CJ no informó medidas adicionales" : "CJ did not report additional measurements")}</p></div>)}</div></section> : null}
      </section>

      {related.length ? <section className="mx-auto mt-16 max-w-7xl border-t border-silver/15 pt-12" aria-labelledby="related-title"><h2 id="related-title" className="text-3xl font-semibold text-white">{dictionary.related}</h2><div className="mt-7 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{related.map((candidate) => <ProductCard key={candidate.slug} product={candidate} />)}</div></section> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([productSchema, breadcrumbSchema]).replace(/</g, "\\u003c") }} />
    </main>
    <StoreFooter market={market} />
  </>;
}
