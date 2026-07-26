"use client";
import type { Product } from "@/lib/products";

export async function beginCheckout(product: Pick<Product, "slug">) {
  // La importación diferida conserva los SDK de Wompi/Mercado Pago fuera del bundle crítico.
  const { createCheckoutSession } = await import("@/lib/providers/payment-provider");
  return createCheckoutSession(product);
}
