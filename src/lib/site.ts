const fallbackSiteUrl = "https://nexora-amber-two.vercel.app";

/**
 * URL canónica única del storefront. Solo admite un origen HTTPS para evitar
 * que metadatos, pagos y sitemaps apunten a hosts distintos.
 */
export function getSiteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return fallbackSiteUrl;

  try {
    const url = new URL(configured);
    return url.protocol === "https:" ? url.origin : fallbackSiteUrl;
  } catch {
    return fallbackSiteUrl;
  }
}

export function siteUrlFor(path = "/") {
  return new URL(path, `${getSiteUrl()}/`).toString();
}

