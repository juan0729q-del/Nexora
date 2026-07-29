import Link from "next/link";

export function AdminNavigation({ current }: { current: "operations" | "sales" }) {
  const items = [
    { href: "/admin", label: "Operación", key: "operations" },
    { href: "/admin/ventas", label: "Ventas y postventa", key: "sales" },
  ] as const;

  return <nav className="flex flex-wrap gap-2" aria-label="Navegación de administración">
    {items.map((item) => <Link key={item.key} href={item.href} aria-current={item.key === current ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-medium transition ${item.key === current ? "bg-emerald text-onyx" : "border border-silver/20 text-silver/75 hover:border-silver/45 hover:text-white"}`}>
      {item.label}
    </Link>)}
  </nav>;
}
