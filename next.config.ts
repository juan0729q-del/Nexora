import type { NextConfig } from "next";
import cjImageHosts from "./src/data/cj-image-hosts.json";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    // Same allowlist used by catalog validation. No proxies or placeholders.
    remotePatterns: cjImageHosts.map((hostname) => ({ protocol: "https", hostname, pathname: "/**" })),
  },
};

export default nextConfig;
