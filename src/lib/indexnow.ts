import "server-only";

import { getCatalog } from "@/lib/catalog-store";
import { categoryPath, markets, productPath, type Market } from "@/lib/i18n/config";
import { hasCompleteEditorial } from "@/lib/product-presentation";
import { isStoreProductAvailable } from "@/lib/products";
import { getSiteUrl, siteUrlFor } from "@/lib/site";

// IndexNow exige que la clave sea pública y verificable en una ruta del host.
// No es una credencial secreta ni da acceso a las cuentas de búsqueda.
export const indexNowKey = "ad4e336c7e0f4058b480a03d2d460918";

export async function getIndexableUrls() {
  const products = await getCatalog();
  const marketIds: Market[] = ["co", "us"];
  return [
    ...marketIds.flatMap((market) => [
      siteUrlFor(markets[market].homePath),
      ...Object.keys(markets[market].categorySlugs).map((niche) => siteUrlFor(categoryPath(market, niche as keyof typeof markets.co.categorySlugs))),
    ]),
    ...marketIds.flatMap((market) => products
      .filter((product) => isStoreProductAvailable(product) && hasCompleteEditorial(product, market))
      .map((product) => siteUrlFor(productPath(market, product.slug)))),
  ];
}

/** Envía el conjunto público vigente a IndexNow para acelerar el descubrimiento en Bing. */
export async function notifyIndexNow() {
  const urlList = await getIndexableUrls();
  const host = new URL(getSiteUrl()).host;
  const keyLocation = siteUrlFor(`/${indexNowKey}.txt`);
  const response = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ host, key: indexNowKey, keyLocation, urlList }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`IndexNow respondió ${response.status}.`);

  return { status: "submitted" as const, submitted: urlList.length, host, keyLocation };
}
