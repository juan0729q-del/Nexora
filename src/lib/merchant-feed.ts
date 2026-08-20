import "server-only";

import { createHash } from "crypto";
import { getOperationalCatalog } from "@/lib/catalog-store";
import { markets, productPath, type Market } from "@/lib/i18n/config";
import { getExchangeRateSnapshot, getMarketCommerceReadiness } from "@/lib/market-pricing";
import { getProductPresentation, hasCompleteEditorial, toStorefrontProduct } from "@/lib/product-presentation";
import { isStoreProductAvailable } from "@/lib/products";
import { getSiteUrl } from "@/lib/site";

export class MerchantFeedNotConfiguredError extends Error {}

function xml(value: string | number) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character]!);
}

function publicItemId(sku: string) {
  return `NXR-${createHash("sha256").update(sku).digest("hex").slice(0, 16).toUpperCase()}`;
}

function merchantFeedEnabled(market: Market) {
  return process.env.MERCHANT_CENTER_FEED_ENABLED?.trim().toLowerCase() === "true"
    && process.env.MERCHANT_CENTER_POLICIES_APPROVED?.trim().toLowerCase() === "true"
    && (market === "co" || process.env.MERCHANT_CENTER_US_APPROVED?.trim().toLowerCase() === "true");
}

export async function buildGoogleMerchantFeed(market: Market) {
  const readiness = getMarketCommerceReadiness(market);
  if (!merchantFeedEnabled(market)) {
    throw new MerchantFeedNotConfiguredError("El feed requiere aprobación explícita de políticas y activación en variables de entorno.");
  }
  if (!readiness.checkoutEnabled) {
    throw new MerchantFeedNotConfiguredError(readiness.reason || "El checkout del mercado no está operativo.");
  }
  const exchangeRate = getExchangeRateSnapshot();
  if (market === "us" && !exchangeRate.valid) throw new MerchantFeedNotConfiguredError(exchangeRate.detail);

  const baseUrl = getSiteUrl();
  const products = (await getOperationalCatalog()).filter((product) => isStoreProductAvailable(product) && hasCompleteEditorial(product, market));
  const items = products.flatMap((product) => {
    const storefront = toStorefrontProduct(product, market, exchangeRate);
    if (!storefront.available || storefront.price === null) return [];
    const copy = getProductPresentation(product, market);
    return [`<item>
  <g:id>${xml(publicItemId(product.sku))}</g:id>
  <g:title>${xml(copy.title)}</g:title>
  <g:description>${xml(copy.detailDescription)}</g:description>
  <g:link>${xml(`${baseUrl}${productPath(market, product.slug)}`)}</g:link>
  <g:image_link>${xml(product.image.src)}</g:image_link>
${product.images.filter((image) => image.src !== product.image.src).slice(0, 10).map((image) => `  <g:additional_image_link>${xml(image.src)}</g:additional_image_link>`).join("\n")}
  <g:availability>in_stock</g:availability>
  <g:condition>new</g:condition>
  <g:price>${xml(storefront.price.toFixed(storefront.currency === "COP" ? 0 : 2))} ${storefront.currency}</g:price>
  <g:identifier_exists>no</g:identifier_exists>
</item>`];
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">
<channel>
  <title>${xml(`Nexora ${markets[market].label}`)}</title>
  <link>${xml(`${baseUrl}${markets[market].homePath}`)}</link>
  <description>${xml(market === "co" ? "Catálogo elegible de Nexora para Colombia" : "Eligible Nexora catalog for the United States")}</description>
${items.join("\n")}
</channel>
</rss>`;
}
