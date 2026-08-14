"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { captureCampaignAttribution, marketFromPath, trackCommerceEvent } from "@/lib/analytics/client";
import type { PublicAnalyticsConfig } from "@/lib/analytics/adapters";

const storageKey = "nexora-consent-v1";
const cookieName = "nexora_analytics_consent";
type Choice = "granted" | "denied";

type TikTokQueue = unknown[] & {
  load?: (id: string) => void;
  page?: () => void;
  track?: (name: string, data?: Record<string, unknown>) => void;
  _i?: Record<string, unknown>;
};

type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: ((...args: unknown[]) => void) & { queue: unknown[]; loaded?: boolean; version?: string };
  _fbq?: unknown;
  ttq?: TikTokQueue;
  __nexoraAnalyticsConfig?: PublicAnalyticsConfig;
};

function appendScript(src: string, id: string) {
  if (document.getElementById(id)) return;
  const script = document.createElement("script");
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function initialize(config: PublicAnalyticsConfig) {
  const analytics = window as AnalyticsWindow;
  analytics.__nexoraAnalyticsConfig = config;
  analytics.dataLayer ||= [];
  analytics.gtag ||= (...args: unknown[]) => { analytics.dataLayer?.push(args); };
  analytics.gtag("consent", "update", { analytics_storage: "granted", ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" });
  const googleTagId = config.ga4 || config.googleAds;
  if (googleTagId) {
    appendScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleTagId)}`, "nexora-google-tag");
    analytics.gtag("js", new Date());
  }
  if (config.ga4) {
    analytics.gtag("config", config.ga4, { send_page_view: false });
  }
  if (config.googleAds) analytics.gtag("config", config.googleAds, { send_page_view: false });
  if (config.metaPixel && !analytics.fbq) {
    const queue: unknown[] = [];
    const fbq = Object.assign((...args: unknown[]) => { queue.push(args); }, { queue, loaded: true, version: "2.0" });
    analytics.fbq = fbq;
    appendScript("https://connect.facebook.net/en_US/fbevents.js", "nexora-meta-pixel");
    analytics.fbq?.("init", config.metaPixel);
    analytics.fbq?.("consent", "grant");
  }
  if (config.tiktokPixel) {
    if (!analytics.ttq) {
      const queue = [] as unknown as TikTokQueue;
      queue.track = (...args: unknown[]) => { queue.push(["track", ...args]); };
      queue.page = () => { queue.push(["page"]); };
      queue.load = (id: string) => appendScript(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=ttq`, "nexora-tiktok-pixel");
      analytics.ttq = queue;
    }
    analytics.ttq.load?.(config.tiktokPixel);
  }
}

function revoke() {
  const analytics = window as AnalyticsWindow;
  analytics.gtag?.("consent", "update", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  analytics.fbq?.("consent", "revoke");
}

export function AnalyticsConsent({ config }: { config: PublicAnalyticsConfig }) {
  const pathname = usePathname();
  const market = marketFromPath(pathname);
  const english = market === "us";
  const [choice, setChoice] = useState<Choice | null>(null);
  const configured = Boolean(config.ga4 || config.googleAds || config.metaPixel || config.tiktokPixel);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "null") as { choice?: Choice } | null;
      if (saved?.choice === "granted" || saved?.choice === "denied") queueMicrotask(() => setChoice(saved.choice!));
      if (saved?.choice === "granted") {
        captureCampaignAttribution();
        if (configured) initialize(config);
      }
    } catch { localStorage.removeItem(storageKey); }
  }, [config, configured]);

  useEffect(() => {
    if (choice !== "granted") return;
    trackCommerceEvent({ name: "page_view", market });
  }, [choice, market, pathname]);

  useEffect(() => {
    const open = () => setChoice(null);
    window.addEventListener("nexora:privacy-settings", open);
    return () => window.removeEventListener("nexora:privacy-settings", open);
  }, []);

  function save(next: Choice) {
    const value = { choice: next, version: 1, updatedAt: new Date().toISOString() };
    localStorage.setItem(storageKey, JSON.stringify(value));
    document.cookie = `${cookieName}=${next}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    setChoice(next);
    if (next === "granted") {
      captureCampaignAttribution();
      if (configured) initialize(config);
    }
    else revoke();
  }

  if (choice) return null;
  return <aside className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-3xl rounded-2xl border border-silver/25 bg-[#121212]/[.98] p-4 shadow-2xl shadow-black/70 sm:p-5" role="dialog" aria-modal="false" aria-labelledby="analytics-consent-title">
    <h2 id="analytics-consent-title" className="font-semibold text-white">{english ? "Your privacy choices" : "Tus preferencias de privacidad"}</h2>
    <p className="mt-2 text-xs leading-5 text-silver/70">{english ? "Functional storage keeps your market and cart. Optional analytics and advertising pixels load only if you accept; events never contain contact, address, card, or credential data." : "El almacenamiento funcional conserva tu mercado y carrito. La analítica y los píxeles publicitarios opcionales sólo se cargan si aceptas; los eventos nunca incluyen contacto, dirección, tarjeta ni credenciales."}</p>
    {!configured && <p className="mt-2 text-xs text-amber-100">{english ? "No external analytics platform is configured at this time." : "Actualmente no hay ninguna plataforma de analítica externa configurada."}</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="button" onClick={() => save("granted")} className="rounded-full bg-emerald px-4 py-2 text-xs font-bold text-onyx">{english ? "Accept optional analytics" : "Aceptar analítica opcional"}</button>
      <button type="button" onClick={() => save("denied")} className="rounded-full border border-silver/30 px-4 py-2 text-xs font-semibold text-white">{english ? "Use necessary only" : "Usar sólo lo necesario"}</button>
    </div>
  </aside>;
}

export function PrivacySettingsButton({ label }: { label: string }) {
  return <button type="button" onClick={() => window.dispatchEvent(new Event("nexora:privacy-settings"))} className="font-medium text-silver/80 transition hover:text-white">{label}</button>;
}
