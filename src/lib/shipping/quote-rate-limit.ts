import "server-only";

import { createHash } from "crypto";

export class ShippingQuoteRateLimitError extends Error {}
export class CheckoutRateLimitError extends Error {}
export class PaymentStatusRateLimitError extends Error {}

type WindowEntry = { startedAt: number; attempts: number };

const windows = new Map<string, WindowEntry>();
const checkoutWindows = new Map<string, WindowEntry>();
const checkoutOperationWindows = new Map<string, WindowEntry>();
const paymentStatusWindows = new Map<string, WindowEntry>();
const paymentStatusOperationWindows = new Map<string, WindowEntry>();

function limitPerMinute() {
  const configured = Number(process.env.CJ_SHIPPING_QUOTE_MAX_PER_MINUTE || 5);
  return Number.isInteger(configured) ? Math.max(2, Math.min(20, configured)) : 5;
}

function clientFingerprint(request: Request, identity = "") {
  // Vercel establece x-vercel-forwarded-for. Nunca almacenamos ni registramos
  // la IP; sólo conservamos un hash efímero por proceso para proteger puntos CJ.
  const forwarded = request.headers.get("x-vercel-forwarded-for")
    || request.headers.get("x-forwarded-for")
    || "unknown";
  const ip = forwarded.split(",")[0].trim();
  const userAgent = request.headers.get("user-agent")?.slice(0, 160) || "";
  const salt = process.env.CHECKOUT_QUOTE_SECRET?.trim()
    || process.env.ADMIN_SESSION_SECRET?.trim()
    || "nexora-quote-rate-limit";
  return createHash("sha256").update(`${salt}|${ip}|${userAgent}|${identity}`).digest("hex");
}

/**
 * Defensa local complementaria al Firewall de Vercel. Es deliberadamente
 * efímera: no se presenta como un límite global distribuido ni persiste PII.
 */
export function enforceShippingQuoteRateLimit(request: Request) {
  enforceWindow({
    request,
    entries: windows,
    limit: limitPerMinute(),
    error: () => new ShippingQuoteRateLimitError("Has solicitado varias cotizaciones seguidas. Espera un minuto antes de volver a consultar CJ."),
  });
}

function checkoutLimitPerMinute() {
  const configured = Number(process.env.CHECKOUT_MAX_PER_MINUTE || 4);
  return Number.isInteger(configured) ? Math.max(2, Math.min(10, configured)) : 4;
}

function enforceWindow({ request, entries, limit, error, identity = "" }: {
  request: Request;
  entries: Map<string, WindowEntry>;
  limit: number;
  error: () => Error;
  identity?: string;
}) {
  const now = Date.now();
  const key = clientFingerprint(request, identity);
  const current = entries.get(key);
  if (!current || now - current.startedAt >= 60_000) {
    entries.set(key, { startedAt: now, attempts: 1 });
  } else if (current.attempts >= limit) {
    throw error();
  } else {
    current.attempts += 1;
  }

  if (entries.size > 1_000) {
    for (const [entryKey, entry] of entries) if (now - entry.startedAt >= 60_000) entries.delete(entryKey);
  }
}

/** Segunda barrera local contra dobles clics y reintentos automatizados. */
export function enforceCheckoutRateLimit(request: Request, identity: string) {
  enforceWindow({
    request,
    entries: checkoutWindows,
    limit: checkoutLimitPerMinute(),
    error: () => new CheckoutRateLimitError("Se recibieron varios intentos de pago seguidos. Espera un minuto y conserva abierta esta página."),
  });
  enforceWindow({
    request,
    entries: checkoutOperationWindows,
    limit: checkoutLimitPerMinute(),
    identity,
    error: () => new CheckoutRateLimitError("Se recibieron varios intentos de pago seguidos. Espera un minuto y conserva abierta esta página."),
  });
}

/** Limita el polling público contra Wompi sin conservar el ID en claro. */
export function enforcePaymentStatusRateLimit(request: Request, identity: string) {
  enforceWindow({
    request,
    entries: paymentStatusWindows,
    limit: 15,
    error: () => new PaymentStatusRateLimitError("Espera un minuto antes de volver a consultar el estado del pago."),
  });
  enforceWindow({
    request,
    entries: paymentStatusOperationWindows,
    limit: 15,
    identity,
    error: () => new PaymentStatusRateLimitError("Espera un minuto antes de volver a consultar el estado del pago."),
  });
}
