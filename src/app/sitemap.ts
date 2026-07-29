import type { MetadataRoute } from "next";
import { getCatalog, getCatalogImportMetadata } from "@/lib/catalog-store";
import { isStoreProductAvailable } from "@/lib/products";
import { getSiteUrl } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const products = await getCatalog();
  const metadata = getCatalogImportMetadata();
  const lastModified = metadata.importedAt ? new Date(metadata.importedAt) : undefined;

  return [
    { url: baseUrl, lastModified, changeFrequency: "weekly", priority: 1 },
    ...products.filter(isStoreProductAvailable).map((product) => ({
      url: `${baseUrl}/productos/${product.slug}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      images: [product.image.src],
    })),
  ];
}
