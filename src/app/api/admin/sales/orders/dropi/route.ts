import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin-auth";
import { createDropiClient, DropiAuthenticationError, DropiRequestError } from "@/lib/automation/dropi-client";
import { buildDropiCreateOrderPayload, DropiOrderValidationError, orderIdFromDropiCreateResult } from "@/lib/fulfillment/dropi-order";
import { getPersistedSalesFulfillmentOrder, SalesLedgerError, updateFulfillment } from "@/lib/sales-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const referencePattern = /^NXR-CART-[A-Z0-9]{12,32}$/;

function failure(error: unknown) {
  if (error instanceof DropiOrderValidationError) return { status: 400, message: error.message };
  if (error instanceof DropiAuthenticationError) return { status: 503, message: "No fue posible autenticar la creación con Dropi. Revisa la clave DROPI_INTEGRATION_KEY." };
  if (error instanceof SalesLedgerError) return { status: 503, message: error.message };
  if (error instanceof DropiRequestError) {
    const code = typeof error.code === "number" ? ` Código Dropi: ${error.code}.` : "";
    return { status: 502, message: `Dropi rechazó la creación antes de devolver un ID.${code} Nexora dejó el pedido en revisión para evitar duplicados.` };
  }
  return { status: 500, message: "No fue posible preparar el pedido Dropi." };
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ message: "Sesión administrativa requerida." }, { status: 401 });
  let reference = "";
  let reservationStarted = false;
  
  try {
    const body = await request.json() as { reference?: unknown; confirm?: unknown };
    reference = typeof body.reference === "string" ? body.reference.trim().toUpperCase() : "";
    
    if (!referencePattern.test(reference) || body.confirm !== true) return NextResponse.json({ message: "Confirma una referencia Nexora válida antes de crear el pedido en Dropi." }, { status: 400 });
    
    let order = await getPersistedSalesFulfillmentOrder(reference);
    if (!order) return NextResponse.json({ message: "No se encontró una orden completa en el registro privado." }, { status: 503 });
    if (order.cjOrderId) return NextResponse.json({ message: `La orden ya está asociada a un pedido existente (${order.cjOrderId}).` }, { status: 409 });
    
    if (order.fulfillmentStatus.trim().toUpperCase() === "CREACIÓN DROPI EN CURSO") {
      return NextResponse.json({ message: "Existe una creación Dropi con estado incierto." }, { status: 409 });
    }
    if (order.fulfillmentStatus.trim().toUpperCase() !== "PAGO CONFIRMADO") {
      return NextResponse.json({ message: "La postventa debe estar en PAGO CONFIRMADO antes de crear el pedido." }, { status: 409 });
    }
    
    const reservation = randomUUID().replace(/-/g, "");
    const reservationNote = `[DROPI_CREATE_RESERVATION:${reservation}] Creación manual iniciada; pagado externamente (no COD).`;
    await updateFulfillment({ reference, fulfillmentStatus: "CREACIÓN DROPI EN CURSO", note: reservationNote });
    reservationStarted = true;
    
    order = await getPersistedSalesFulfillmentOrder(reference);
    if (!order?.fulfillmentNote?.includes(reservation)) return NextResponse.json({ message: "Otra actualización administrativa ya está procesando este pedido." }, { status: 409 });
    
    const payload = await buildDropiCreateOrderPayload(order);
    const client = createDropiClient();
    
    const result = await client.postJson<unknown>("/api/orders", payload);
    const dropiOrderId = orderIdFromDropiCreateResult(result);
    if (!dropiOrderId) throw new DropiRequestError("Dropi no devolvió un ID de pedido.");
    
    try {
      await updateFulfillment({ reference, fulfillmentStatus: "PEDIDO EN DROPI", cjOrderId: dropiOrderId, note: `Pedido Dropi ${dropiOrderId} creado. Ya está pagado en Nexora, no requiere recaudo COD.` });
    } catch (error) {
      console.error("Dropi order was created but ledger finalization failed", { reference, dropiOrderId, error: error instanceof Error ? error.message : "unknown" });
      return NextResponse.json({ created: true, dropiOrderId, reconciliationRequired: true, message: `Dropi creó el pedido ${dropiOrderId}, pero Nexora no pudo cerrar el registro privado.` }, { status: 202 });
    }
    return NextResponse.json({ created: true, dropiOrderId, message: "Pedido creado en Dropi." });
  } catch (error) {
    if (reservationStarted && reference && error instanceof DropiRequestError) {
      const code = typeof error.code === "number" ? ` code=${error.code}` : "";
      await updateFulfillment({ reference, fulfillmentStatus: "CREACIÓN DROPI EN CURSO", note: `[DROPI_CREATE_FAILED] Dropi rechazó la creación antes de devolver un ID.${code} Revisa plataforma Dropi.` }).catch(() => undefined);
    }
    const result = failure(error);
    console.error("Dropi manual order creation failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ message: result.message }, { status: result.status });
  }
}
