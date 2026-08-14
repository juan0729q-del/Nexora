"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cartPath, categoryPath, getDictionary, markets, type Market } from "@/lib/i18n/config";
import { useCart } from "./cart-context";
import { MarketSelector } from "./market-selector";

export function StoreHeader({ market = "co" }: { market?: Market }) {
  const [open, setOpen] = useState(false);
  const { itemCount, hydrated } = useCart();
  const dictionary = getDictionary(market);
  const links = [
    { href: categoryPath(market, "jewelry"), label: dictionary.jewelry },
    { href: categoryPath(market, "technologyHome"), label: dictionary.technology },
    { href: categoryPath(market, "wellbeing"), label: dictionary.wellbeing },
  ];
  const unitLabel = market === "co" ? (itemCount === 1 ? "unidad" : "unidades") : (itemCount === 1 ? "item" : "items");

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return <header className="sticky top-0 z-30 border-b border-silver/15 bg-onyx/90 px-3 backdrop-blur-xl sm:px-8 lg:px-12">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between">
      <Link href={markets[market].homePath} className="flex items-center gap-2 font-semibold tracking-[0.18em] text-white">
        <Image src="/brand/nexora-logo.png" width={32} height={32} alt="Nexora" className="rounded-md" />
        <span className="hidden sm:inline">NEXORA</span>
      </Link>
      <div className="flex min-w-0 items-center gap-1.5 sm:gap-3">
        <nav className="hidden gap-5 text-sm text-silver/80 lg:flex" aria-label={dictionary.navigation}>
          {links.map((link) => <a key={link.href} href={link.href} className="transition hover:text-white">{link.label}</a>)}
        </nav>
        <MarketSelector market={market} />
        <Link href={cartPath(market)} aria-label={hydrated ? `${dictionary.cart}: ${itemCount} ${unitLabel}` : dictionary.cart} className="rounded-full border border-emerald/40 px-2.5 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald hover:text-onyx sm:px-3">
          <span className="sr-only sm:not-sr-only">{dictionary.cart}</span> <span className="rounded-full bg-emerald px-1.5 py-0.5 text-[10px] text-onyx sm:ml-1">{hydrated ? itemCount : "…"}</span>
        </Link>
        <button type="button" className="rounded-lg border border-silver/30 p-2 text-sm lg:hidden" aria-label={open ? (market === "co" ? "Cerrar menú" : "Close menu") : (market === "co" ? "Abrir menú" : "Open menu")} aria-controls="mobile-navigation" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "×" : "☰"}</button>
      </div>
    </div>
    {open && <nav id="mobile-navigation" className="border-t border-silver/15 py-3 lg:hidden" aria-label={dictionary.mobileNavigation}>
      {links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="block py-2 text-sm text-silver/80">{link.label}</a>)}
    </nav>}
  </header>;
}
