import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { SalesOrderTable } from "@/components/admin/sales-order-table";
import { isAdmin } from "@/lib/admin-auth";
import { formatCOP } from "@/lib/products";
import { getSalesDashboardSnapshot } from "@/lib/sales-dashboard";
import { logout } from "../actions";

function metric(value: number | null, formatter: (amount: number) => string, hasActivity = true) {
  return value === null || !hasActivity ? "Sin datos" : formatter(value);
}

function formatDay(day: string) {
  const parsed = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? day : parsed.toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

function formatUSD(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default async function AdminSalesPage() {
  if (!(await isAdmin())) redirect("/admin/login");

  return <main id="page-content" tabIndex={-1} className="min-h-screen px-5 py-6 outline-none sm:px-8 lg:px-12">
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-col justify-between gap-5 border-b border-silver/15 pb-6 xl:flex-row xl:items-center">
        <div>
          <p className="text-xs font-bold tracking-[.16em] text-emerald uppercase">Nexora / Control comercial</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Ventas, rentabilidad y postventa</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-silver/65">Esta vista relaciona pagos conciliados de Wompi y PayPal con su producto, cotización real de envío CJ, correo de entrega y seguimiento operativo. No crea ventas ni fletes de prueba.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <AdminNavigation current="sales" />
          <form action={logout}><button className="rounded-full border border-silver/25 px-4 py-2 text-sm text-silver/80 hover:border-silver">Cerrar sesión</button></form>
        </div>
      </header>
      <Suspense fallback={<SalesDashboardSkeleton />}>
        <SalesDashboardContent />
      </Suspense>
    </div>
  </main>;
}

function SalesDashboardSkeleton() {
  return <div className="mt-6 space-y-5" role="status" aria-label="Cargando ventas y postventa">
    <div className="h-20 animate-pulse rounded-2xl border border-silver/15 bg-white/[.025]" />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl border border-silver/15 bg-white/[.025]" />)}</div>
    <p className="text-sm text-silver/65">Abriendo el panel y consultando el registro privado de ventas…</p>
  </div>;
}

async function SalesDashboardContent() {
  const dashboard = await getSalesDashboardSnapshot();
  const hasOrderActivity = dashboard.recentOrders.length > 0
    || (dashboard.sales.approvedOrders ?? 0) > 0
    || (dashboard.sales.pendingOrders ?? 0) > 0
    || (dashboard.sales.declinedOrders ?? 0) > 0;
  const hasApprovedSales = (dashboard.sales.approvedOrders ?? 0) > 0;
  const hasApprovedCopSales = (dashboard.sales.approvedOrdersCop ?? 0) > 0;
  const hasApprovedUsdSales = (dashboard.sales.approvedOrdersUsd ?? 0) > 0;
  const targetPercent = Math.round(dashboard.targetContributionMargin * 100);
  const standardFee = `${(dashboard.wompi.percentageRate * 100).toLocaleString("es-CO", { maximumFractionDigits: 2 })}% + ${formatCOP(dashboard.wompi.fixedFeeCop)} + IVA`;
  const salesMetrics = [
    { label: "Pedidos aprobados", value: metric(dashboard.sales.approvedOrders, String, hasOrderActivity), detail: "Total conciliado entre ambos mercados." },
    { label: "Pedidos Colombia", value: metric(dashboard.sales.approvedOrdersCop, String, hasOrderActivity), detail: "Pagos COP conciliados con Wompi." },
    { label: "Recaudo Colombia", value: metric(dashboard.sales.grossRevenueCop, formatCOP, hasApprovedCopSales), detail: "Producto + envío cobrados en COP." },
    { label: "Envío cobrado Colombia", value: metric(dashboard.sales.shippingRevenueCop, formatCOP, hasApprovedCopSales), detail: "Flete CJ cobrado en COP." },
    { label: "Costo envío CJ Colombia", value: metric(dashboard.sales.supplierShippingCostCop, formatCOP, hasApprovedCopSales), detail: "Costo real de las cotizaciones aprobadas en COP." },
    { label: "Contribución Colombia", value: metric(dashboard.sales.contributionCop, formatCOP, hasApprovedCopSales), detail: "Después de costo CJ, envío y tarifa Wompi." },
    { label: "Ticket promedio Colombia", value: metric(dashboard.sales.averageTicketCop, formatCOP, hasApprovedCopSales), detail: "Promedio conciliado en COP, incluido envío." },
    { label: "Pedidos EE. UU.", value: metric(dashboard.sales.approvedOrdersUsd, String, hasOrderActivity), detail: "Pagos USD conciliados con PayPal." },
    { label: "Recaudo EE. UU.", value: metric(dashboard.sales.grossRevenueUsd, formatUSD, hasApprovedUsdSales), detail: "Producto + envío cobrados en USD." },
    { label: "Envío cobrado EE. UU.", value: metric(dashboard.sales.shippingRevenueUsd, formatUSD, hasApprovedUsdSales), detail: "Flete CJ seleccionado y cobrado en USD." },
    { label: "Costo envío CJ EE. UU.", value: metric(dashboard.sales.supplierShippingCostUsd, formatUSD, hasApprovedUsdSales), detail: "Costo real de las cotizaciones aprobadas en USD." },
    { label: "Ticket promedio EE. UU.", value: metric(dashboard.sales.averageTicketUsd, formatUSD, hasApprovedUsdSales), detail: "Promedio conciliado en USD, incluido envío." },
  ];
  const pipeline = [
    { label: "Pendientes de pago", value: dashboard.sales.pendingOrders, tone: "text-amber-100" },
    { label: "Pendientes de despacho", value: dashboard.sales.fulfillmentPending, tone: "text-sky-100" },
    { label: "En tránsito", value: dashboard.sales.fulfillmentInTransit, tone: "text-emerald" },
    { label: "Pagos no completados", value: dashboard.sales.declinedOrders, tone: "text-red-200" },
  ];
  const greatestDailyRevenue = Math.max(1, ...dashboard.dailySales.map((entry) => entry.grossRevenueCop));

  return <>
      <section className={`mt-6 rounded-2xl border p-4 ${dashboard.ledger.connected ? "border-emerald/30 bg-emerald/[.07]" : dashboard.ledger.configured ? "border-amber-300/30 bg-amber-300/[.07]" : "border-red-300/25 bg-red-300/[.07]"}`} aria-label="Estado del registro privado">
        <p className="text-sm font-semibold text-white">Registro de ventas, envío y postventa</p>
        <p className="mt-1 text-xs leading-5 text-silver/70">{dashboard.ledger.detail}</p>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-2" aria-label="Disponibilidad comercial por mercado">
        {dashboard.commerceByMarket.map((entry) => <article key={entry.market} className={`rounded-2xl border p-4 ${entry.checkoutEnabled ? "border-emerald/30 bg-emerald/[.06]" : "border-amber-300/30 bg-amber-300/[.06]"}`}>
          <div className="flex items-center justify-between gap-3"><h2 className="font-semibold text-white">{entry.market === "co" ? "Colombia · COP" : "Estados Unidos · USD"}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${entry.checkoutEnabled ? "bg-emerald/15 text-emerald" : "bg-amber-300/10 text-amber-100"}`}>{entry.checkoutEnabled ? "Cobro habilitado" : "Sólo exploración"}</span></div>
          <p className="mt-2 text-xs leading-5 text-silver/65">{entry.reason || `Procesador activo: ${entry.paymentProvider}.`}</p>
        </article>)}
      </section>

      <section className={`mt-5 rounded-2xl border p-4 ${dashboard.exchangeRate.valid ? "border-emerald/30 bg-emerald/[.06]" : "border-red-300/30 bg-red-300/[.06]"}`} aria-label="Estado de la tasa de cambio">
        <p className="text-sm font-semibold text-white">Tasa comercial COP/USD</p>
        <p className="mt-1 text-xs leading-5 text-silver/70">{dashboard.exchangeRate.valid && dashboard.exchangeRate.copPerUsd !== null && dashboard.exchangeRate.updatedAt ? `1 USD = ${formatCOP(dashboard.exchangeRate.copPerUsd)} · aprobada el ${new Date(dashboard.exchangeRate.updatedAt).toLocaleDateString("es-CO")}.` : dashboard.exchangeRate.detail}</p>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores de venta y envío">
        {salesMetrics.map((item) => <article key={item.label} className="rounded-2xl border border-silver/15 bg-white/[.025] p-5">
          <p className="text-sm text-silver/65">{item.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-white">{item.value}</p>
          <p className="mt-2 text-xs leading-5 text-silver/55">{item.detail}</p>
        </article>)}
      </section>

      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Embudo de postventa">
        {pipeline.map((item) => <article key={item.label} className="rounded-xl border border-silver/15 bg-white/[.018] px-4 py-4"><p className="text-xs text-silver/60">{item.label}</p><p className={`mt-2 text-2xl font-semibold ${item.tone}`}>{metric(item.value, String, hasOrderActivity)}</p></article>)}
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <article className="rounded-2xl border border-silver/15 bg-white/[.025] p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="font-semibold text-white">Ingresos Colombia por día</h2><p className="mt-1 text-xs leading-5 text-silver/60">Suma sólo cobros COP aprobados y conciliados con Wompi; no mezcla importes USD.</p></div><span className="w-fit rounded-full bg-emerald/10 px-3 py-1 text-xs font-semibold text-emerald">Tasa de aprobación global: {metric(dashboard.sales.approvalRatePercent, (value) => `${value.toFixed(1)}%`, hasOrderActivity)}</span></div>
          {!hasApprovedSales ? <p className="mt-8 text-sm leading-6 text-silver/60">La gráfica aparecerá con la primera venta aprobada real.</p> : <ol className="mt-8 grid grid-cols-7 items-end gap-2" aria-label="Gráfica de ingresos diarios">{dashboard.dailySales.map((item) => { const height = item.grossRevenueCop > 0 ? Math.max(4, (item.grossRevenueCop / greatestDailyRevenue) * 100) : 0; return <li key={item.date} className="grid min-w-0 gap-2 text-center"><span className="sr-only">{formatDay(item.date)}: {formatCOP(item.grossRevenueCop)}, {item.approvedOrders} pedidos aprobados.</span><div aria-hidden="true" className="flex h-40 items-end rounded-t-lg bg-white/[.04] px-1"><div className="w-full rounded-t-md bg-emerald transition" style={{ height: `${height}%` }} /></div><span aria-hidden="true" className="truncate text-[10px] text-silver/60">{formatDay(item.date)}</span></li>; })}</ol>}
        </article>
        <aside className="rounded-2xl border border-silver/15 bg-white/[.025] p-5"><h2 className="font-semibold text-white">Tarifa Wompi aplicada</h2><p className="mt-3 text-3xl font-semibold tracking-tight text-emerald">{standardFee}</p><p className="mt-3 text-xs leading-5 text-silver/60">La comisión se estima por transacción exitosa y el IVA se calcula sobre ella. Ajusta estas variables sólo cuando Wompi confirme una tarifa distinta para el comercio.</p><a href="https://comercios.wompi.co/" target="_blank" rel="noreferrer" className="mt-5 inline-flex rounded-full border border-silver/25 px-4 py-2 text-sm font-semibold text-silver hover:border-emerald hover:text-emerald">Abrir reportes de Wompi ↗</a></aside>
      </section>

      <SalesOrderTable orders={dashboard.recentOrders} enabled={dashboard.ledger.connected} />

      <section className="mt-8 rounded-2xl border border-silver/15 bg-white/[.025] p-5" aria-labelledby="market-candidates-title">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div><h2 id="market-candidates-title" className="font-semibold text-white">Candidatos SEO y SEM por mercado</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-silver/60">Diagnóstico basado en catálogo CJ, imágenes oficiales, editorial localizada, margen calculable y capacidad real de checkout. Nunca publica ni pauta automáticamente.</p></div>
          <span className="w-fit rounded-full bg-silver/10 px-3 py-1 text-xs font-semibold text-silver/75">Decisión humana obligatoria</span>
        </div>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="border-y border-silver/10 text-xs tracking-wide text-silver/55 uppercase"><tr><th className="px-3 py-3">Mercado / producto</th><th className="px-3 py-3">Stock</th><th className="px-3 py-3">Visual</th><th className="px-3 py-3">Margen</th><th className="px-3 py-3">Envíos reales</th><th className="px-3 py-3">Conversión</th><th className="px-3 py-3">Devoluciones</th><th className="px-3 py-3">SEO</th><th className="px-3 py-3">SEM</th><th className="px-3 py-3">Diagnóstico</th></tr></thead>
            <tbody>{dashboard.marketCandidates.map((entry) => <tr key={`${entry.market}-${entry.product.sku}`} className="border-b border-silver/10 align-top">
              <td className="px-3 py-4"><p className="max-w-[260px] font-medium text-white">{entry.localizedTitle}</p><p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-emerald">{entry.market === "co" ? "Colombia" : "Estados Unidos"}</p></td>
              <td className="px-3 py-4 text-silver/80">{entry.product.stock}</td>
              <td className="px-3 py-4 text-silver/80">{entry.officialImageCount} oficiales</td>
              <td className="px-3 py-4 text-silver/80">{entry.contributionMarginPercent === null ? "Sin datos" : `${entry.contributionMarginPercent.toFixed(1)}%`}</td>
              <td className="px-3 py-4 text-silver/80">{entry.shippingEvidenceCount ? `${entry.shippingEvidenceCount} pedidos` : "Sin datos"}</td>
              <td className="px-3 py-4 text-silver/80">{entry.conversionRate === null ? "Sin datos" : `${entry.conversionRate.toFixed(1)}%`}</td>
              <td className="px-3 py-4 text-silver/80">{entry.returnRate === null ? "Sin datos" : `${entry.returnRate.toFixed(1)}%`}</td>
              <td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${entry.seoReady ? "bg-emerald/10 text-emerald" : "bg-amber-300/10 text-amber-100"}`}>{entry.seoReady ? "Elegible" : "Bloqueado"}</span></td>
              <td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${entry.semReady ? "bg-emerald/10 text-emerald" : "bg-amber-300/10 text-amber-100"}`}>{entry.semReady ? "Evaluable" : "No pautar"}</span></td>
              <td className="px-3 py-4 text-xs leading-5 text-silver/65">{entry.reason}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-[1.35fr_.65fr]">
        <article className="rounded-2xl border border-silver/15 bg-white/[.025] p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="font-semibold text-white">Margen de contribución del catálogo</h2><p className="mt-1 text-xs leading-5 text-silver/60">Escenario previo al checkout: costo base CJ + comisión Wompi. En un pedido real, el flete seleccionado se registra aparte y se incorpora a la contribución.</p></div><span className="w-fit rounded-full bg-emerald/10 px-3 py-1 text-xs font-semibold text-emerald">Objetivo: {targetPercent}%</span></div>
          <div className="mt-6 space-y-5">{dashboard.byNiche.map((niche) => { const margin = niche.averageContributionMarginPercent; const width = margin === null ? 0 : Math.max(0, Math.min(100, margin)); return <div key={niche.niche}><div className="flex items-end justify-between gap-4 text-sm"><div><p className="font-medium text-white">{niche.label}</p><p className="mt-1 text-xs text-silver/55">{niche.productCount} productos CJ · contribución teórica total {niche.contributionCopAtListedPrice === null ? "sin datos" : formatCOP(niche.contributionCopAtListedPrice)}</p></div><p className="font-semibold text-emerald">{margin === null ? "Sin datos" : `${margin.toFixed(1)}%`}</p></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${margin !== null && margin >= targetPercent ? "bg-emerald" : "bg-amber-300"}`} style={{ width: `${width}%` }} /></div></div>; })}</div>
        </article>
        <aside className="rounded-2xl border border-silver/15 bg-white/[.025] p-5"><h2 className="font-semibold text-white">Lectura operativa</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-silver/70"><li>• Cada checkout guarda mercado, moneda, método CJ, costo, plazo indicado y total antes de abrir el procesador.</li><li>• Si Wompi o PayPal reportan moneda, referencia o monto distintos, el pedido queda en revisión y no habilita postventa.</li><li>• Las credenciales y los datos de pago permanecen en cada procesador; Nexora no almacena tarjetas.</li><li>• La rentabilidad USD queda pendiente hasta conciliar la comisión real de PayPal; no se estima con una tarifa inventada.</li></ul></aside>
      </section>

      <section className="mt-8 rounded-2xl border border-silver/15 bg-white/[.025] p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><h2 className="font-semibold text-white">Economía por producto</h2><p className="mt-1 text-xs leading-5 text-silver/60">Costo base oficial de CJ convertido a COP. “Revisar” significa que no alcanza el objetivo de contribución antes de flete por destino y adquisición.</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${dashboard.priceReviewCount === null ? "bg-red-300/10 text-red-200" : dashboard.priceReviewCount ? "bg-amber-300/10 text-amber-100" : "bg-emerald/10 text-emerald"}`}>{dashboard.priceReviewCount === null ? "Sin datos · tasa pendiente" : `${dashboard.priceReviewCount} por revisar`}</span></div>
        {!dashboard.unitEconomics.length ? <p className="mt-5 rounded-xl border border-red-300/20 bg-red-300/[.05] p-4 text-sm leading-6 text-red-100">No se calculan ni recomiendan precios hasta que la tasa COP/USD tenga valor y fecha vigentes.</p> : <div className="mt-5 overflow-x-auto"><table className="min-w-[950px] w-full text-left text-sm"><thead className="border-y border-silver/10 text-xs tracking-wide text-silver/55 uppercase"><tr><th className="px-3 py-3">Producto</th><th className="px-3 py-3">Precio</th><th className="px-3 py-3">Costo CJ</th><th className="px-3 py-3">Wompi est.</th><th className="px-3 py-3">Contribución</th><th className="px-3 py-3">Margen</th><th className="px-3 py-3">Piso sugerido</th><th className="px-3 py-3">Estado</th></tr></thead><tbody>{dashboard.unitEconomics.map((entry) => <tr key={entry.product.sku} className="border-b border-silver/10 align-top"><td className="px-3 py-4"><p className="max-w-[250px] font-medium text-white">{entry.product.name}</p><p className="mt-1 font-mono text-[11px] text-silver/45">{entry.product.sku}</p></td><td className="px-3 py-4 text-silver/80">{formatCOP(entry.product.price)}</td><td className="px-3 py-4 text-silver/80">{formatCOP(entry.supplierCostCop)}</td><td className="px-3 py-4 text-silver/80">{formatCOP(entry.wompiFeeCop)}</td><td className={`px-3 py-4 font-medium ${entry.contributionCop > 0 ? "text-emerald" : "text-red-300"}`}>{formatCOP(entry.contributionCop)}</td><td className={`px-3 py-4 font-medium ${entry.requiresPriceReview ? "text-amber-200" : "text-emerald"}`}>{entry.contributionMarginPercent.toFixed(1)}%</td><td className="px-3 py-4 text-silver/80">{formatCOP(entry.recommendedPriceCop)}</td><td className="px-3 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${entry.requiresPriceReview ? "bg-amber-300/10 text-amber-100" : "bg-emerald/10 text-emerald"}`}>{entry.requiresPriceReview ? "Revisar" : "Dentro del objetivo"}</span></td></tr>)}</tbody></table></div>}
      </section>
  </>;
}
