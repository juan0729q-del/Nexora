"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const adminItems = [
  { href: "/admin", label: "Operación", key: "operations" },
  { href: "/admin/ventas", label: "Ventas y postventa", key: "sales" },
] as const;

export function AdminNavigation({ current }: { current: "operations" | "sales" }) {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    adminItems.forEach((item) => router.prefetch(item.href));
  }, [router]);

  return <nav className="flex flex-wrap gap-2" aria-label="Navegación de administración">
    {adminItems.map((item) => <Link key={item.key} href={item.href} prefetch onClick={() => setPendingHref(item.href)} aria-current={item.key === current ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium transition ${item.key === current ? "bg-emerald text-onyx" : "border border-silver/20 text-silver/75 hover:border-silver/45 hover:text-white"}`}>
      {pendingHref === item.href && item.key !== current ? "Abriendo…" : item.label}
    </Link>)}
  </nav>;
}
