export type PayPalEnvironment = "sandbox" | "live";

export type PayPalOrderInput = {
  reference: string;
  amount: number;
  productSubtotal: number;
  shippingCost: number;
  returnUrl: string;
  cancelUrl: string;
  customer: {
    name: string;
    address1: string;
    address2?: string;
    city: string;
    region: string;
    postalCode: string;
    countryCode: "US";
  };
};

export function paypalApiBase(environment: PayPalEnvironment) {
  return environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function paypalCheckoutHosts(environment: PayPalEnvironment) {
  return environment === "live" ? ["www.paypal.com", "paypal.com"] : ["www.sandbox.paypal.com", "sandbox.paypal.com"];
}

function usd(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error("invalid-paypal-amount");
  return value.toFixed(2);
}

export function buildPayPalOrderPayload(input: PayPalOrderInput) {
  if (!/^NXR-CART-[A-Z0-9]{12,32}$/.test(input.reference)) throw new Error("invalid-paypal-reference");
  if (Math.abs(input.amount - input.productSubtotal - input.shippingCost) > 0.001 || input.amount <= 0) {
    throw new Error("invalid-paypal-breakdown");
  }
  return {
    intent: "CAPTURE",
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "Nexora",
          locale: "en-US",
          landing_page: "LOGIN",
          shipping_preference: "SET_PROVIDED_ADDRESS",
          user_action: "PAY_NOW",
          return_url: input.returnUrl,
          cancel_url: input.cancelUrl,
        },
      },
    },
    purchase_units: [{
      reference_id: input.reference,
      custom_id: input.reference,
      invoice_id: input.reference,
      description: "Nexora order",
      amount: {
        currency_code: "USD",
        value: usd(input.amount),
        breakdown: {
          item_total: { currency_code: "USD", value: usd(input.productSubtotal) },
          shipping: { currency_code: "USD", value: usd(input.shippingCost) },
        },
      },
      shipping: {
        name: { full_name: input.customer.name },
        address: {
          address_line_1: input.customer.address1,
          ...(input.customer.address2 ? { address_line_2: input.customer.address2 } : {}),
          admin_area_2: input.customer.city,
          admin_area_1: input.customer.region,
          postal_code: input.customer.postalCode,
          country_code: input.customer.countryCode,
        },
      },
    }],
  };
}

export type VerifiedPayPalCapture = {
  orderId: string;
  captureId: string;
  reference: string;
  status: "APPROVED" | "PENDING" | "DECLINED" | "VOIDED" | "ERROR";
  amount: number;
  currency: "USD";
  updatedAt: string;
  verificationSource: "capture" | "webhook" | "order-query";
};

/**
 * Identidad financiera estable de una captura PayPal.
 *
 * El origen de verificación y la hora de llegada son evidencia, no identidad:
 * el retorno del navegador y el webhook deben producir exactamente el mismo
 * evento para una captura y un estado determinados.
 */
export function paypalCaptureEventId(
  captureId: string,
  status: VerifiedPayPalCapture["status"],
) {
  const normalizedCaptureId = captureId.trim().toUpperCase();
  const normalizedStatus = status.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{6,80}$/.test(normalizedCaptureId)) throw new Error("invalid-paypal-capture-id");
  if (!["APPROVED", "PENDING", "DECLINED", "VOIDED", "ERROR"].includes(normalizedStatus)) {
    throw new Error("invalid-paypal-status");
  }
  return `paypal:${normalizedCaptureId}:${normalizedStatus}`;
}

export function parsePayPalOrder(
  value: unknown,
  verificationSource: VerifiedPayPalCapture["verificationSource"],
): VerifiedPayPalCapture {
  if (!value || typeof value !== "object") throw new Error("invalid-paypal-order");
  const order = value as Record<string, unknown>;
  const purchaseUnits = Array.isArray(order.purchase_units) ? order.purchase_units : [];
  const purchaseUnit = purchaseUnits[0] && typeof purchaseUnits[0] === "object" ? purchaseUnits[0] as Record<string, unknown> : null;
  const payments = purchaseUnit?.payments && typeof purchaseUnit.payments === "object" ? purchaseUnit.payments as Record<string, unknown> : null;
  const captures = Array.isArray(payments?.captures) ? payments.captures : [];
  const capture = captures[0] && typeof captures[0] === "object" ? captures[0] as Record<string, unknown> : null;
  const purchaseAmount = purchaseUnit?.amount && typeof purchaseUnit.amount === "object" ? purchaseUnit.amount as Record<string, unknown> : null;
  const amountObject = capture?.amount && typeof capture.amount === "object" ? capture.amount as Record<string, unknown> : purchaseAmount;
  const orderId = typeof order.id === "string" ? order.id : "";
  const captureId = typeof capture?.id === "string" ? capture.id : "";
  const reference = typeof purchaseUnit?.custom_id === "string" ? purchaseUnit.custom_id : "";
  const currency = amountObject?.currency_code;
  const amount = Number(amountObject?.value);
  const rawStatus = String(capture?.status || order.status || "").toUpperCase();
  const status = rawStatus === "COMPLETED" ? "APPROVED"
    : ["PENDING", "CREATED", "APPROVED", "PAYER_ACTION_REQUIRED"].includes(rawStatus) ? "PENDING"
      : ["VOIDED", "CANCELLED"].includes(rawStatus) ? "VOIDED"
        : ["DECLINED", "DENIED"].includes(rawStatus) ? "DECLINED" : "ERROR";
  const updatedAt = typeof capture?.update_time === "string" ? capture.update_time
    : typeof order.update_time === "string" ? order.update_time : new Date().toISOString();
  if (!orderId || !reference || currency !== "USD" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("invalid-paypal-order");
  }
  if (status === "APPROVED" && !captureId) throw new Error("invalid-paypal-capture");
  return { orderId, captureId: captureId || orderId, reference, status, amount, currency: "USD", updatedAt, verificationSource };
}
