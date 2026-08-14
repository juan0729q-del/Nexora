import type { CommerceEvent } from "./types";

export type PublicAnalyticsConfig = {
  ga4?: string;
  googleAds?: string;
  googleAdsPurchaseLabel?: string;
  metaPixel?: string;
  tiktokPixel?: string;
};

export type AdvertisingDispatch = {
  platform: "google-ads" | "meta" | "tiktok";
  eventName: string;
  payload: Record<string, unknown>;
};

const metaEvents: Partial<Record<CommerceEvent["name"], string>> = {
  page_view: "PageView",
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  purchase: "Purchase",
};

const tiktokEvents: Partial<Record<CommerceEvent["name"], string>> = {
  page_view: "PageView",
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  purchase: "CompletePayment",
};

/** Pure adapter mapping. It never receives or emits customer contact data. */
export function buildAdvertisingDispatches(
  event: CommerceEvent,
  config: PublicAnalyticsConfig,
  payload: Record<string, unknown>,
): AdvertisingDispatch[] {
  const dispatches: AdvertisingDispatch[] = [];
  if (event.name === "purchase" && config.googleAds && config.googleAdsPurchaseLabel && event.transactionId) {
    dispatches.push({
      platform: "google-ads",
      eventName: "conversion",
      payload: {
        send_to: `${config.googleAds}/${config.googleAdsPurchaseLabel}`,
        value: event.value,
        currency: payload.currency,
        transaction_id: event.transactionId,
      },
    });
  }
  const metaEvent = metaEvents[event.name];
  if (config.metaPixel) {
    dispatches.push({ platform: "meta", eventName: metaEvent || event.name, payload });
  }
  if (config.tiktokPixel) {
    dispatches.push({ platform: "tiktok", eventName: tiktokEvents[event.name] || event.name, payload });
  }
  return dispatches;
}
