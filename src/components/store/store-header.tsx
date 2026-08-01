"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "./cart-context";

export function StoreHeader() {
  const [open, setOpen] = useState(false);
  const { itemCount } = useCart();
  const links = [
    { href: "/#joyeria", label: "Joyería" },
    { href: "/#tecnologia-hogar", label: "Tecnología/Hogar" },
    { href: "/#bienestar", label: "Bienestar" },
  ];
  const unitLabel = itemCount === 1 ? "unidad" : "unidades";

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
        <Link href="/carrito" aria-label={`Carrito con ${itemCount} ${unitLabel}`} className="rounded-full border border-emerald/40 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald hover:text-onyx">
          Carrito <span className="ml-1 rounded-full bg-emerald px-1.5 py-0.5 text-[10px] text-onyx">{itemCount}</span>
        </Link>
        <button className="rounded-lg border border-silver/30 p-2 text-sm md:hidden" aria-label="Abrir menú" aria-expanded={open} onClick={() => setOpen(!open)}>☰</button>
      </div>
    </div>
    {open && <nav className="border-t border-silver/15 py-3 md:hidden" aria-label="Navegación móvil">
      {links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="block py-2 text-sm text-silver/80">{link.label}</a>)}
    </nav>}
  </header>;
}
