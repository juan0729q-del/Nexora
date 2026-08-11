"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { trackSimple } from "@/lib/intelligence/client";

export function IntelligenceTracker() {
  const pathname = usePathname();
  useEffect(() => { if (!pathname.startsWith("/admin")) trackSimple("page_viewed", pathname); }, [pathname]);
  return null;
}
