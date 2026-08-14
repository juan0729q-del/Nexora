import assert from "node:assert/strict";
import test from "node:test";
import { getPublicContact } from "../src/lib/public-contact";

test("los contactos públicos confirmados del propietario son los valores seguros predeterminados", () => {
  const keys = [
    "NEXT_PUBLIC_CONTACT_EMAIL",
    "NEXT_PUBLIC_CONTACT_WHATSAPP_URL",
    "NEXT_PUBLIC_CONTACT_WHATSAPP_LABEL",
    "NEXT_PUBLIC_FACEBOOK_URL",
    "NEXT_PUBLIC_INSTAGRAM_URL",
    "NEXT_PUBLIC_TIKTOK_URL",
  ] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  keys.forEach((key) => delete process.env[key]);
  try {
    assert.deepEqual(getPublicContact(), {
      email: "nexoraventas1@gmail.com",
      whatsappUrl: "https://wa.me/573024595220",
      whatsappLabel: "+57 302 459 5220",
      facebookUrl: "https://www.facebook.com/profile.php?id=61592349341501",
      instagramUrl: "https://www.instagram.com/nexoraventas1/",
      tiktokUrl: "https://www.tiktok.com/@nexora.diseo.con",
    });
  } finally {
    keys.forEach((key) => {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});
