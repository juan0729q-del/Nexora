import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LocalizedHome } from "@/components/store/localized-home";
import { isMarket, markets, type Market } from "@/lib/i18n/config";
import { siteUrlFor } from "@/lib/site";

export const revalidate = 3600;
type Props = { params: Promise<{ market: string }> };

export function generateStaticParams() { return [{ market: "co" }, { market: "us" }]; }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { market: rawMarket } = await params;
  if (!isMarket(rawMarket)) return { robots: { index: false, follow: false } };
  const market = rawMarket as Market;
  const isCo = market === "co";
  const path = markets[market].homePath;
  return {
    title: isCo ? "Joyería, tecnología y bienestar en Colombia" : "Jewelry, home technology, and wellbeing",
    description: isCo ? "Selección Nexora con productos reales de CJ, imágenes oficiales, disponibilidad trazable y envío cotizado antes del pago." : "A curated Nexora catalog using real CJ products, official images, traceable availability, and destination-based shipping quotes.",
    alternates: { canonical: path, languages: { "es-CO": "/co", "en-US": "/us", "x-default": "/co" } },
    openGraph: { type: "website", locale: isCo ? "es_CO" : "en_US", url: siteUrlFor(path), title: isCo ? "Nexora Colombia" : "Nexora United States", description: isCo ? "Joyería, tecnología y bienestar con trazabilidad del proveedor." : "Jewelry, technology, and wellbeing with supplier traceability.", images: [{ url: "/brand/nexora-logo.png", width: 1024, height: 1024, alt: "Nexora" }] },
    twitter: { card: "summary_large_image", title: isCo ? "Nexora Colombia" : "Nexora United States", description: isCo ? "Joyería, tecnología y bienestar con trazabilidad del proveedor." : "Jewelry, technology, and wellbeing with supplier traceability.", images: ["/brand/nexora-logo.png"] },
  };
}

export default async function MarketHome({ params }: Props) {
  const { market } = await params;
  if (!isMarket(market)) notFound();
  return <LocalizedHome market={market} />;
}
