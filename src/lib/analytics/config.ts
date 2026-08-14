const patterns = {
  ga4: /^G-[A-Z0-9]{6,20}$/,
  googleAds: /^AW-[0-9]{6,20}$/,
  metaPixel: /^[0-9]{6,30}$/,
  tiktokPixel: /^[A-Z0-9]{8,30}$/,
  googleAdsLabel: /^[A-Za-z0-9_-]{6,100}$/,
} as const;

function optionalPublicId(name: string, pattern: RegExp) {
  const value = process.env[name]?.trim();
  return value && pattern.test(value) ? value : undefined;
}

export function getPublicAnalyticsConfig() {
  return {
    ga4: optionalPublicId("NEXT_PUBLIC_GA4_MEASUREMENT_ID", patterns.ga4),
    googleAds: optionalPublicId("NEXT_PUBLIC_GOOGLE_ADS_ID", patterns.googleAds),
    googleAdsPurchaseLabel: optionalPublicId("NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL", patterns.googleAdsLabel),
    metaPixel: optionalPublicId("NEXT_PUBLIC_META_PIXEL_ID", patterns.metaPixel),
    tiktokPixel: optionalPublicId("NEXT_PUBLIC_TIKTOK_PIXEL_ID", patterns.tiktokPixel),
  };
}
