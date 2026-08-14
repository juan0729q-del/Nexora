"use client";

import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { localizedPathForMarket, markets, type Market } from "@/lib/i18n/config";

export function MarketSelector({ market }: { market: Market }) {
  const pathname = usePathname();
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function changeMarket(next: Market) {
    if (next === market || pending) return;
    setStatus(null);
    startTransition(async () => {
      const response = await fetch("/api/preferences/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market: next }),
      });
      if (!response.ok) {
        setStatus(market === "co" ? "No pudimos guardar la preferencia." : "We could not save your preference.");
        return;
      }
      window.location.assign(localizedPathForMarket(pathname, next));
    });
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="market-selector">{market === "co" ? "País, idioma y moneda" : "Country, language, and currency"}</label>
      <select
        id="market-selector"
        value={market}
        disabled={pending}
        onChange={(event) => changeMarket(event.target.value as Market)}
        className="min-h-10 w-[122px] rounded-full border border-silver/25 bg-onyx px-2 text-[11px] font-semibold text-white focus:border-emerald focus:outline-none disabled:opacity-60 sm:w-auto sm:px-3 sm:text-xs"
      >
        <option value="co">CO · Español · COP</option>
        <option value="us">US · English · USD</option>
      </select>
      {status ? <p role="alert" className="absolute right-0 top-12 w-56 rounded-lg border border-red-300/30 bg-onyx p-2 text-xs text-red-200">{status}</p> : null}
      <span className="sr-only">{markets[market].label}</span>
    </div>
  );
}
