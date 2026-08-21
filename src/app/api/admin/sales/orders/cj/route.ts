import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createCjClient, CjAuthenticationError, CjQuotaError, CjRequestError } from "@/lib/automation/cj-client";
import { buildCjCreateOrderV2Payload, CjOrderValidationError } from "@/lib/fulfillment/cj-order";
import { getPersistedSalesFulfillmentOrder, SalesLedgerError, updateFulfillment } from "@/lib/sales-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createOrderV2 = "/api2.0/v1/shopping/order/createOrderV2";
const referencePattern = /^NXR-CART-[A-Z0-9]{12,32}$/;

function orderIdFrom(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = (payload as { data?: unknown }).data;
  if (!data || typeof data !== "object") return "";
  const id = (data as { orderId?: unknown }).orderId;
  return typeof id === "string" || typeof id === "number" ? String(id).trim().slice(0, 140) : "";
}

function failure(error: unknown) {
  if (error instanceof CjOrderValidationError) return { status: 400, message: error.message };
  if (error instanceof CjQuotaError) return { status: 429, message: "CJ no tiene cuota disponible para crear el pedido. No se creó ningún pedido; inténtalo más tarde." };
  if (error instanceof CjAuthenticationError) return { status: 503, message: "No fue posible autenticar la creación con CJ. Revisa la clave CJ de producción." };
  if (error instanceof SalesLedgerError) return { status: 503, message: error.message };
  if (error instanceof CjRequestError) {
    const code = typeof error.code === "number" ? ` Código CJ: ${error.code}.` : "";
    const requestId = error.requestId ? ` Referencia técnica: ${error.requestId.slice(0, 80)}.` : "";
    return { status: 502, message: `CJ rechazó la creación antes de devolver un ID.${code}${requestId} Nexora dejó el pedido en revisión para evitar duplicados; busca primero la referencia Nexora en MyCJ antes de reintentar.` };
  }
  return { status: 500, message: "No fue posible preparar el pedido CJ." };
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ message: "Sesión administrativa requerida." }, { status: 401 });
  let reference = "";
  let reservationStarted = false;
  try {
    const body = await request.json() as { reference?: unknown; confirm?: unknown };
    reference = typeof body.reference === "string" ? body.reference.trim().toUpperCase() : "";
    if (!referencePattern.test(reference) || body.confirm !== true) return NextResponse.json({ message: "Confirma una referencia Nexora válida antes de crear el pedido en CJ." }, { status: 400 });
    let order = await getPersistedSalesFulfillmentOrder(reference);
    if (!order) return NextResponse.json({ message: "No se encontró una orden completa en el registro privado. Actualiza Apps Script y vuelve a desplegarlo antes de crear en CJ." }, { status: 503 });
    if (order.cjOrderId) return NextResponse.json({ message: `La orden ya está asociada al pedido CJ ${order.cjOrderId}.` }, { status: 409 });
    if (order.fulfillmentStatus.trim().toUpperCase() === "CREACIÓN CJ EN CURSO") {
      return NextResponse.json({ message: "Existe una creación CJ con estado incierto. No reintentes: busca primero la referencia Nexora en MyCJ y registra el ID CJ si aparece." }, { status: 409 });
    }
    if (order.fulfillmentStatus.trim().toUpperCase() !== "PAGO CONFIRMADO") {
      return NextResponse.json({ message: "La postventa debe estar en PAGO CONFIRMADO antes de crear el pedido en CJ." }, { status: 409 });
    }
    const reservation = randomUUID().replace(/-/g, "");
    const reservationNote = `[CJ_CREATE_RESERVATION:${reservation}] Creación manual iniciada por administración; no se paga ni despacha automáticamente.`;
    await updateFulfillment({ reference, fulfillmentStatus: "CREACIÓN CJ EN CURSO", note: reservationNote });
    reservationStarted = true;
    order = await getPersistedSalesFulfillmentOrder(reference);
    if (!order?.fulfillmentNote?.includes(reservation)) return NextResponse.json({ message: "Otra actualización administrativa ya está procesando este pedido. Revisa su estado antes de volver a intentarlo." }, { status: 409 });
    const payload = await buildCjCreateOrderV2Payload(order);
    const client = createCjClient();
    await client.authenticateAndAssertPoints(0);
    const result = await client.postJsonOnce<unknown>(createOrderV2, payload);
    const cjOrderId = orderIdFrom(result);
    if (!cjOrderId) throw new CjRequestError("CJ no devolvió un ID de pedido.");
    try {
      await updateFulfillment({ reference, fulfillmentStatus: "PEDIDO EN CJ", cjOrderId, note: `Pedido CJ ${cjOrderId} creado con payType=3. No se pagó ni se despachó automáticamente; entra a MyCJ y paga al proveedor cuando confirmes el total.` });
    } catch (error) {
      console.error("CJ order was created but ledger finalization failed", { reference, cjOrderId, error: error instanceof Error ? error.message : "unknown" });
      return NextResponse.json({ created: true, cjOrderId, reconciliationRequired: true, message: `CJ creó el pedido ${cjOrderId}, pero Nexora no pudo cerrar el registro privado. Anota el ID y actualiza manualmente la postventa antes de pagar en MyCJ.` }, { status: 202 });
    }
    return NextResponse.json({ created: true, cjOrderId, message: "Pedido creado en CJ sin pago automático. Revísalo y págalo manualmente en MyCJ antes de solicitar el despacho." });
  } catch (error) {
    if (reservationStarted && reference && error instanceof CjRequestError) {
      const code = typeof error.code === "number" ? ` code=${error.code}` : "";
      const requestId = error.requestId ? ` requestId=${error.requestId.slice(0, 80)}` : "";
      await updateFulfillment({ reference, fulfillmentStatus: "CREACIÓN CJ EN CURSO", note: `[CJ_CREATE_FAILED] CJ rechazó la creación antes de devolver un ID.${code}${requestId} Busca la referencia Nexora en MyCJ antes de reintentar.` }).catch(() => undefined);
    }
    const result = failure(error);
    console.error("CJ manual order creation failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ message: result.message }, { status: result.status });
  }
}
