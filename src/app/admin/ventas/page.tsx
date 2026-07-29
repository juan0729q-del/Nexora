import { redirect } from "next/navigation";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { SalesOrderTable } from "@/components/admin/sales-order-table";
import { isAdmin } from "@/lib/admin-auth";
import { formatCOP } from "@/lib/products";
import { getSalesDashboardSnapshot } from "@/lib/sales-dashboard";
import { logout } from "../actions";

function metric(value: number | null, formatter: (amount: number) => string) {
  return value === null ? "Pendiente" : formatter(value);
}

function formatDay(day: string) {
  const parsed = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? day : parsed.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

export default async function AdminSalesPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const dashboard = await getSalesDashboardSnapshot();
  const targetPercent = Math.round(dashboard.targetContributionMargin * 100);
  const standardFee = `${(dashboard.wompi.percentageRate * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}% + ${formatCOP(dashboard.wompi.fixedFeeCop)} + IVA`;
  const salesMetrics = [
    { label: "Pedidos aprobados", value: metric(dashboard.sales.approvedOrders, String), detail: "Sólo pagos Wompi validados y registrados." },
    { label: "Recaudo aprobado", value: metric(dashboard.sales.grossRevenueCop, formatCOP), detail: "Producto + envío cobrados al cliente." },
    { label: "Envío cobrado", value: metric(dashboard.sales.shippingRevenueCop, formatCOP), detail: "Flete CJ seleccionado y cobrado antes del pago." },
    { label: "Costo de envío CJ", value: metric(dashboard.sales.supplierShippingCostCop, formatCOP), detail: "Costo cotizado por CJ para los pedidos aprobados." },
    { label: "Diferencia de flete", value: metric(dashboard.sales.shippingMarginCop, formatCOP), detail: "Envío cobrado menos costo CJ; no es margen de producto." },
    { label: "Desembolso estimado", value: metric(dashboard.sales.netPayoutCop, formatCOP), detail: "Recaudo menos comisión estimada de Wompi." },
    { label: "Contribución estimada", value: metric(dashboard.sales.contributionCop, formatCOP), detail: "Después de costo CJ, envío y tarifa Wompi." },
    { label: "Ticket promedio", value: metric(dashboard.sales.averageTicketCop, formatCOP), detail: "Promedio de pagos aprobados, incluido envío." },
  ];
  const pipeline = [
    { label: "Pendientes de pago", value: dashboard.sales.pendingOrders, tone: "text-amber-100" },
    { label: "Pendientes de despacho", value: dashboard.sales.fulfillmentPending, tone: "text-sky-100" },
    { label: "En tránsito", value: dashboard.sales.fulfillmentInTransit, tone: "text-emerald" },
    { label: "Pagos no completados", value: dashboard.sales.declinedOrders, tone: "text-red-200" },
  ];
  const greatestDailyRevenue = Math.max(1, ...dashboard.dailySales.map((entry) => entry.grossRevenueCop));

  return <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12">
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-col justify-between gap-5 border-b border-silver/15 pb-6 xl:flex-row xl:items-center">
        <div>
          <p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">Nexora / Control comercial</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Ventas, rentabilidad y postventa</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-silver/65">Esta vista relaciona cada pago Wompi con su producto, cotización real de envío CJ, correo de entrega y seguimiento operativo. No crea ventas ni fletes de prueba.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <AdminNavigation current="sales" />
          <form action={logout}><button className="rounded-full border border-silver/25 px-4 py-2 text-sm text-silver/80 hover:border-silver">Cerrar sesión</button></form>
        </div>
      </header>

      <section className={`mt-6 rounded-2xl border p-4 ${dashboard.ledger.connected ? "border-emerald/30 bg-emerald/[.07]" : dashboard.ledger.configured ? "border-amber-300/30 bg-amber-300/[.07]" : "border-red-300/25 bg-red-300/[.07]"}`} aria-label="Estado del registro privado">
        <p className="text-sm font-semibold text-white">Registro de ventas, envío y postventa</p>
        <p className="mt-1 text-xs leading-5 text-silver/70">{dashboard.ledger.detail}</p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores de venta y envío">
        {salesMetrics.map((item) => <article key={item.label} className="rounded-2xl border border-silver/15 bg-white/[.025] p-5">
          <p className="text-sm text-silver/65">{item.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{item.value}</p>
          <p className="mt-2 text-xs leading-5 text-silver/55">{item.detail}</p>
        </article>)}
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Embudo de postventa">
        {pipeline.map((item) => <article key={item.label} className="rounded-xl border border-silver/15 bg-white/[.018] px-4 py-4"><p className="text-xs text-silver/60">{item.label}</p><p className={`mt-2 text-2xl font-semibold ${item.tone}`}>{metric(item.value, String)}</p></article>)}
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <article className="rounded-2xl border border-silver/15 bg-white/[.025] p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="font-semibold text-white">Ingresos aprobados por día</h2><p className="mt-1 text-xs leading-5 text-silver/60">Suma sólo cobros con estado APPROVED enviados por Wompi; incluye el envío que el cliente eligió.</p></div><span className="w-fit rounded-full bg-emerald/10 px-3 py-1 text-xs font-semibold text-emerald">Tasa de aprobación: {metric(dashboard.sales.approvalRatePercent, (value) => `${value.toFixed(1)}%`)}</span></div>
          {!dashboard.dailySales.length ? <p className="mt-8 text-sm leading-6 text-silver/60">La gráfica aparecerá con la primera venta aprobada real.</p> : <ol className="mt-8 grid grid-cols-7 items-end gap-2" aria-label="Gráfica de ingresos diarios">{dashboard.dailySales.map((item) => <li key={item.date} className="grid min-w-0 gap-2 text-center"><div className="flex h-40 items-end rounded-t-lg bg-white/[.04] px-1"><div className="w-full rounded-t-md bg-emerald transition" style={{ height: `${Math.max(4, (item.grossRevenueCop / greatestDailyRevenue) * 100)}%` }} title={`${formatCOP(item.grossRevenueCop)} · ${item.approvedOrders} pedidos`} /></div><span className="truncate text-[10px] text-silver/60">{formatDay(item.date)}</span></li>)}</ol>}
        </article>
        <aside className="rounded-2xl border border-silver/15 bg-white/[.025] p-5"><h2 className="font-semibold text-white">Tarifa Wompi aplicada</h2><p className="mt-3 text-3xl font-semibold tracking-tight text-emerald">{standardFee}</p><p className="mt-3 text-xs leading-5 text-silver/60">La comisión se estima por transacción exitosa y el IVA se calcula sobre ella. Ajusta estas variables sólo cuando Wompi confirme una tarifa distinta para el comercio.</p><a href="https://comercios.wompi.co/" target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-full border border-silver/25 px-4 py-2 text-sm font-semibold text-silver hover:border-emerald hover:text-emerald">Abrir reportes de Wompi ↗</a></aside>
      </section>

      <SalesOrderTable orders={dashboard.recentOrders} enabled={dashboard.ledger.connected} />

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <article className="rounded-2xl border border-silver/15 bg-white/[.025] p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="font-semibold text-white">Margen de contribución del catálogo</h2><p className="mt-1 text-xs leading-5 text-silver/60">Escenario previo al checkout: costo base CJ + comisión Wompi. En un pedido real, el flete seleccionado se registra aparte y se incorpora a la contribución.</p></div><span className="w-fit rounded-full bg-emerald/10 px-3 py-1 text-xs font-semibold text-emerald">Objetivo: {targetPercent}%</span></div>
          <div className="mt-6 space-y-5">{dashboard.byNiche.map((niche) => { const width = Math.max(0, Math.min(100, niche.averageContributionMarginPercent)); return <div key={niche.niche}><div className="flex items-end justify-between gap-4 text-sm"><div><p className="font-medium text-white">{niche.label}</p><p className="mt-1 text-xs text-silver/55">{niche.productCount} productos CJ · contribución teórica total {formatCOP(niche.contributionCopAtListedPrice)}</p></div><p className="font-semibold text-emerald">{niche.averageContributionMarginPercent.toFixed(1)}%</p></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${niche.averageContributionMarginPercent >= targetPercent ? "bg-emerald" : "bg-amber-300"}`} style={{ width: `${width}%` }} /></div></div>; })}</div>
        </article>
        <aside className="rounded-2xl border border-silver/15 bg-white/[.025] p-5"><h2 className="font-semibold text-white">Lectura operativa</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-silver/70"><li>• Cada checkout guarda el método CJ, costo, plazo indicado y total antes de enviar al pago.</li><li>• Si Wompi reporta un monto diferente al total registrado, el pedido queda en revisión y no habilita postventa.</li><li>• Nexora procesa tarjetas sólo en Wompi; el panel no almacena datos de tarjeta.</li></ul></aside>
      </section>

      <section className="mt-8 rounded-2xl border border-silver/15 bg-white/[.025] p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="font-semibold text-white">Economía por producto</h2><p className="mt-1 text-xs leading-5 text-silver/60">Costo base oficial de CJ convertido a COP. “Revisar” significa que no alcanza el objetivo de contribución antes de flete por destino y adquisición.</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${dashboard.priceReviewCount ? "bg-amber-300/10 text-amber-100" : "bg-emerald/10 text-emerald"}`}>{dashboard.priceReviewCount} por revisar</span></div>
        <div className="mt-5 overflow-x-auto"><table className="min-w-[950px] w-full text-left text-sm"><thead className="border-y border-silver/10 text-xs tracking-wide text-silver/55 uppercase"><tr><th className="px-3 py-3">Producto</th><th className="px-3 py-3">Precio</th><th className="px-3 py-3">Costo CJ</th><th className="px-3 py-3">Wompi est.</th><th className="px-3 py-3">Contribución</th><th className="px-3 py-3">Margen</th><th className="px-3 py-3">Piso sugerido</th><th className="px-3 py-3">Estado</th></tr></thead><tbody>{dashboard.unitEconomics.map((entry) => <tr key={entry.product.sku} className="border-b border-silver/10 align-top"><td className="px-3 py-4"><p className="max-w-[250px] font-medium text-white">{entry.product.name}</p><p className="mt-1 font-mono text-[11px] text-silver/45">{entry.product.sku}</p></td><td className="px-3 py-4 text-silver/80">{formatCOP(entry.product.price)}</td><td className="px-3 py-4 text-silver/80">{formatCOP(entry.supplierCostCop)}</td><td className="px-3 py-4 text-silver/80">{formatCOP(entry.wompiFeeCop)}</td><td className={`px-3 py-4 font-medium ${entry.contributionCop > 0 ? "text-emerald" : "text-red-300"}`}>{formatCOP(entry.contributionCop)}</td><td className={`px-3 py-4 font-medium ${entry.requiresPriceReview ? "text-amber-200" : "text-emerald"}`}>{entry.contributionMarginPercent.toFixed(1)}%</td><td className="px-3 py-4 text-silver/80">{formatCOP(entry.recommendedPriceCop)}</td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${entry.requiresPriceReview ? "bg-amber-300/10 text-amber-100" : "bg-emerald/10 text-emerald"}`}>{entry.requiresPriceReview ? "Revisar" : "Dentro del objetivo"}</span></td></tr>)}</tbody></table></div>
      </section>
    </div>
  </main>;
}
