import "server-only";

import type { Market } from "@/lib/i18n/config";
import { getPayPalConfiguration } from "@/lib/payments/paypal";

export type MarketPaymentProvider = {
  id: "wompi" | "paypal" | "unconfigured";
  market: Market;
  currency: "COP" | "USD";
  configured: boolean;
  checkoutEnabled: boolean;
  implementationReady: boolean;
  reason: string | null;
};

function salesLedgerConfigured() {
  if (process.env.GOOGLE_SHEETS_SYNC_ENABLED?.trim().toLowerCase() !== "true") return false;
  const endpoint = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();
  const secret = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET?.trim();
  if (!endpoint || !secret || secret.length < 32) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && url.pathname.endsWith("/exec");
  } catch {
    return false;
  }
}

function wompiConfigured() {
  const publicKey = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY?.trim() || process.env.WOMPI_PUBLIC_KEY?.trim();
  const environment = process.env.WOMPI_EVENT_ENVIRONMENT?.trim().toLowerCase();
  const keyEnvironment = publicKey?.startsWith("pub_prod_") ? "prod" : publicKey?.startsWith("pub_test_") ? "test" : null;
  return Boolean(
    keyEnvironment
      && environment === keyEnvironment
      && process.env.WOMPI_INTEGRITY_SECRET?.trim()
      && process.env.WOMPI_EVENT_SECRET?.trim()
      && salesLedgerConfigured(),
  );
}

/**
 * Único registro de procesadores por mercado. Añadir una variable o una llave
 * jamás activa un proveedor: primero debe existir adaptador, webhook firmado,
 * idempotencia, conciliación y validación end-to-end.
 */
export function getMarketPaymentProvider(market: Market): MarketPaymentProvider {
  if (market === "co") {
    const configured = wompiConfigured();
    return {
      id: "wompi",
      market,
      currency: "COP",
      configured,
      checkoutEnabled: configured,
      implementationReady: true,
      reason: configured ? null : "Colombia requiere llave pública Wompi, firma, webhook del mismo entorno y libro privado de ventas configurados.",
    };
  }

  const paypal = getPayPalConfiguration();
  if (paypal) {
    return {
      id: "paypal",
      market,
      currency: "USD",
      configured: true,
      checkoutEnabled: salesLedgerConfigured(),
      implementationReady: true,
      reason: salesLedgerConfigured() ? null : "PayPal requiere el libro privado de ventas para conciliar cada captura antes de confirmar la compra.",
    };
  }

  return {
    id: "unconfigured",
    market,
    currency: "USD",
    configured: false,
    checkoutEnabled: false,
    implementationReady: true,
    reason: "PayPal permanece apagado hasta configurar Client ID, Secret, Webhook ID, entorno y PAYPAL_CHECKOUT_ENABLED=true.",
  };
}
