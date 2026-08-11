import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { CartProvider } from "@/components/store/cart-context";
import { NexyProvider } from "@/components/store/nexy-context";
import { NexyMascot } from "@/components/store/nexy-mascot";
import { IntelligenceTracker } from "@/components/store/intelligence-tracker";
import { getSiteUrl, siteUrlFor } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const siteUrl = getSiteUrl();
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();
const bingSiteVerification = process.env.BING_SITE_VERIFICATION?.trim();
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "@id": `${siteUrl}#organization`,
  name: "Nexora",
  url: siteUrl,
  logo: siteUrlFor("/brand/nexora-logo.png"),
  sameAs: [
    "https://www.facebook.com/profile.php?id=61592349341501",
    "https://www.instagram.com/nexoraventas1/",
    "https://www.tiktok.com/@nexora.diseo.con",
  ],
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0F0F0F",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "Nexora",
  title: { default: "Nexora | Joyería, tecnología y bienestar", template: "%s | Nexora" },
  description: "Descubre joyería, tecnología tradicional, productos con inteligencia artificial y bienestar seleccionados para elevar tu rutina.",
  keywords: ["joyería", "tecnología", "productos con inteligencia artificial", "tecnología para el hogar", "bienestar", "productos CJ Dropshipping", "Nexora"],
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
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_CO",
    siteName: "Nexora",
    title: "Nexora | Diseño que eleva tu rutina",
    description: "Joyería, tecnología tradicional, productos con inteligencia artificial y bienestar seleccionados con intención.",
    url: siteUrl,
    images: [{ url: "/brand/nexora-logo.png", width: 1024, height: 1024, alt: "Emblema Nexora" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nexora | Diseño que eleva tu rutina",
    description: "Joyería, tecnología tradicional, productos con inteligencia artificial y bienestar seleccionados con intención.",
    images: ["/brand/nexora-logo.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const organizationSchemaJson = JSON.stringify(organizationSchema).replace(/</g, "\\u003c");

  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-onyx font-sans text-white antialiased">
        <a href="#page-content" className="fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-emerald px-4 py-2 text-sm font-bold text-onyx transition focus:translate-y-0">Saltar al contenido</a>
        <CartProvider>
          <NexyProvider>
            <IntelligenceTracker />
            {children}
            <NexyMascot />
          </NexyProvider>
        </CartProvider>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: organizationSchemaJson }} />
      </body>
    </html>
  );
}
