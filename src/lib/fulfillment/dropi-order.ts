import "server-only";
import { getCatalog } from "@/lib/catalog-store";
import type { SalesLedgerFulfillmentOrder } from "@/lib/sales-ledger";

export class DropiOrderValidationError extends Error {}

/** Validate known business invariants without inventing a provider payload. */
export async function buildDropiCreateOrderPayload(order: SalesLedgerFulfillmentOrder): Promise<never> {
  if (order.paymentStatus.toUpperCase() !== "APPROVED" || order.needsReview) throw new DropiOrderValidationError("Sólo se admite un pago aprobado y conciliado.");
  if (order.market !== "co" || order.currency !== "COP" || !["CO", "COLOMBIA"].includes(order.shipping.country.trim().toUpperCase())) throw new DropiOrderValidationError("Dropi sólo admite pedidos COP para Colombia.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.customer.email)) throw new DropiOrderValidationError("Correo inválido.");
  if (!/^(?:57)?3\d{9}$/.test(order.customer.phone.replace(/\D/g, ""))) throw new DropiOrderValidationError("Teléfono móvil colombiano inválido.");
  if (![order.shipping.recipient || order.customer.name, order.shipping.address1, order.shipping.city, order.shipping.region].every((value) => value.trim())) throw new DropiOrderValidationError("La dirección está incompleta.");
  const catalog = await getCatalog();
  if (!order.items.length || order.items.some((item) => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !catalog.some((product) => product.supplier.source === "dropi" && product.sku === item.sku && product.variants.some((variant) => variant.sku === item.variantSku)))) throw new DropiOrderValidationError("El pedido debe contener exclusivamente variantes verificadas de Dropi.");
  throw new DropiOrderValidationError("El contrato de creación Dropi todavía no está verificado. No se generó un payload ni un total de recaudo supuesto.");
}
