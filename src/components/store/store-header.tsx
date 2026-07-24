"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

export function StoreHeader() {
  const [open, setOpen] = useState(false);
  const links = [{ href: "#coleccion", label: "Colección" }, { href: "#proposito", label: "Propósito" }];
  return <header className="sticky top-0 z-30 border-b border-silver/15 bg-onyx/90 px-5 backdrop-blur-xl sm:px-8 lg:px-12"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between"><Link href="/" className="flex items-center gap-2 font-semibold tracking-[0.18em] text-white"><Image src="/brand/nexora-logo.png" width={32} height={32} alt="Nexora" className="rounded-md" /><span>NEXORA</span></Link><nav className="hidden gap-7 text-sm text-silver/80 md:flex" aria-label="Navegación principal">{links.map((link) => <a key={link.href} href={link.href} className="hover:text-white">{link.label}</a>)}<Link href="/admin/login" className="hover:text-white">Acceso</Link></nav><button className="rounded-lg border border-silver/30 p-2 text-sm md:hidden" aria-label="Abrir menú" aria-expanded={open} onClick={() => setOpen(!open)}>☰</button></div>{open && <nav className="border-t border-silver/15 py-3 md:hidden" aria-label="Navegación móvil">{links.map((link) => <a key={link.href} href={link.href} onClick={() => setOpen(false)} className="block py-2 text-sm text-silver/80">{link.label}</a>)}<Link href="/admin/login" className="block py-2 text-sm text-silver/80">Acceso</Link></nav>}</header>;
}
