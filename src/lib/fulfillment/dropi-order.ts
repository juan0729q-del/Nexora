import "server-only";

import { getCatalog } from "@/lib/catalog-store";
import type { SalesLedgerFulfillmentOrder } from "@/lib/sales-ledger";

export type DropiCreateOrderPayload = {
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  shipping_city: string;
  shipping_department: string;
  shipping_zip_code: string;
  is_cod: false; // NO se usa pago contra entrega
  order_total: number;
  notes: string;
  products: Array<{
    sku: string;
    quantity: number;
    price: number;
  }>;
};

export class DropiOrderValidationError extends Error {}

function required(value: string, label: string, maximum = 300) {
  const clean = value.trim().slice(0, maximum);
  if (!clean) throw new DropiOrderValidationError(`Falta ${label} en el pedido. Completa la información antes de crear el pedido en Dropi.`);
  return clean;
}

export async function buildDropiCreateOrderPayload(order: SalesLedgerFulfillmentOrder): Promise<DropiCreateOrderPayload> {
  if (order.paymentStatus.toUpperCase() !== "APPROVED" || order.needsReview) throw new DropiOrderValidationError("Sólo se puede crear en Dropi un pago aprobado y conciliado.");
  
  const recipient = required(order.shipping.recipient || order.customer.name, "el destinatario", 180);
  const address1 = required(order.shipping.address1, "la dirección", 300);
  
  const products = order.items.map((item, index) => {
    const variantSku = required(item.variantSku, `el SKU de estilo ${index + 1}`, 180);
    return {
      sku: variantSku,
      quantity: item.quantity,
      // Se asume 0 o el valor correspondiente según la lógica comercial de pago por fuera de Dropi
      price: 0, 
    };
  });

  return {
    customer_name: recipient,
    customer_email: required(order.customer.email, "el correo del cliente", 254),
    customer_phone: required(order.customer.phone, "el teléfono", 60),
    shipping_address: address1,
    shipping_city: required(order.shipping.city, "la ciudad", 120),
    shipping_department: required(order.shipping.region, "el departamento", 120),
    shipping_zip_code: order.shipping.postalCode || "000000",
    is_cod: false,
    order_total: 0, // Como ya está pagado por Wompi, el recaudo Dropi es 0 (no COD)
    notes: `Nexora ${order.reference}`,
    products,
  };
}

export function orderIdFromDropiCreateResult(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const data = (payload as { id?: unknown }).id || (payload as { data?: { id?: unknown } })?.data?.id;
  if (typeof data === "string" || typeof data === "number") return String(data).trim().slice(0, 140);
  return "";
}
