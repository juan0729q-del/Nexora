import { redirect } from "next/navigation";
import { AdminProductsTable } from "@/components/admin/admin-products-table";
import { AdminCatalogRefresh } from "@/components/admin/admin-catalog-refresh";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { isAdmin } from "@/lib/admin-auth";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { formatCOP } from "@/lib/products";
import { logout } from "./actions";

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const dashboard = await getDashboardSnapshot();
  const severity = {
    critical: "border-red-400/30 bg-red-400/10 text-red-100",
    warning: "border-amber-300/25 bg-amber-300/10 text-amber-50",
    info: "border-sky-300/20 bg-sky-300/10 text-sky-50",
  };
  const metrics = [
    { label: "Ventas del periodo", value: dashboard.revenue === null ? "Sin datos" : formatCOP(dashboard.revenue), note: "Se habilita con eventos de pago persistidos." },
    { label: "Conversión", value: dashboard.conversion === null ? "Sin datos" : `${dashboard.conversion}%`, note: "Se habilita con visitas y pagos verificados." },
    { label: "Inventario total", value: String(dashboard.inventory), note: `${dashboard.products.length} productos CJ verificados.` },
  ];

  return <main id="page-content" tabIndex={-1} className="min-h-screen px-5 py-6 outline-none sm:px-8 lg:px-12">
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-col justify-between gap-5 border-b border-silver/15 pb-6 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">Nexora / Command center</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Operación y señales de negocio</h1>
          <p className="mt-2 text-xs text-silver/60">Importación: {dashboard.catalogMetadata.importedAt || "pendiente de una respuesta CJ verificada"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <AdminNavigation current="operations" />
          <AdminCatalogRefresh version={dashboard.catalogMetadata.version} importedAt={dashboard.catalogMetadata.importedAt} />
          <form action={logout}><button className="rounded-full border border-silver/25 px-4 py-2 text-sm text-silver/80 hover:border-silver">Cerrar sesión</button></form>
        </div>
      </header>
      <section className="mt-8 grid gap-4 md:grid-cols-3" aria-label="Indicadores clave">
        {metrics.map((metric) => <article key={metric.label} className="rounded-2xl border border-silver/15 bg-white/[.025] p-5">
          <p className="text-sm text-silver/65">{metric.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{metric.value}</p>
          <p className="mt-2 text-xs text-emerald">{metric.note}</p>
        </article>)}
      </section>
      <section className="mt-8 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <AdminProductsTable initialProducts={dashboard.products} />
        <aside className="rounded-2xl border border-silver/15 bg-white/[.025] p-5">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-white">Alertas prioritarias</h2><span className="rounded-full bg-red-400/15 px-2 py-1 text-xs font-bold text-red-200">{dashboard.alerts.filter((alert) => alert.severity === "critical").length} críticas</span></div>
          <ul className="mt-5 space-y-3">{dashboard.alerts.map((alert) => <li key={alert.id} className={`rounded-xl border p-3 ${severity[alert.severity]}`}><p className="text-sm font-semibold">{alert.title}</p><p className="mt-1 text-xs leading-5 opacity-80">{alert.detail}</p></li>)}</ul>
        </aside>
      </section>
    </div>
  </main>;
}
