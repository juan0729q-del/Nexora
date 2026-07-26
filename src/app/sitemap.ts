import type { MetadataRoute } from "next";
import { getCatalog } from "@/lib/catalog-store";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://nexora-amber-two.vercel.app";
  const products = await getCatalog();
  return [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    ...products.filter((product) => product.active).map((product) => ({
      url: `${baseUrl}/productos/${product.slug}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
