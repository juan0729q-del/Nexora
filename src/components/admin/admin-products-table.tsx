"use client";

import { useState } from "react";
import { formatCOP, getCatalogDecision, type Product } from "@/lib/products";

export function AdminProductsTable({ initialProducts }: { initialProducts: readonly Product[] }) {
  const [items, setItems] = useState([...initialProducts]);
  function toggle(slug: string) {
    setItems((current) => current.map((item) => item.slug === slug ? { ...item, active: !item.active } : item));
    // Hook de persistencia: POST /api/admin/products/[slug] con validación de sesión.
  }
  return <section className="overflow-hidden rounded-2xl border border-silver/15 bg-white/[.025]">
    <div className="flex items-center justify-between border-b border-silver/15 px-5 py-4"><div><h2 className="font-semibold text-white">Catálogo operativo</h2><p className="mt-1 text-xs text-silver/60">Proveedor, referencia y señal de rendimiento por artículo.</p></div><span className="text-xs text-silver/60">{items.filter((item) => item.active).length} activos</span></div>
    <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-white/[.025] text-xs tracking-wide text-silver/55 uppercase"><tr><th className="px-5 py-3">Producto</th><th className="px-5 py-3">Proveedor y origen</th><th className="px-5 py-3">Precio</th><th className="px-5 py-3">Stock</th><th className="px-5 py-3">IA / estado</th></tr></thead><tbody>{items.map((product) => {
      const decision = getCatalogDecision(product);
      return <tr key={product.slug} className="border-t border-silver/10"><td className="px-5 py-4"><p className="font-medium text-white">{product.name}</p><p className="mt-1 font-mono text-xs text-silver/45">{product.sku}</p></td><td className="px-5 py-4"><p className="text-xs font-medium text-silver">{product.supplier.name}</p><a href={product.supplier.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-emerald hover:underline">{product.supplier.sourcePage} ↗</a><p className="mt-1 font-mono text-[10px] text-silver/45">{product.supplier.reference}</p></td><td className="px-5 py-4 text-silver/75">{formatCOP(product.price)}</td><td className={`px-5 py-4 ${product.stock < 5 ? "text-red-300" : "text-silver/75"}`}>{product.stock} u.</td><td className="px-5 py-4"><p className={`mb-2 text-xs font-medium ${decision === "pause" ? "text-red-300" : decision === "monitor" ? "text-amber-200" : "text-emerald"}`}>{decision === "pause" ? "Retirar de portada" : decision === "monitor" ? "En monitoreo" : "Destacar"}</p><button onClick={() => toggle(product.slug)} aria-pressed={product.active} className={`rounded-full px-3 py-1.5 text-xs font-bold ${product.active ? "bg-emerald/15 text-emerald" : "bg-silver/10 text-silver/70"}`}>{product.active ? "Habilitado" : "Pausado"}</button></td></tr>;
    })}</tbody></table></div>
  </section>;
}
