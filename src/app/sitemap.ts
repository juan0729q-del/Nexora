import type { MetadataRoute } from "next";
import { products } from "@/lib/products";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nexora-amber-two.vercel.app";
  return [{ url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }, ...products.map((product) => ({ url: `${baseUrl}/productos/${product.slug}`, lastModified: new Date(), changeFrequency: "weekly" as const, priority: 0.8 }))];
}
