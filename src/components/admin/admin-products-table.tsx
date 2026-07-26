import { formatCOP, getCatalogDecision, type Product } from "@/lib/products";

export function AdminProductsTable({ initialProducts }: { initialProducts: readonly Product[] }) {
  return <section className="overflow-hidden rounded-2xl border border-silver/15 bg-white/[.025]">
    <div className="flex items-center justify-between border-b border-silver/15 px-5 py-4">
      <div><h2 className="font-semibold text-white">Catálogo operativo</h2><p className="mt-1 text-xs text-silver/60">Solo registros CJ versionados con imagen nativa y referencia directa.</p></div>
      <span className="text-xs text-silver/60">{initialProducts.filter((item) => item.active).length} activos</span>
    </div>
    {!initialProducts.length ? <p className="p-5 text-sm leading-6 text-silver/65">No hay productos publicados. La importación se mantiene bloqueada hasta obtener datos reales y validados de CJ Dropshipping.</p> : <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-white/[.025] text-xs tracking-wide text-silver/55 uppercase"><tr><th className="px-5 py-3">Producto</th><th className="px-5 py-3">Proveedor y origen</th><th className="px-5 py-3">Precio</th><th className="px-5 py-3">Stock</th><th className="px-5 py-3">Estado</th></tr></thead>
        <tbody>{initialProducts.map((product) => {
          const decision = getCatalogDecision(product);
          return <tr key={product.slug} className="border-t border-silver/10">
            <td className="px-5 py-4"><p className="font-medium text-white">{product.name}</p><p className="mt-1 font-mono text-xs text-silver/45">{product.sku}</p></td>
            <td className="px-5 py-4"><p className="text-xs font-medium text-silver">{product.supplier.name}</p><a href={product.supplier.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-emerald hover:underline">{product.supplier.sourcePage} →</a><p className="mt-1 font-mono text-[10px] text-silver/45">{product.supplier.reference}</p></td>
            <td className="px-5 py-4 text-silver/75">{formatCOP(product.price)}</td>
            <td className={`px-5 py-4 ${product.stock < 5 ? "text-red-300" : "text-silver/75"}`}>{product.stock} u.</td>
            <td className="px-5 py-4"><p className={`text-xs font-medium ${decision === "pause" ? "text-red-300" : decision === "monitor" ? "text-amber-200" : "text-emerald"}`}>{decision === "pause" ? "Pausado" : decision === "monitor" ? "En monitoreo" : "Activo"}</p></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}
