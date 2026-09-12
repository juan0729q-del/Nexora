import hosts from "../../data/dropi-image-hosts.json";
import type { ProviderImage } from "../provider-product-details";

function officialUrl(value: unknown, allowed: readonly string[]) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && allowed.includes(url.hostname);
  } catch { return false; }
}

export const isOfficialDropiApiUrl = (value: unknown) => officialUrl(value, ["api.dropi.co", "test-api.dropi.co"]) && new URL(value as string).pathname.startsWith("/integrations/products/");
export function isValidDropiImage(value: unknown): value is ProviderImage {
  if (!value || typeof value !== "object") return false;
  const image = value as Partial<ProviderImage>;
  return image.source === "provider" && typeof image.alt === "string" && Boolean(image.alt.trim()) && officialUrl(image.src, hosts);
}
