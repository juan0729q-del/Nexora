import type { MetadataRoute } from "next";
import { getCatalogImportMetadata, getOperationalCatalog } from "@/lib/catalog-store";
import { categoryPath, markets, productPath, type Market } from "@/lib/i18n/config";
import { hasCompleteEditorial } from "@/lib/product-presentation";
import { isStoreProductAvailable } from "@/lib/products";
import { getSiteUrl } from "@/lib/site";
import { counterpartTrustSlug, getTrustPage, trustPageSlugs } from "@/lib/trust-content";

export const revalidate = 3600;

// Next.js serializes image entries without escaping their query strings.
// Keep the official CJ URL intact while representing `&` as valid XML.
function xmlSafeImageUrl(url: string) {
  return url.replace(/&/g, "&amp;");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getSiteUrl();
  const products = await getOperationalCatalog();
  const metadata = getCatalogImportMetadata();
  const lastModified = metadata.importedAt ? new Date(metadata.importedAt) : undefined;

  const publicProducts = products.filter(isStoreProductAvailable);
  const marketsList: Market[] = ["co", "us"];
  const staticEntries = marketsList.flatMap((market) => {
    const home = markets[market].homePath;
    return [
      { url: `${baseUrl}${home}`, lastModified, changeFrequency: "weekly" as const, priority: 1, alternates: { languages: { "es-CO": `${baseUrl}/co`, "en-US": `${baseUrl}/us`, "x-default": `${baseUrl}/co` } } },
      ...(Object.keys(markets[market].categorySlugs) as Array<keyof typeof markets.co.categorySlugs>).map((niche) => ({
        url: `${baseUrl}${categoryPath(market, niche)}`,
        lastModified,
        changeFrequency: "weekly" as const,
        priority: 0.85,
        alternates: { languages: { "es-CO": `${baseUrl}${categoryPath("co", niche)}`, "en-US": `${baseUrl}${categoryPath("us", niche)}`, "x-default": `${baseUrl}${categoryPath("co", niche)}` } },
      })),
      ...trustPageSlugs[market].filter((slug) => getTrustPage(market, slug)?.indexable).map((slug) => {
        const counterpart = counterpartTrustSlug(market, slug);
        const coPath = market === "co" ? `${home}/${slug}` : `${markets.co.homePath}/${counterpart}`;
        const usPath = market === "us" ? `${home}/${slug}` : `${markets.us.homePath}/${counterpart}`;
        return {
          url: `${baseUrl}${home}/${slug}`,
          lastModified,
          changeFrequency: "monthly" as const,
          priority: 0.55,
          alternates: counterpart ? { languages: { "es-CO": `${baseUrl}${coPath}`, "en-US": `${baseUrl}${usPath}`, "x-default": `${baseUrl}${coPath}` } } : undefined,
        };
      }),
    ];
  });
  const productEntries = marketsList.flatMap((market) => publicProducts
    .filter((product) => hasCompleteEditorial(product, market))
    .map((product) => ({
      url: `${baseUrl}${productPath(market, product.slug)}`,
      lastModified,
      changeFrequency: "weekly" as const,
      priority: 0.8,
      images: product.images.map((image) => xmlSafeImageUrl(image.src)),
      alternates: hasCompleteEditorial(product, market === "co" ? "us" : "co") ? { languages: { "es-CO": `${baseUrl}${productPath("co", product.slug)}`, "en-US": `${baseUrl}${productPath("us", product.slug)}`, "x-default": `${baseUrl}${productPath("co", product.slug)}` } } : undefined,
    })));
  return [...staticEntries, ...productEntries];
}
