import assert from "node:assert/strict";
import test from "node:test";
import { buildAdvertisingDispatches } from "../src/lib/analytics/adapters";
import type { CommerceEvent } from "../src/lib/analytics/types";
import { buildPayPalOrderPayload, parsePayPalOrder, paypalApiBase, paypalCheckoutHosts } from "../src/lib/payments/paypal-core";
import { checkoutQuoteMatches } from "../src/lib/shipping/checkout-quote-validation";

const reference = "NXR-CART-ABCDEF123456";

test("PayPal prepara una orden USD con desglose y dirección de EE. UU.", () => {
  const payload = buildPayPalOrderPayload({
    reference,
    amount: 31.25,
    productSubtotal: 24.5,
    shippingCost: 6.75,
    returnUrl: `https://nexora.example/us/checkout/result?reference=${reference}`,
    cancelUrl: "https://nexora.example/us/cart",
    customer: {
      name: "Test Customer",
      address1: "1 Main Street",
      city: "Miami",
      region: "FL",
      postalCode: "33101",
      countryCode: "US",
    },
  });
  assert.equal(payload.intent, "CAPTURE");
  assert.equal(payload.purchase_units[0].amount.currency_code, "USD");
  assert.equal(payload.purchase_units[0].amount.value, "31.25");
  assert.equal(payload.purchase_units[0].amount.breakdown.item_total.value, "24.50");
  assert.equal(payload.purchase_units[0].amount.breakdown.shipping.value, "6.75");
  assert.equal(payload.purchase_units[0].shipping.address.country_code, "US");
  assert.equal(payload.purchase_units[0].custom_id, reference);
  assert.throws(() => buildPayPalOrderPayload({
    reference,
    amount: 31,
    productSubtotal: 24.5,
    shippingCost: 6.75,
    returnUrl: "https://nexora.example/us/checkout/result",
    cancelUrl: "https://nexora.example/us/cart",
    customer: { name: "Test", address1: "1 Main Street", city: "Miami", region: "FL", postalCode: "33101", countryCode: "US" },
  }), /invalid-paypal-breakdown/);
});
test("la conciliación PayPal normaliza únicamente capturas USD verificables", () => {
  const capture = parsePayPalOrder({
    id: "5O190127TN364715T",
    status: "COMPLETED",
    purchase_units: [{
      custom_id: reference,
      payments: { captures: [{ id: "3C679366HH908993F", status: "COMPLETED", amount: { currency_code: "USD", value: "31.25" }, update_time: "2026-08-13T20:00:00Z" }] },
    }],
  }, "capture");
  assert.equal(capture.status, "APPROVED");
  assert.equal(capture.amount, 31.25);
  assert.equal(capture.currency, "USD");
  assert.equal(capture.reference, reference);
  assert.throws(() => parsePayPalOrder({
    id: "5O190127TN364715T",
    purchase_units: [{ custom_id: reference, payments: { captures: [{ id: "x", status: "COMPLETED", amount: { currency_code: "COP", value: "31.25" } }] } }],
  }, "capture"), /invalid-paypal-order/);
  assert.equal(paypalApiBase("live"), "https://api-m.paypal.com");
  assert.ok(paypalCheckoutHosts("live").includes("www.paypal.com"));
});

test("cambiar mercado, moneda, estilo o cantidad invalida la cotización", () => {
  const quote = {
    market: "us" as const,
    locale: "en-US" as const,
    currency: "USD" as const,
    productSlug: "official-product",
    productPriceCop: 40_000,
    productSubtotalCop: 80_000,
    quantity: 2,
    variantSku: "CJ-US-BLACK",
  };
  const expected = {
    market: "us" as const,
    locale: "en-US" as const,
    currency: "USD" as const,
    productSlug: "official-product",
    productPriceCop: 40_000,
    quantity: 2,
    variantSku: "cj-us-black",
  };
  assert.equal(checkoutQuoteMatches(quote, expected), true);
  assert.equal(checkoutQuoteMatches(quote, { ...expected, market: "co", locale: "es-CO", currency: "COP" }), false);
  assert.equal(checkoutQuoteMatches(quote, { ...expected, quantity: 3 }), false);
  assert.equal(checkoutQuoteMatches(quote, { ...expected, variantSku: "CJ-US-WHITE" }), false);
});

test("los adaptadores publicitarios conservan moneda, transacción y no agregan PII", () => {
  const event: CommerceEvent = { name: "purchase", market: "us", currency: "USD", value: 31.25, transactionId: "3C679366HH908993F" };
  const dispatches = buildAdvertisingDispatches(event, {
    googleAds: "AW-123456789",
    googleAdsPurchaseLabel: "purchaseLabel",
    metaPixel: "1234567890",
    tiktokPixel: "C1234567890",
  }, { market: "us", currency: "USD", value: 31.25, transaction_id: event.transactionId });
  assert.deepEqual(dispatches.map((entry) => [entry.platform, entry.eventName]), [
    ["google-ads", "conversion"],
    ["meta", "Purchase"],
    ["tiktok", "CompletePayment"],
  ]);
  const google = dispatches[0].payload;
  assert.equal(google.currency, "USD");
  assert.equal(google.transaction_id, event.transactionId);
  assert.equal(google.send_to, "AW-123456789/purchaseLabel");
  const serialized = JSON.stringify(dispatches);
  for (const forbidden of ["email", "address", "phone", "card", "secret"]) assert.doesNotMatch(serialized, new RegExp(forbidden, "i"));
  assert.equal(buildAdvertisingDispatches({ name: "begin_checkout", market: "us", currency: "USD" }, { googleAds: "AW-123", googleAdsPurchaseLabel: "label" }, { currency: "USD" }).length, 0);
});
