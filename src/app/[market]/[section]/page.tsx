import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CartCheckout } from "@/components/store/cart-checkout";
import { CommerceViewTracker } from "@/components/analytics/commerce-view-tracker";
import { ProductCard } from "@/components/store/product-card";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";
import { getCatalog } from "@/lib/catalog-store";
import { categoryPath, getDictionary, isMarket, markets, type Market } from "@/lib/i18n/config";
import { getExchangeRateSnapshot } from "@/lib/market-pricing";
import { getMerchantIdentity } from "@/lib/merchant-identity";
import { hasCompleteEditorial, toStorefrontProduct } from "@/lib/product-presentation";
import { isStoreProductAvailable, type ProductNiche } from "@/lib/products";
import { siteUrlFor } from "@/lib/site";
import { counterpartTrustSlug, getTrustPage, trustPageSlugs } from "@/lib/trust-content";

export const revalidate = 3600;
type Props = { params: Promise<{ market: string; section: string }> };

const categoryCopy = {
  co: {
    jewelry: { title: "Joyería", description: "Collares y accesorios con materiales, medidas, estilos e imágenes oficiales trazables a CJ Dropshipping." },
    technologyHome: { title: "Tecnología y hogar", description: "Accesorios prácticos para conectividad, carga y rutinas del hogar, sin funciones de IA atribuidas sin evidencia." },
    wellbeing: { title: "Bienestar", description: "Accesorios para acompañar rutinas generales de movilidad, ejercicio y cuidado personal, sin promesas médicas." },
  },
  us: {
    jewelry: { title: "Jewelry", description: "Necklaces and accessories with materials, measurements, styles, and official images traceable to CJ Dropshipping." },
    technologyHome: { title: "Technology and home", description: "Practical accessories for connectivity, charging, and home routines, with no AI features attributed without evidence." },
    wellbeing: { title: "Wellbeing", description: "Accessories for general mobility, exercise, and personal-care routines, without medical claims." },
  },
} as const;

function categoryForSection(market: Market, section: string): ProductNiche | undefined {
  return (Object.entries(markets[market].categorySlugs) as Array<[ProductNiche, string]>).find(([, slug]) => slug === section)?.[0];
}

export async function generateStaticParams() {
  return (["co", "us"] as Market[]).flatMap((market) => [
    { market, section: markets[market].cartSegment },
    ...Object.values(markets[market].categorySlugs).map((section) => ({ market, section })),
    ...trustPageSlugs[market].map((section) => ({ market, section })),
  ]);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: rawMarket, section } = await params;
  if (!isMarket(rawMarket)) return { robots: { index: false, follow: false } };
  const market = rawMarket;
  if (section === markets[market].cartSegment) return { title: market === "co" ? "Carrito y envío" : "Cart and shipping", robots: { index: false, follow: false } };
  const niche = categoryForSection(market, section);
  if (niche) {
    const copy = categoryCopy[market][niche];
    const path = categoryPath(market, niche);
    return {
      title: copy.title,
      description: copy.description,
      alternates: { canonical: path, languages: { "es-CO": categoryPath("co", niche), "en-US": categoryPath("us", niche), "x-default": categoryPath("co", niche) } },
      openGraph: { type: "website", locale: market === "co" ? "es_CO" : "en_US", url: siteUrlFor(path), title: copy.title, description: copy.description, images: [{ url: "/brand/nexora-logo.png", alt: "Nexora" }] },
      twitter: { card: "summary_large_image", title: copy.title, description: copy.description, images: ["/brand/nexora-logo.png"] },
    };
  }
  const page = getTrustPage(market, section);
  if (!page) return { robots: { index: false, follow: false } };
  const counterpart = counterpartTrustSlug(market, section);
  const path = `${markets[market].homePath}/${section}`;
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: path, languages: counterpart ? { "es-CO": market === "co" ? path : `${markets.co.homePath}/${counterpart}`, "en-US": market === "us" ? path : `${markets.us.homePath}/${counterpart}`, "x-default": market === "co" ? path : `${markets.co.homePath}/${counterpart}` } : undefined },
    openGraph: { type: "website", locale: market === "co" ? "es_CO" : "en_US", url: siteUrlFor(path), title: page.title, description: page.description, images: [{ url: "/brand/nexora-logo.png", alt: "Nexora" }] },
    twitter: { card: "summary_large_image", title: page.title, description: page.description, images: ["/brand/nexora-logo.png"] },
    robots: page.indexable ? { index: true, follow: true } : { index: false, follow: true },
  };
}

export default async function LocalizedSectionPage({ params }: Props) {
  const { market: rawMarket, section } = await params;
  if (!isMarket(rawMarket)) notFound();
  const market = rawMarket;
  const dictionary = getDictionary(market);
  const exchangeRate = market === "us" ? getExchangeRateSnapshot() : undefined;

  if (section === markets[market].cartSegment) {
    const products = (await getCatalog()).filter((product) => hasCompleteEditorial(product, market)).map((product) => toStorefrontProduct(product, market, exchangeRate));
    return <><StoreHeader market={market} /><main id="page-content" tabIndex={-1} className="mx-auto min-h-[70vh] max-w-7xl px-5 py-10 outline-none sm:px-8 lg:px-12"><CartCheckout products={products} market={market} /></main><StoreFooter market={market} /></>;
  }

  const niche = categoryForSection(market, section);
  if (niche) {
    const copy = categoryCopy[market][niche];
    const products = (await getCatalog()).filter((product) => product.niche === niche && isStoreProductAvailable(product) && hasCompleteEditorial(product, market)).map((product) => toStorefrontProduct(product, market, exchangeRate));
    const canonical = siteUrlFor(categoryPath(market, niche));
    const schemas = [{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: dictionary.home, item: siteUrlFor(markets[market].homePath) }, { "@type": "ListItem", position: 2, name: copy.title, item: canonical }] }, { "@context": "https://schema.org", "@type": "ItemList", name: copy.title, numberOfItems: products.length, itemListElement: products.map((product, index) => ({ "@type": "ListItem", position: index + 1, url: siteUrlFor(`${markets[market].homePath}/${markets[market].productSegment}/${product.slug}`), name: product.name })) }];
    return <><StoreHeader market={market} /><main id="page-content" tabIndex={-1} className="mx-auto min-h-[70vh] max-w-7xl px-5 py-10 outline-none sm:px-8 lg:px-12"><CommerceViewTracker market={market} type="view_item_list" id={niche} name={copy.title} items={products.map((product) => ({ item_id: product.sku, item_name: product.name, item_category: product.niche, price: product.price ?? undefined, quantity: 1 }))} /><nav aria-label={dictionary.breadcrumbs} className="text-xs text-silver/65"><Link href={markets[market].homePath} className="hover:text-emerald">{dictionary.home}</Link> / <span aria-current="page" className="text-white">{copy.title}</span></nav><header className="max-w-3xl py-10"><p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">{dictionary.categoryEyebrow}</p><h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">{copy.title}</h1><p className="mt-5 text-lg leading-8 text-silver/75">{copy.description}</p></header>{products.length ? <section aria-label={copy.title} className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{products.map((product, index) => <ProductCard key={product.slug} product={product} priority={index === 0} />)}</section> : <p className="rounded-2xl border border-silver/15 p-6 text-silver/70">{dictionary.emptyCategory}</p>}<nav className="mt-12 flex flex-wrap gap-4 border-t border-silver/15 pt-8 text-sm" aria-label={market === "co" ? "Otras categorías" : "Other categories"}>{(Object.keys(markets[market].categorySlugs) as ProductNiche[]).filter((candidate) => candidate !== niche).map((candidate) => <Link key={candidate} href={categoryPath(market, candidate)} className="text-emerald hover:text-white">{categoryCopy[market][candidate].title}</Link>)}</nav><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schemas).replace(/</g, "\\u003c") }} /></main><StoreFooter market={market} /></>;
  }

  const page = getTrustPage(market, section);
  if (!page) notFound();
  const merchantIdentity = getMerchantIdentity();
  const canonical = siteUrlFor(`${markets[market].homePath}/${section}`);
  const schema = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: dictionary.home, item: siteUrlFor(markets[market].homePath) }, { "@type": "ListItem", position: 2, name: page.title, item: canonical }] };
  return <><StoreHeader market={market} /><main id="page-content" tabIndex={-1} className="mx-auto min-h-[70vh] max-w-4xl px-5 py-12 outline-none sm:px-8 lg:py-16"><nav aria-label={dictionary.breadcrumbs} className="text-xs text-silver/65"><Link href={markets[market].homePath} className="hover:text-emerald">{dictionary.home}</Link> / <span aria-current="page" className="text-white">{page.title}</span></nav><header className="py-10"><h1 className="text-4xl font-semibold text-white sm:text-5xl">{page.title}</h1><p className="mt-5 text-lg leading-8 text-silver/75">{page.description}</p></header><div className="space-y-5">{page.sections.map((content) => <section key={content.heading} className="rounded-2xl border border-silver/15 bg-white/[.025] p-6"><h2 className="text-xl font-semibold text-white">{content.heading}</h2>{content.paragraphs.map((paragraph) => <p key={paragraph} className="mt-3 text-sm leading-7 text-silver/75">{paragraph}</p>)}{content.bullets ? <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-silver/75">{content.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}</section>)}{merchantIdentity.complete && ["contact", "terms"].includes(page.key) ? <section className="rounded-2xl border border-emerald/25 bg-emerald/[.04] p-6"><h2 className="text-xl font-semibold text-white">{market === "co" ? "Identidad del comercio" : "Merchant identity"}</h2><dl className="mt-4 grid gap-3 text-sm text-silver/75"><div><dt className="text-silver/50">{market === "co" ? "Nombre legal" : "Legal name"}</dt><dd className="font-medium text-white">{merchantIdentity.legalName}</dd></div><div><dt className="text-silver/50">{market === "co" ? "Domicilio aprobado" : "Approved address"}</dt><dd className="font-medium text-white">{merchantIdentity.address}</dd></div>{merchantIdentity.taxId ? <div><dt className="text-silver/50">{market === "co" ? "Identificación tributaria" : "Tax identifier"}</dt><dd className="font-medium text-white">{merchantIdentity.taxId}</dd></div> : null}</dl></section> : null}</div><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} /></main><StoreFooter market={market} /></>;
}
