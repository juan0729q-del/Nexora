"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackSimple } from "@/lib/intelligence/client";
import { marketFromPath } from "@/lib/analytics/client";
import { markets } from "@/lib/i18n/config";

export function IntelligenceTracker() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const market = marketFromPath(pathname);
    trackSimple("page_viewed", pathname, { market, locale: markets[market].locale, currency: markets[market].currency });
  }, [pathname]);
  return null;
}
