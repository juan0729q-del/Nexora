import "server-only";

import type { SalesLedgerFulfillmentOrder } from "@/lib/sales-ledger";

export type CjCreateOrderV2Payload = {
  orderNumber: string;
  shippingZip: string;
  shippingCountry: string;
  shippingCountryCode: "CO" | "US";
  shippingProvince: string;
  shippingCity: string;
  shippingPhone: string;
  shippingCustomerName: string;
  shippingAddress: string;
  shippingAddress2?: string;
  email: string;
  remark: string;
  payType: 3;
  logisticName: string;
  fromCountryCode: string;
  platform: "Api";
  shopLogisticsType: 2;
  orderFlow: 1;
  storeOrderTime: number;
  products: Array<{ sku: string; quantity: number; storeLineItemId: string; storeSku: string; storeProductName: string }>;
};

export class CjOrderValidationError extends Error {}

function required(value: string, label: string, maximum = 300) {
  const clean = value.trim().slice(0, maximum);
  if (!clean) throw new CjOrderValidationError(`Falta ${label} en el pedido. Vuelve a cotizar o completa la dirección antes de crear el pedido en CJ.`);
  return clean;
}

export function buildCjCreateOrderV2Payload(order: SalesLedgerFulfillmentOrder): CjCreateOrderV2Payload {
  if (order.paymentStatus.toUpperCase() !== "APPROVED" || order.needsReview) throw new CjOrderValidationError("Sólo se puede crear en CJ un pago aprobado y conciliado.");
  if (order.cjOrderId) throw new CjOrderValidationError("Esta orden ya tiene un pedido CJ asociado.");
  const destination = order.market === "co"
    ? { code: "CO" as const, country: "Colombia" }
    : { code: "US" as const, country: "United States" };
  const recipient = required(order.shipping.recipient || order.customer.name, "el destinatario", 180);
  const address1 = required(order.shipping.address1, "la dirección", 300);
  const products = order.items.map((item, index) => ({
    sku: required(item.variantSku, `el SKU de estilo ${index + 1}`, 180),
    quantity: item.quantity,
    storeLineItemId: `${order.reference}-${index + 1}`,
    storeSku: required(item.variantSku, `el SKU de estilo ${index + 1}`, 180),
    storeProductName: required(item.productName, `el nombre del producto ${index + 1}`, 300),
  }));
  return {
    orderNumber: required(order.reference, "la referencia", 140),
    shippingZip: required(order.shipping.postalCode, "el código postal", 40),
    shippingCountry: destination.country,
    shippingCountryCode: destination.code,
    shippingProvince: required(order.shipping.region, "el departamento o estado", 120),
    shippingCity: required(order.shipping.city, "la ciudad", 120),
    shippingPhone: required(order.customer.phone, "el teléfono", 60),
    shippingCustomerName: recipient,
    shippingAddress: address1,
    ...(order.shipping.address2 ? { shippingAddress2: order.shipping.address2.slice(0, 300) } : {}),
    email: required(order.customer.email, "el correo del cliente", 254),
    remark: `Nexora ${order.reference}`,
    payType: 3,
    logisticName: required(order.shipping.method, "el método de envío CJ", 160),
    fromCountryCode: required(order.shipping.originCountryCode, "el origen del envío CJ", 12),
    platform: "Api",
    shopLogisticsType: 2,
    orderFlow: 1,
    storeOrderTime: Math.floor(Date.now() / 1000),
    products,
  };
}
