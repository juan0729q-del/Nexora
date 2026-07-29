import cjImageHostsDocument from "@/data/cj-image-hosts.json";

export const cjImageHosts = cjImageHostsDocument as readonly string[];
export const cjApiHost = "developers.cjdropshipping.com";

function parseHttpsUrl(value: unknown) {
  if (typeof value !== "string") return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
}

/** URLs visuales que CJ entrega directamente y que Next puede optimizar. */
export function isOfficialCjImageUrl(value: unknown): value is string {
  const url = parseHttpsUrl(value);
  return Boolean(url && cjImageHosts.includes(url.hostname));
}

/** Fichas y consultas de trazabilidad deben permanecer en el host oficial CJ. */
export function isOfficialCjApiUrl(value: unknown): value is string {
  const url = parseHttpsUrl(value);
  return Boolean(url && url.hostname === cjApiHost);
}
