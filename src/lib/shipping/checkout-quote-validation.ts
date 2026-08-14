import type { Market, StoreCurrency, StoreLocale } from "@/lib/i18n/config";

type CheckoutQuoteIdentity = {
  market: Market;
  locale: StoreLocale;
  currency: StoreCurrency;
  productSlug: string;
  productPriceCop: number;
  productSubtotalCop: number;
  quantity: number;
  variantSku: string;
};

type CheckoutQuoteExpectation = {
  market: Market;
  locale: StoreLocale;
  currency: StoreCurrency;
  productSlug: string;
  productPriceCop: number;
  quantity: number;
  variantSku: string;
};

/**
 * Pure checkout guard shared by the API route and functional tests. A signed
 * quote is invalidated whenever its market, currency, product, style or
 * quantity no longer matches the cart being charged.
 */
export function checkoutQuoteMatches(
  quote: CheckoutQuoteIdentity,
  expected: CheckoutQuoteExpectation,
) {
  return quote.market === expected.market
    && quote.locale === expected.locale
    && quote.currency === expected.currency
    && quote.productSlug === expected.productSlug
    && quote.productPriceCop === expected.productPriceCop
    && quote.productSubtotalCop === expected.productPriceCop * expected.quantity
    && quote.quantity === expected.quantity
    && quote.variantSku.toUpperCase() === expected.variantSku.toUpperCase();
}
