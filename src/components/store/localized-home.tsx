import Image from "next/image";
import Link from "next/link";
import { categoryPath, getDictionary, type Market } from "@/lib/i18n/config";
import { NicheCatalogSection } from "@/components/store/niche-catalog-section";
import { StoreFooter } from "@/components/store/store-footer";
import { StoreHeader } from "@/components/store/store-header";
import { TechnologyCatalogSection } from "@/components/store/technology-catalog-section";

export function LocalizedHome({ market }: { market: Market }) {
  const dictionary = getDictionary(market);
  return <>
    <StoreHeader market={market} />
    <main id="page-content" tabIndex={-1} className="outline-none">
      <section className="relative isolate overflow-hidden border-b border-silver/20 px-5 py-16 sm:px-8 sm:py-24 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="mb-5 inline-flex rounded-full border border-emerald/40 bg-emerald/10 px-3 py-1 text-xs font-bold tracking-[0.16em] text-emerald uppercase">{dictionary.heroEyebrow}</p>
            <h1 className="max-w-3xl text-4xl leading-[1.04] font-semibold tracking-tight text-white sm:text-6xl">{dictionary.heroTitle}</h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-silver/80 sm:text-lg">{dictionary.heroDescription}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a className="rounded-full bg-emerald px-5 py-3 text-sm font-bold text-onyx transition hover:bg-emerald/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald" href="#joyeria">{dictionary.exploreJewelry}</a>
              <a className="rounded-full border border-silver/35 px-5 py-3 text-sm font-semibold text-white transition hover:border-silver" href="#tecnologia-tradicional">{dictionary.seeTechnology}</a>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-4 border-t border-silver/20 pt-5 text-sm">
              <div><dt className="text-silver/65">{dictionary.catalog}</dt><dd className="mt-1 font-semibold text-white">{dictionary.verified}</dd></div>
              <div><dt className="text-silver/65">{dictionary.payment}</dt><dd className="mt-1 font-semibold text-white">{market === "co" ? dictionary.protected : "Not configured"}</dd></div>
              <div><dt className="text-silver/65">{dictionary.images}</dt><dd className="mt-1 font-semibold text-white">{dictionary.original}</dd></div>
            </dl>
            {market === "us" ? <p className="mt-5 max-w-xl rounded-xl border border-amber-300/30 bg-amber-300/[.07] p-3 text-xs leading-5 text-amber-100">{dictionary.usCheckoutUnavailable}</p> : null}
          </div>
          <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-[2rem] border border-silver/20 bg-[radial-gradient(circle_at_55%_40%,rgba(0,148,115,0.28),transparent_31%),linear-gradient(135deg,#181818,#090909)] p-8 shadow-2xl shadow-black/50">
            <div className="absolute inset-6 rounded-[1.4rem] border border-silver/15" />
            <div className="absolute inset-0 grid place-items-center"><div className="nexora-hero-logo" aria-label="Nexora"><span className="nexora-spark nexora-spark-one" /><span className="nexora-spark nexora-spark-two" /><span className="nexora-spark nexora-spark-three" /><div className="nexora-hero-logo-rotate"><Image src="/brand/nexora-logo.png" alt="Nexora" fill priority sizes="(min-width: 1024px) 400px, 70vw" className="object-contain" /></div></div></div>
            <p className="absolute right-8 bottom-8 text-right text-xs leading-5 tracking-[0.16em] text-silver/80 uppercase">{market === "co" ? <>Utilidad<br />con intención</> : <>Useful<br />by design</>}</p>
          </div>
        </div>
      </section>
      <NicheCatalogSection niche="jewelry" market={market} priority />
      <TechnologyCatalogSection segment="traditional" market={market} />
      <TechnologyCatalogSection segment="artificialIntelligence" market={market} />
      <NicheCatalogSection niche="wellbeing" market={market} />
      <section className="border-y border-silver/15 bg-white/[0.025] px-5 py-16 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-3">
          <div><p className="text-xs font-bold tracking-[0.16em] text-emerald uppercase">{dictionary.purposeEyebrow}</p><h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">{dictionary.purposeTitle}</h2></div>
          <p className="text-sm leading-7 text-silver/75">{dictionary.purposeOne}</p>
          <p className="text-sm leading-7 text-silver/75">{dictionary.purposeTwo}</p>
        </div>
        <nav className="mx-auto mt-10 flex max-w-7xl flex-wrap gap-4 text-sm" aria-label={market === "co" ? "Categorías" : "Categories"}>
          <Link href={categoryPath(market, "jewelry")} className="text-emerald hover:text-white">{dictionary.jewelry}</Link>
          <Link href={categoryPath(market, "technologyHome")} className="text-emerald hover:text-white">{dictionary.technology}</Link>
          <Link href={categoryPath(market, "wellbeing")} className="text-emerald hover:text-white">{dictionary.wellbeing}</Link>
        </nav>
      </section>
    </main>
    <StoreFooter market={market} />
  </>;
}
