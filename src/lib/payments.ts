"use client";
import type { CartCheckoutRequest } from "@/lib/providers/payment-provider";

export async function beginCheckout(request: CartCheckoutRequest) {
  // La importación diferida conserva los SDK de Wompi/Mercado Pago fuera del bundle crítico.
  const { createCheckoutSession } = await import("@/lib/providers/payment-provider");
  return createCheckoutSession(request);
}
