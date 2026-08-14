import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/carrito", "/checkout/", "/co/carrito", "/co/checkout/", "/us/cart", "/us/checkout/"] },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
