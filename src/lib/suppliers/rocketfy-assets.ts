const imageHosts = new Set(["fs.rocketfy.co", "cdn.rocketfy.co"]);
const productHosts = new Set(["app.rocketfy.com", "rocketfy.com", "www.rocketfy.com"]);

function officialHttpsUrl(value: unknown, hosts: Set<string>) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && hosts.has(url.hostname.toLowerCase()) && !url.username && !url.password;
  } catch { return false; }
}

export const isOfficialRocketfyProductUrl = (value: unknown) => officialHttpsUrl(value, productHosts);

export function isValidRocketfyImage(value: unknown): value is { src: string; alt: string; source: "provider" } {
  if (!value || typeof value !== "object") return false;
  const image = value as { src?: unknown; alt?: unknown; source?: unknown };
  return image.source === "provider" && typeof image.alt === "string" && image.alt.trim().length > 0 && officialHttpsUrl(image.src, imageHosts);
}
