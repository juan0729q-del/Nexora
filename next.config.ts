import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    // Solo hosts de imagen oficiales observados en Product List v2 y Product
    // Details de CJ. No se permiten proxies, placeholders ni CDNs genéricos.
    remotePatterns: [
      { protocol: "https", hostname: "cf.cjdropshipping.com", pathname: "/**" },
      { protocol: "https", hostname: "oss-cf.cjdropshipping.com", pathname: "/**" },
      { protocol: "https", hostname: "cc-west-usa.oss-us-west-1.aliyuncs.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
