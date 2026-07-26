import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NexyMascot } from "@/components/store/nexy-mascot";
import { getSiteUrl } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Nexora | Moda masculina, bienestar y tecnología", template: "%s | Nexora" },
  description: "Descubre moda masculina, bienestar y tecnología funcional seleccionada para elevar tu rutina.",
  keywords: ["moda masculina", "bienestar", "tecnología funcional", "joyería acero titanio", "Nexora"],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "es_CO", siteName: "Nexora", title: "Nexora | Diseño que eleva tu rutina", description: "Moda masculina, bienestar y tecnología funcional.", url: siteUrl, images: [{ url: "/brand/nexora-logo.png", width: 1024, height: 1024, alt: "Emblema Nexora" }] },
  twitter: { card: "summary_large_image", title: "Nexora | Diseño que eleva tu rutina", description: "Moda masculina, bienestar y tecnología funcional.", images: ["/brand/nexora-logo.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-onyx font-sans text-white antialiased">
        {children}
        <NexyMascot />
      </body>
    </html>
  );
}
