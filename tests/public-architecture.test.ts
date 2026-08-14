import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("el sitemap escapa los parametros de las imagenes oficiales de CJ", async () => {
  const sitemap = await source("src/app/sitemap.ts");
  assert.match(sitemap, /xmlSafeImageUrl/);
  assert.match(sitemap, /replace\(\/&\/g, "&amp;"\)/);
  assert.match(sitemap, /product\.images\.map\(\(image\) => xmlSafeImageUrl\(image\.src\)\)/);
});

test("robots excluye las superficies privadas y de conversión", async () => {
  const robots = await source("src/app/robots.ts");
  for (const path of ["/api/", "/admin/", "/co/carrito", "/us/cart", "/co/checkout/", "/us/checkout/"]) {
    assert.ok(robots.includes(`\"${path}\"`), `falta bloquear ${path}`);
  }
});

test("purchase depende de una conciliación persistida y no de la llegada al resultado", async () => {
  const statusApi = await source("src/app/api/payments/wompi/status/route.ts");
  const result = await source("src/components/store/checkout-result-status.tsx");
  assert.match(statusApi, /recordWompiTransaction/);
  assert.match(statusApi, /fulfillmentStatus\?\.toUpperCase\(\) !== "PAGO CONFIRMADO"/);
  assert.match(statusApi, /persisted\.needsReview/);
  assert.match(result, /payload\.status === "APPROVED"/);
  assert.match(result, /purchase:/);
});

test("el checkout estadounidense exige PayPal completo, conciliado y activado", async () => {
  const registry = await source("src/lib/payments/market-provider.ts");
  const checkout = await source("src/app/api/payments/checkout/route.ts");
  const paypal = await source("src/lib/payments/paypal.ts");
  const paypalStatus = await source("src/app/api/payments/paypal/status/route.ts");
  const hostedCheckout = await source("src/lib/payments/hosted-checkout.ts");
  const appsScript = await source("docs/google-apps-script/Code.gs");
  assert.match(registry, /id: \"unconfigured\"/);
  assert.match(registry, /id: \"paypal\"/);
  assert.match(registry, /salesLedgerConfigured\(\)/);
  for (const variable of ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_WEBHOOK_ID", "PAYPAL_ENVIRONMENT", "PAYPAL_CHECKOUT_ENABLED"]) {
    assert.ok(paypal.includes(variable), `falta validar ${variable}`);
  }
  assert.match(checkout, /isMarket\(body\.market\)/);
  assert.match(checkout, /checkoutQuoteMatches/);
  const getHandler = paypalStatus.slice(paypalStatus.indexOf("export async function GET"), paypalStatus.indexOf("export async function POST"));
  const postHandler = paypalStatus.slice(paypalStatus.indexOf("export async function POST"));
  assert.match(getHandler, /queryPayPalOrder/);
  assert.match(getHandler, /getPersistedSalesOrder/);
  assert.doesNotMatch(getHandler, /capturePayPalOrder/);
  assert.doesNotMatch(getHandler, /recordPayPalTransaction/);
  assert.match(postHandler, /capturePayPalOrder/);
  assert.match(postHandler, /recordPayPalTransaction/);
  const preparedLedgerWrite = hostedCheckout.indexOf("recordPreparedCheckout(preparedCheckout)");
  const remotePayPalCreation = hostedCheckout.indexOf("return createPayPalCheckout");
  assert.ok(preparedLedgerWrite >= 0, "falta persistir la orden preparada");
  assert.ok(remotePayPalCreation >= 0, "falta crear la orden PayPal");
  assert.ok(preparedLedgerWrite < remotePayPalCreation, "PayPal no puede crearse antes del libro privado");
  assert.match(appsScript, /CONTRACT_VERSION: "2026-08-13\.6"/);
  assert.match(appsScript, /input\.action === "sales\.order\.read"/);
});

test("las políticas incompletas se excluyen de indexación y del sitemap", async () => {
  const trustContent = await source("src/lib/trust-content.ts");
  const trustPage = await source("src/app/[market]/[section]/page.tsx");
  const sitemap = await source("src/app/sitemap.ts");
  assert.match(trustContent, /incompletePolicyKeys/);
  assert.match(trustPage, /indexable/);
  assert.match(trustPage, /robots/);
  assert.match(sitemap, /getTrustPage\(market, slug\)\?\.indexable/);
});

test("la analítica publicitaria es opcional y purchase se concilia antes de emitirse", async () => {
  const consent = await source("src/lib/analytics/config.ts");
  const result = await source("src/components/store/checkout-result-status.tsx");
  assert.match(consent, /NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL/);
  assert.match(consent, /NEXT_PUBLIC_META_PIXEL_ID/);
  assert.match(consent, /NEXT_PUBLIC_TIKTOK_PIXEL_ID/);
  assert.match(result, /payload\.status === \"APPROVED\"/);
  assert.match(result, /payload\.amount/);
  assert.match(result, /payload\.currency/);
  assert.match(result, /dedupeKey: `purchase:/);
});

test("Merchant Center requiere activación y políticas aprobadas", async () => {
  const feed = await source("src/lib/merchant-feed.ts");
  assert.match(feed, /MERCHANT_CENTER_FEED_ENABLED/);
  assert.match(feed, /MERCHANT_CENTER_POLICIES_APPROVED/);
  assert.doesNotMatch(feed, /<g:gtin>/);
  assert.doesNotMatch(feed, /<g:brand>/);
  for (const attribute of ["g:title", "g:description", "g:link", "g:image_link", "g:price", "g:availability"]) {
    assert.ok(feed.includes(`<${attribute}>`), `falta el atributo ${attribute}`);
  }
  assert.match(feed, /product\.images\.filter/);
});

test("Colombia exige controles de pago, tasa vigente y libro privado", async () => {
  const registry = await source("src/lib/payments/market-provider.ts");
  const pricing = await source("src/lib/market-pricing.ts");
  for (const variable of ["WOMPI_EVENT_ENVIRONMENT", "WOMPI_INTEGRITY_SECRET", "WOMPI_EVENT_SECRET", "GOOGLE_SHEETS_WEBHOOK_URL", "GOOGLE_SHEETS_WEBHOOK_SECRET"]) {
    assert.ok(registry.includes(variable), `falta validar ${variable}`);
  }
  assert.match(pricing, /provider\.checkoutEnabled && exchangeRate\.valid/);
});
