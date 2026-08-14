import type { Market, StoreCurrency } from "@/lib/i18n/config";

export type CommerceEventName =
  | "page_view"
  | "view_item_list"
  | "select_item"
  | "view_item"
  | "add_to_cart"
  | "remove_from_cart"
  | "view_cart"
  | "begin_checkout"
  | "add_shipping_info"
  | "add_payment_info"
  | "purchase"
  | "checkout_error";

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  price?: number;
  quantity?: number;
};

export type CommerceEvent = {
  name: CommerceEventName;
  market: Market;
  currency?: StoreCurrency;
  value?: number;
  transactionId?: string;
  itemListId?: string;
  itemListName?: string;
  shippingTier?: string;
  paymentType?: string;
  errorCode?: string;
  items?: AnalyticsItem[];
  dedupeKey?: string;
};

export type CampaignAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  clickId?: string;
  capturedAt: string;
  expiresAt: string;
};
