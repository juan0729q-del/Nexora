import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nexora.store";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Nexora | Moda masculina, bienestar y tecnología", template: "%s | Nexora" },
  description: "Descubre moda masculina, bienestar y tecnología funcional seleccionada para elevar tu rutina.",
  keywords: ["moda masculina", "bienestar", "tecnología funcional", "joyería acero titanio", "Nexora"],
  robots: { index: true, follow: true },
  openGraph: { type: "website", locale: "es_CO", siteName: "Nexora", title: "Nexora | Diseño que eleva tu rutina", description: "Moda masculina, bienestar y tecnología funcional.", url: siteUrl },
  twitter: { card: "summary_large_image", title: "Nexora | Diseño que eleva tu rutina", description: "Moda masculina, bienestar y tecnología funcional." },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full`}><body className="min-h-full bg-onyx font-sans text-white antialiased">{children}</body></html>;
}
