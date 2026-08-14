import type { NextConfig } from "next";
import cjImageHosts from "./src/data/cj-image-hosts.json";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "form-action 'self' https://checkout.wompi.co",
  `img-src 'self' data: blob: https://www.facebook.com https://analytics.tiktok.com ${cjImageHosts.map((hostname) => `https://${hostname}`).join(" ")}`,
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://connect.facebook.net https://analytics.tiktok.com",
  "connect-src 'self' https://www.google-analytics.com https://analytics.google.com https://www.googleadservices.com https://www.facebook.com https://analytics.tiktok.com",
  "worker-src 'self' blob:",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    // Same allowlist used by catalog validation. No proxies or placeholders.
    remotePatterns: cjImageHosts.map((hostname) => ({ protocol: "https", hostname, pathname: "/**" })),
  },
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: contentSecurityPolicy },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      ],
    }];
  },
};

export default nextConfig;
