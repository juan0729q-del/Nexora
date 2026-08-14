"use client";

import { useEffect } from "react";
import { trackCommerceEvent } from "@/lib/analytics/client";
import type { AnalyticsItem } from "@/lib/analytics/types";
import type { Market } from "@/lib/i18n/config";

export function CommerceViewTracker({ market, type, id, name, value, items }: { market: Market; type: "view_item" | "view_item_list"; id: string; name?: string; value?: number; items: AnalyticsItem[] }) {
  useEffect(() => {
    trackCommerceEvent({
      name: type,
      market,
      value,
      itemListId: type === "view_item_list" ? id : undefined,
      itemListName: type === "view_item_list" ? name : undefined,
      items,
      dedupeKey: `${type}:${market}:${id}`,
    });
  }, [id, items, market, name, type, value]);
  return null;
}
