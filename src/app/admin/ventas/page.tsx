import { redirect } from "next/navigation";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { isAdmin } from "@/lib/admin-auth";
import { formatCOP } from "@/lib/products";
import { getSalesDashboardSnapshot } from "@/lib/sales-dashboard";
import { logout } from "../actions";

function metric(value: number | null, formatter: (amount: number) => string) {
  return value === null ? "Pendiente" : formatter(value);
}

export default async function AdminSalesPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const dashboard = await getSalesDashboardSnapshot();
  const targetPercent = Math.round(dashboard.targetContributionMargin * 100);
  const standardFee = `${(dashboard.wompi.percentageRate * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}% + ${formatCOP(dashboard.wompi.fixedFeeCop)} + IVA`;
  const salesMetrics = [
    { label: "Pedidos aprobados", value: metric(dashboard.sales.approvedOrders, String), detail: "Se llena sólo con eventos Wompi confirmados." },
    { label: "Recaudo aprobado", value: metric(dashboard.sales.grossRevenueCop, formatCOP), detail: "No se muestra una venta inexistente." },
    { label: "Desembolso neto", value: metric(dashboard.sales.netPayoutCop, formatCOP), detail: "Requiere conciliación de Wompi." },
    { label: "Ticket promedio", value: metric(dashboard.sales.averageTicketCop, formatCOP), detail: "Disponible al registrar pedidos reales." },
  ];

  return <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-col justify-between gap-5 border-b border-silver/15 pb-6 xl:flex-row xl:items-center">
        <div>
          <p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">Nexora / Control comercial</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Ventas, rentabilidad y postventa</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-silver/65">Las cifras de venta se alimentarán únicamente con pagos confirmados por Wompi; esta vista nunca crea pedidos ni clientes de prueba.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <AdminNavigation current="sales" />
          <form action={logout}><button className="rounded-full border border-silver/25 px-4 py-2 text-sm text-silver/80 hover:border-silver">Cerrar sesión</button></form>
        </div>
      </header>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores de venta">
        {salesMetrics.map((item) => <article key={item.label} className="rounded-2xl border border-silver/15 bg-white/[.025] p-5">
          <p className="text-sm text-silver/65">{item.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{item.value}</p>
          <p className="mt-2 text-xs leading-5 text-silver/55">{item.detail}</p>
        </article>)}
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <article className="rounded-2xl border border-silver/15 bg-white/[.025] p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div><h2 className="font-semibold text-white">Margen de contribución del catálogo</h2><p className="mt-1 text-xs leading-5 text-silver/60">Escenario base: costo de CJ + comisión Wompi. No añade flete cotizado por destino, CAC, impuestos de venta ni devoluciones si no se configuró una reserva.</p></div>
            <span className="w-fit rounded-full bg-emerald/10 px-3 py-1 text-xs font-semibold text-emerald">Objetivo: {targetPercent}%</span>
          </div>
          <div className="mt-6 space-y-5">
            {dashboard.byNiche.map((niche) => {
              const width = Math.max(0, Math.min(100, niche.averageContributionMarginPercent));
              return <div key={niche.niche}>
                <div className="flex items-end justify-between gap-4 text-sm"><div><p className="font-medium text-white">{niche.label}</p><p className="mt-1 text-xs text-silver/55">{niche.productCount} productos CJ · contribución teórica total {formatCOP(niche.contributionCopAtListedPrice)}</p></div><p className="font-semibold text-emerald">{niche.averageContributionMarginPercent.toFixed(1)}%</p></div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${niche.averageContributionMarginPercent >= targetPercent ? "bg-emerald" : "bg-amber-300"}`} style={{ width: `${width}%` }} /></div>
              </div>;
            })}
          </div>
        </article>
        <aside className="rounded-2xl border border-silver/15 bg-white/[.025] p-5">
          <h2 className="font-semibold text-white">Tarifa Wompi aplicada</h2>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-emerald">{standardFee}</p>
          <p className="mt-3 text-xs leading-5 text-silver/60">La comisión se estima por transacción exitosa y su IVA se calcula sobre la comisión. Los medios con tarifa especial —si los activas— deben configurarse antes de evaluar su margen.</p>
          <a href="https://comercios.wompi.co/" target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-full border border-silver/25 px-4 py-2 text-sm font-semibold text-silver hover:border-emerald hover:text-emerald">Abrir reportes de Wompi ↗</a>
        </aside>
      </section>

      <section className="mt-8 rounded-2xl border border-silver/15 bg-white/[.025] p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="font-semibold text-white">Economía por producto</h2><p className="mt-1 text-xs leading-5 text-silver/60">Costo base oficial de CJ convertido a COP. “Revisar” significa que no alcanza el objetivo de contribución antes de flete y adquisición.</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${dashboard.priceReviewCount ? "bg-amber-300/10 text-amber-100" : "bg-emerald/10 text-emerald"}`}>{dashboard.priceReviewCount} por revisar</span></div>
        <div className="mt-5 overflow-x-auto"><table className="min-w-[950px] w-full text-left text-sm"><thead className="border-y border-silver/10 text-xs tracking-wide text-silver/55 uppercase"><tr><th className="px-3 py-3">Producto</th><th className="px-3 py-3">Precio</th><th className="px-3 py-3">Costo CJ</th><th className="px-3 py-3">Wompi est.</th><th className="px-3 py-3">Contribución</th><th className="px-3 py-3">Margen</th><th className="px-3 py-3">Piso sugerido</th><th className="px-3 py-3">Estado</th></tr></thead><tbody>{dashboard.unitEconomics.map((entry) => <tr key={entry.product.sku} className="border-b border-silver/10 align-top"><td className="px-3 py-4"><p className="max-w-[250px] font-medium text-white">{entry.product.name}</p><p className="mt-1 font-mono text-[11px] text-silver/45">{entry.product.sku}</p></td><td className="px-3 py-4 text-silver/80">{formatCOP(entry.product.price)}</td><td className="px-3 py-4 text-silver/80">{formatCOP(entry.supplierCostCop)}</td><td className="px-3 py-4 text-silver/80">{formatCOP(entry.wompiFeeCop)}</td><td className={`px-3 py-4 font-medium ${entry.contributionCop > 0 ? "text-emerald" : "text-red-300"}`}>{formatCOP(entry.contributionCop)}</td><td className={`px-3 py-4 font-medium ${entry.requiresPriceReview ? "text-amber-200" : "text-emerald"}`}>{entry.contributionMarginPercent.toFixed(1)}%</td><td className="px-3 py-4 text-silver/80">{formatCOP(entry.recommendedPriceCop)}</td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${entry.requiresPriceReview ? "bg-amber-300/10 text-amber-100" : "bg-emerald/10 text-emerald"}`}>{entry.requiresPriceReview ? "Revisar" : "Dentro del objetivo"}</span></td></tr>)}</tbody></table></div>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-sky-300/20 bg-sky-300/[.06] p-5"><h2 className="font-semibold text-sky-50">Pedidos y seguimiento</h2><p className="mt-2 text-sm leading-6 text-sky-50/75">No hay una bitácora transaccional persistida todavía. Por seguridad no se guardan nombres, correos, teléfonos ni direcciones de compradores en el repositorio público ni en el disco efímero de Vercel.</p><p className="mt-3 text-xs leading-5 text-sky-100/65">El checkout sí solicita la dirección directamente a Wompi. La confirmación de pago permanece condicionada al evento firmado de Wompi, no a la página de redirección.</p></article>
        <article className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-5"><h2 className="font-semibold text-amber-50">Siguiente requisito para automatizar postventa</h2><p className="mt-2 text-sm leading-6 text-amber-50/75">Hace falta un almacén privado y durable para órdenes, estados de CJ, guías y datos de envío. En cuanto se autorice, esta pestaña incorporará el embudo pago → pedido CJ → enviado → entregado, alertas SLA, reembolsos y conciliación.</p><p className="mt-3 text-xs leading-5 text-amber-100/65">No se sustituirá ese requisito con pedidos falsos ni con información privada versionada en Git.</p></article>
      </section>
    </div>
  </main>;
}
