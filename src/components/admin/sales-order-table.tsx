"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCOP } from "@/lib/products";
import type { SalesLedgerOrder } from "@/lib/sales-ledger";

const fulfillmentStates = [
  "PAGO CONFIRMADO",
  "PEDIDO EN CJ",
  "EN PREPARACIÓN",
  "ENVIADO",
  "EN TRÁNSITO",
  "ENTREGADO",
  "INCIDENCIA",
  "CANCELADO",
  "REEMBOLSADO",
] as const;

type OrderFields = {
  fulfillmentStatus: string;
  cjOrderId: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  note: string;
};

function initialFields(order: SalesLedgerOrder): OrderFields {
  return { fulfillmentStatus: order.fulfillmentStatus, cjOrderId: "", carrier: "", trackingNumber: "", trackingUrl: "", note: "" };
}

function money(value: number | null) {
  return value === null ? "—" : formatCOP(value);
}

export function SalesOrderTable({ orders, enabled }: { orders: SalesLedgerOrder[]; enabled: boolean }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, OrderFields>>(() => Object.fromEntries(orders.map((order) => [order.reference, initialFields(order)])));
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function draft(order: SalesLedgerOrder) {
    return drafts[order.reference] || initialFields(order);
  }

  function change(reference: string, field: keyof OrderFields, value: string) {
    setDrafts((current) => ({ ...current, [reference]: { ...(current[reference] || initialFields(orders.find((order) => order.reference === reference) || orders[0] as SalesLedgerOrder)), [field]: value } }));
  }

  async function save(event: FormEvent<HTMLFormElement>, order: SalesLedgerOrder) {
    event.preventDefault();
    if (!enabled || order.needsReview || saving) return;
    setSaving(order.reference);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/sales/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: order.reference, ...draft(order) }),
      });
      const payload = await response.json().catch(() => null) as { message?: string } | null;
      if (!response.ok) throw new Error(payload?.message || "No fue posible actualizar el pedido.");
      setNotice(`Pedido ${order.reference} actualizado.`);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No fue posible actualizar el pedido.");
    } finally {
      setSaving(null);
    }
  }

  return <section className="mt-8 overflow-hidden rounded-2xl border border-silver/15 bg-white/[.025]">
    <div className="flex flex-col justify-between gap-3 border-b border-silver/15 px-5 py-4 sm:flex-row sm:items-start">
      <div>
        <h2 className="font-semibold text-white">Pedidos, envío y postventa</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-silver/60">La dirección, el correo y la cotización CJ se capturan antes del pago y se guardan sólo en el registro privado. Antes de despachar, comprueba que el pago y el total estén conciliados.</p>
      </div>
      <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${enabled ? "bg-emerald/10 text-emerald" : "bg-amber-300/10 text-amber-100"}`}>{enabled ? "Registro privado activo" : "Pendiente de conexión"}</span>
    </div>
    {notice && <p aria-live="polite" className="border-b border-silver/10 px-5 py-3 text-sm text-silver/80">{notice}</p>}
    {!orders.length ? <p className="p-5 text-sm leading-6 text-silver/65">Aún no hay pedidos registrados. Esta vista se llenará sólo con checkouts y pagos reales; no se crearán pedidos de prueba.</p> : <div className="overflow-x-auto">
      <table className="min-w-[1420px] w-full text-left text-sm">
        <thead className="bg-white/[.025] text-xs tracking-wide text-silver/55 uppercase"><tr><th className="px-5 py-3">Pedido</th><th className="px-5 py-3">Cliente y entrega</th><th className="px-5 py-3">Flete CJ</th><th className="px-5 py-3">Pago y rentabilidad</th><th className="px-5 py-3">Seguimiento operativo</th></tr></thead>
        <tbody>{orders.map((order) => {
          const fields = draft(order);
          return <tr key={order.reference} className="border-t border-silver/10 align-top">
            <td className="px-5 py-4"><p className="max-w-[230px] font-medium text-white">{order.productName}</p><p className="mt-1 text-xs text-silver/65">Variante: {order.variantLabel || order.variantSku || "Pendiente"}</p><p className="mt-1 font-mono text-[11px] text-silver/50">{order.variantSku || order.productSku || "SKU pendiente"}</p><p className="mt-1 font-mono text-[11px] text-silver/50">{order.reference}</p><p className="mt-1 text-xs text-silver/65">{order.paymentStatus} · {order.createdAt ? new Date(order.createdAt).toLocaleString("es-CO") : "Sin fecha"}</p>{order.needsReview && <p className="mt-2 rounded-md bg-amber-300/10 px-2 py-1 text-xs font-semibold text-amber-100">Revisión de pago requerida</p>}</td>
            <td className="px-5 py-4"><p className="text-xs font-medium text-silver">{order.customerEmail || "Email aún no registrado"}</p><p className="mt-2 max-w-[230px] text-xs leading-5 text-silver/60">{order.shippingSummary || "Dirección de envío pendiente."}</p></td>
            <td className="px-5 py-4"><p className="font-medium text-white">{order.shippingMethod || "Método pendiente"}</p><p className="mt-1 text-xs text-silver/60">{order.shippingEstimatedDelivery ? `Estimado CJ: ${order.shippingEstimatedDelivery}` : "Tiempo pendiente"}</p><p className="mt-1 text-xs text-silver/60">Origen: {order.shippingOriginCountryCode || "—"}</p><p className="mt-1 text-xs text-silver/60">Cobrado: {money(order.shippingChargedCop)}</p><p className="mt-1 text-xs text-silver/60">Costo CJ: {money(order.supplierShippingCostCop)}</p>{order.shippingQuotedAt && <p className="mt-1 text-[11px] text-silver/45">Cotizado: {new Date(order.shippingQuotedAt).toLocaleString("es-CO")}</p>}</td>
            <td className="px-5 py-4"><p className="font-medium text-white">Total: {money(order.grossAmountCop)}</p><p className="mt-1 text-xs text-silver/60">Producto: {money(order.productSubtotalCop)}</p><p className="mt-1 text-xs text-silver/60">Wompi est.: {money(order.wompiFeeCop)}</p><p className={`mt-1 text-xs font-medium ${(order.estimatedContributionCop || 0) >= 0 ? "text-emerald" : "text-red-300"}`}>Contribución: {money(order.estimatedContributionCop)}</p></td>
            <td className="px-5 py-4"><form onSubmit={(event) => save(event, order)} className="grid max-w-[340px] gap-2"><select aria-label={`Estado postventa ${order.reference}`} value={fields.fulfillmentStatus} onChange={(event) => change(order.reference, "fulfillmentStatus", event.target.value)} disabled={order.needsReview} className="rounded-lg border border-silver/20 bg-onyx px-3 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"><option value="">Selecciona estado</option>{fulfillmentStates.map((status) => <option key={status} value={status}>{status}</option>)}</select><input aria-label={`Pedido CJ ${order.reference}`} value={fields.cjOrderId} onChange={(event) => change(order.reference, "cjOrderId", event.target.value)} disabled={order.needsReview} placeholder="ID de pedido CJ" className="rounded-lg border border-silver/20 bg-onyx px-3 py-2 text-xs text-white placeholder:text-silver/35 disabled:cursor-not-allowed disabled:opacity-50" /><div className="grid grid-cols-2 gap-2"><input aria-label={`Transportadora ${order.reference}`} value={fields.carrier} onChange={(event) => change(order.reference, "carrier", event.target.value)} disabled={order.needsReview} placeholder="Transportadora" className="min-w-0 rounded-lg border border-silver/20 bg-onyx px-3 py-2 text-xs text-white placeholder:text-silver/35 disabled:cursor-not-allowed disabled:opacity-50" /><input aria-label={`Guía ${order.reference}`} value={fields.trackingNumber} onChange={(event) => change(order.reference, "trackingNumber", event.target.value)} disabled={order.needsReview} placeholder="Guía" className="min-w-0 rounded-lg border border-silver/20 bg-onyx px-3 py-2 text-xs text-white placeholder:text-silver/35 disabled:cursor-not-allowed disabled:opacity-50" /></div><input aria-label={`URL de seguimiento ${order.reference}`} value={fields.trackingUrl} onChange={(event) => change(order.reference, "trackingUrl", event.target.value)} disabled={order.needsReview} placeholder="https://seguimiento…" className="rounded-lg border border-silver/20 bg-onyx px-3 py-2 text-xs text-white placeholder:text-silver/35 disabled:cursor-not-allowed disabled:opacity-50" />{order.needsReview && <p className="text-xs leading-5 text-amber-100">Verifica manualmente monto, moneda y producto antes de habilitar la postventa.</p>}<button disabled={!enabled || order.needsReview || saving === order.reference} className="w-fit rounded-full bg-emerald px-3 py-2 text-xs font-bold text-onyx disabled:cursor-not-allowed disabled:bg-silver/30">{saving === order.reference ? "Guardando…" : "Guardar estado"}</button></form></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
  </section>;
}
