import "server-only";

import { createHash } from "crypto";

export class ShippingQuoteRateLimitError extends Error {}

type WindowEntry = { startedAt: number; attempts: number };

const windows = new Map<string, WindowEntry>();

function limitPerMinute() {
  const configured = Number(process.env.CJ_SHIPPING_QUOTE_MAX_PER_MINUTE || 5);
  return Number.isInteger(configured) ? Math.max(2, Math.min(20, configured)) : 5;
}

function clientFingerprint(request: Request) {
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
  return createHash("sha256").update(`${salt}|${ip}|${userAgent}`).digest("hex");
}

/**
 * Defensa local complementaria al Firewall de Vercel. Es deliberadamente
 * efímera: no se presenta como un límite global distribuido ni persiste PII.
 */
export function enforceShippingQuoteRateLimit(request: Request) {
  const now = Date.now();
  const key = clientFingerprint(request);
  const current = windows.get(key);
  const limit = limitPerMinute();
  if (!current || now - current.startedAt >= 60_000) {
    windows.set(key, { startedAt: now, attempts: 1 });
  } else if (current.attempts >= limit) {
    throw new ShippingQuoteRateLimitError("Has solicitado varias cotizaciones seguidas. Espera un minuto antes de volver a consultar CJ.");
  } else {
    current.attempts += 1;
  }

  if (windows.size > 1_000) {
    for (const [entryKey, entry] of windows) if (now - entry.startedAt >= 60_000) windows.delete(entryKey);
  }
}
