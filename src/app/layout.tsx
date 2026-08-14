import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { AnalyticsConsent } from "@/components/analytics/analytics-consent";
import { CartProvider } from "@/components/store/cart-context";
import { NexyProvider } from "@/components/store/nexy-context";
import { NexyMascot } from "@/components/store/nexy-mascot";
import { IntelligenceTracker } from "@/components/store/intelligence-tracker";
import { getPublicAnalyticsConfig } from "@/lib/analytics/config";
import { getMerchantIdentity } from "@/lib/merchant-identity";
import { getPublicContact } from "@/lib/public-contact";
import { getSiteUrl, siteUrlFor } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const siteUrl = getSiteUrl();
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();
const bingSiteVerification = process.env.BING_SITE_VERIFICATION?.trim();

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0F0F0F",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Nexora",
  title: { default: "Nexora | Joyería, tecnología y bienestar", template: "%s | Nexora" },
  description: "Descubre joyería, tecnología para el hogar y bienestar seleccionados para elevar tu rutina.",
  keywords: ["joyería", "tecnología para el hogar", "bienestar", "productos CJ Dropshipping", "Nexora"],
  creator: "Nexora",
  publisher: "Nexora",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  verification: {
    google: googleSiteVerification || undefined,
    other: bingSiteVerification ? { "msvalidate.01": bingSiteVerification } : {},
  },
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Nexora",
    title: "Nexora | Diseño que eleva tu rutina",
    description: "Joyería, tecnología para el hogar y bienestar seleccionados con intención.",
    url: siteUrl,
    images: [{ url: "/brand/nexora-logo.png", width: 1024, height: 1024, alt: "Emblema Nexora" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexora | Diseño que eleva tu rutina",
    description: "Joyería, tecnología para el hogar y bienestar seleccionados con intención.",
    images: ["/brand/nexora-logo.png"],
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const merchantIdentity = getMerchantIdentity();
  const publicContact = getPublicContact();
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}#organization`,
    name: "Nexora",
    ...(merchantIdentity.complete ? {
      legalName: merchantIdentity.legalName,
      address: { "@type": "PostalAddress", streetAddress: merchantIdentity.address },
      ...(merchantIdentity.taxId ? { taxID: merchantIdentity.taxId } : {}),
    } : {}),
    url: siteUrl,
    logo: siteUrlFor("/brand/nexora-logo.png"),
    sameAs: [
      publicContact.facebookUrl,
      publicContact.instagramUrl,
      publicContact.tiktokUrl,
    ],
  };
  const organizationSchemaJson = JSON.stringify(organizationSchema).replace(/</g, "\\u003c");
  const requestHeaders = await headers();
  const locale = requestHeaders.get("x-nexora-locale") === "en-US" ? "en-US" : "es-CO";
  const analyticsConfig = getPublicAnalyticsConfig();

  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-onyx font-sans text-white antialiased">
        <a href="#page-content" className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-emerald px-4 py-2 text-sm font-bold text-onyx transition focus:translate-y-0">{locale === "en-US" ? "Skip to content" : "Saltar al contenido"}</a>
        <CartProvider>
          <NexyProvider>
            <IntelligenceTracker />
            {children}
            <NexyMascot />
            <AnalyticsConsent config={analyticsConfig} />
          </NexyProvider>
        </CartProvider>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationSchemaJson }} />
      </body>
    </html>
  );
}
