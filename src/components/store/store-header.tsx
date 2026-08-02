"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "./cart-context";

export function StoreHeader() {
  const [open, setOpen] = useState(false);
  const { itemCount, hydrated } = useCart();
  const links = [
    { href: "/#joyeria", label: "Joyería" },
    { href: "/#tecnologia-hogar", label: "Tecnología/Hogar" },
    { href: "/#bienestar", label: "Bienestar" },
  ];
  const unitLabel = itemCount === 1 ? "unidad" : "unidades";

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return <header className="sticky top-0 z-30 border-b border-silver/15 bg-onyx/90 px-5 backdrop-blur-xl sm:px-8 lg:px-12">
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between">
      <Link href="/" className="flex items-center gap-2 font-semibold tracking-[0.18em] text-white">
        <Image src="/brand/nexora-logo.png" width={32} height={32} alt="Nexora" className="rounded-md" />
        <span>NEXORA</span>
      </Link>
      <div className="flex items-center gap-3">
        <nav className="hidden gap-6 text-sm text-silver/80 md:flex" aria-label="Navegación principal">
          {links.map((link) => <a key={link.href} href={link.href} className="transition hover:text-white">{link.label}</a>)}
        </nav>
        <Link href="/carrito" aria-label={hydrated ? `Carrito con ${itemCount} ${unitLabel}` : "Carrito, restaurando artículos"} className="rounded-full border border-emerald/40 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald hover:text-onyx">
          Carrito <span className="ml-1 rounded-full bg-emerald px-1.5 py-0.5 text-[10px] text-onyx">{hydrated ? itemCount : "…"}</span>
        </Link>
        <button type="button" className="rounded-lg border border-silver/30 p-2 text-sm md:hidden" aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-controls="mobile-navigation" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "×" : "☰"}</button>
      </div>
    </div>
    {open && <nav id="mobile-navigation" className="border-t border-silver/15 py-3 md:hidden" aria-label="Navegación móvil">
      {links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="block py-2 text-sm text-silver/80">{link.label}</a>)}
    </nav>}
  </header>;
}
