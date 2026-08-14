import { markets, type Market } from "@/lib/i18n/config";
import type { CampaignAttribution, CommerceEvent } from "./types";
import { buildAdvertisingDispatches, type PublicAnalyticsConfig } from "./adapters";

const consentKey = "nexora-consent-v1";
const attributionKey = "nexora-attribution-v1";
const eventPrefix = "nexora-event-v1:";
const pendingPurchasePrefix = "nexora-pending-purchase-v1:";
const attributionLifetimeMs = 30 * 24 * 60 * 60 * 1000;

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: (...args: unknown[]) => void;
  ttq?: { track?: (name: string, payload?: Record<string, unknown>) => void; page?: () => void };
  __nexoraAnalyticsConfig?: PublicAnalyticsConfig;
};

function browserWindow() {
  return window as AnalyticsWindow;
}

function safeValue(value: string | null) {
  if (!value) return undefined;
  const clean = value.trim().replace(/[\r\n\t]/g, " ").slice(0, 120);
  return clean || undefined;
}

export function analyticsConsentGranted() {
  if (typeof window === "undefined") return false;
  try {
    const value = JSON.parse(localStorage.getItem(consentKey) || "null") as { choice?: string } | null;
    return value?.choice === "granted";
  } catch {
    return false;
  }
}

export function captureCampaignAttribution() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const source = safeValue(params.get("utm_source"));
  const medium = safeValue(params.get("utm_medium"));
  const campaign = safeValue(params.get("utm_campaign"));
  const term = safeValue(params.get("utm_term"));
  const content = safeValue(params.get("utm_content"));
  const clickId = safeValue(params.get("gclid") || params.get("fbclid") || params.get("ttclid"));
  if (!source && !medium && !campaign && !term && !content && !clickId) return;
  const now = Date.now();
  const attribution: CampaignAttribution = {
    source,
    medium,
    campaign,
    term,
    content,
    clickId,
    capturedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + attributionLifetimeMs).toISOString(),
  };
  localStorage.setItem(attributionKey, JSON.stringify(attribution));
}

export function readCampaignAttribution(): CampaignAttribution | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = JSON.parse(localStorage.getItem(attributionKey) || "null") as CampaignAttribution | null;
    if (!value || Date.parse(value.expiresAt) <= Date.now()) {
      localStorage.removeItem(attributionKey);
      return undefined;
    }
    return value;
  } catch {
    localStorage.removeItem(attributionKey);
    return undefined;
  }
}

function alreadySent(key: string) {
  try {
    if (key.startsWith("purchase:") && localStorage.getItem(`${eventPrefix}${key}`)) return true;
    if (sessionStorage.getItem(`${eventPrefix}${key}`)) return true;
    sessionStorage.setItem(`${eventPrefix}${key}`, new Date().toISOString());
    if (key.startsWith("purchase:")) localStorage.setItem(`${eventPrefix}${key}`, new Date().toISOString());
    return false;
  } catch {
    return false;
  }
}

function externalName(name: CommerceEvent["name"]) {
  if (name === "checkout_error") return "exception";
  return name;
}

/** Optional advertising analytics. Never pass names, emails, addresses, or payment data. */
export function trackCommerceEvent(event: CommerceEvent) {
  if (typeof window === "undefined" || !analyticsConsentGranted()) return;
  const dedupeKey = event.dedupeKey || `${event.name}:${location.pathname}:${event.transactionId || ""}:${event.itemListId || ""}`;
  if (event.dedupeKey && alreadySent(dedupeKey)) return;
  const attribution = readCampaignAttribution();
  const payload: Record<string, unknown> = {
    market: event.market,
    currency: event.currency || markets[event.market].currency,
    value: event.value,
    transaction_id: event.transactionId,
    item_list_id: event.itemListId,
    item_list_name: event.itemListName,
    shipping_tier: event.shippingTier,
    payment_type: event.paymentType,
    description: event.errorCode,
    items: event.items,
    campaign_source: attribution?.source,
    campaign_medium: attribution?.medium,
    campaign_name: attribution?.campaign,
    campaign_term: attribution?.term,
    campaign_content: attribution?.content,
  };
  Object.keys(payload).forEach((key) => payload[key] === undefined && delete payload[key]);
  const analytics = browserWindow();
  analytics.gtag?.("event", externalName(event.name), payload);
  for (const dispatch of buildAdvertisingDispatches(event, analytics.__nexoraAnalyticsConfig || {}, payload)) {
    if (dispatch.platform === "google-ads") analytics.gtag?.("event", dispatch.eventName, dispatch.payload);
    if (dispatch.platform === "meta") {
      const standard = dispatch.eventName !== event.name || ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "AddPaymentInfo", "Purchase"].includes(dispatch.eventName);
      analytics.fbq?.(standard ? "track" : "trackCustom", dispatch.eventName, dispatch.payload);
    }
    if (dispatch.platform === "tiktok") analytics.ttq?.track?.(dispatch.eventName, dispatch.payload);
  }
}

type PendingPurchase = Pick<CommerceEvent, "market" | "currency" | "value" | "paymentType" | "items"> & {
  reference: string;
  expiresAt: string;
};

export function storePendingPurchase(reference: string, event: Omit<PendingPurchase, "reference" | "expiresAt">) {
  if (typeof window === "undefined" || !/^NXR-CART-[A-Z0-9]{12,32}$/.test(reference)) return;
  const value: PendingPurchase = { ...event, reference, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() };
  try { sessionStorage.setItem(`${pendingPurchasePrefix}${reference}`, JSON.stringify(value)); } catch { /* functional checkout must not depend on analytics storage */ }
}

export function readPendingPurchase(reference: string): PendingPurchase | undefined {
  if (typeof window === "undefined") return undefined;
  const key = `${pendingPurchasePrefix}${reference}`;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null") as PendingPurchase | null;
    if (!value || value.reference !== reference || Date.parse(value.expiresAt) <= Date.now()) {
      sessionStorage.removeItem(key);
      return undefined;
    }
    return value;
  } catch {
    sessionStorage.removeItem(key);
    return undefined;
  }
}

export function clearPendingPurchase(reference: string) {
  if (typeof window === "undefined") return;
  try { sessionStorage.removeItem(`${pendingPurchasePrefix}${reference}`); } catch { /* no-op */ }
}

export function marketFromPath(pathname: string): Market {
  return pathname === "/us" || pathname.startsWith("/us/") ? "us" : "co";
}
