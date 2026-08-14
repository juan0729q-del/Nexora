const defaults = {
  email: "nexoraventas1@gmail.com",
  whatsappUrl: "https://wa.me/573024595220",
  whatsappLabel: "+57 302 459 5220",
  facebookUrl: "https://www.facebook.com/profile.php?id=61592349341501",
  instagramUrl: "https://www.instagram.com/nexoraventas1/",
  tiktokUrl: "https://www.tiktok.com/@nexora.diseo.con",
} as const;

function publicEmail(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    ? normalized
    : defaults.email;
}

function publicUrl(value: string | undefined, fallback: string, allowedHosts: string[]) {
  try {
    const url = new URL(value?.trim() || fallback);
    if (url.protocol !== "https:" || !allowedHosts.includes(url.hostname.toLowerCase())) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

/** Public, owner-approved contact channels. No legal identity is inferred here. */
export function getPublicContact() {
  return {
    email: publicEmail(process.env.NEXT_PUBLIC_CONTACT_EMAIL),
    whatsappUrl: publicUrl(process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_URL, defaults.whatsappUrl, ["wa.me", "api.whatsapp.com"]),
    whatsappLabel: process.env.NEXT_PUBLIC_CONTACT_WHATSAPP_LABEL?.trim().slice(0, 40) || defaults.whatsappLabel,
    facebookUrl: publicUrl(process.env.NEXT_PUBLIC_FACEBOOK_URL, defaults.facebookUrl, ["facebook.com", "www.facebook.com"]),
    instagramUrl: publicUrl(process.env.NEXT_PUBLIC_INSTAGRAM_URL, defaults.instagramUrl, ["instagram.com", "www.instagram.com"]),
    tiktokUrl: publicUrl(process.env.NEXT_PUBLIC_TIKTOK_URL, defaults.tiktokUrl, ["tiktok.com", "www.tiktok.com"]),
  };
}
