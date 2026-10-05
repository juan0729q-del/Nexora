import "server-only";

import { rocketfyRequestUrl, RocketfyConfigurationError } from "@/lib/suppliers/rocketfy-config";

export class RocketfyRequestError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}
export class RocketfyAuthenticationError extends RocketfyRequestError {}

type JsonRecord = Record<string, unknown>;
let cachedToken: { value: string; expiresAt: number; identity: string } | null = null;

function configured(name: "ROCKETFY_PARTNER_ID" | "ROCKETFY_API_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new RocketfyAuthenticationError(`Falta ${name}; Rocketfy permanece deshabilitado.`);
  return value;
}

function timeoutMs() {
  const value = Number(process.env.ROCKETFY_REQUEST_TIMEOUT_MS || 12000);
  return Number.isFinite(value) ? Math.max(1000, Math.min(30000, Math.floor(value))) : 12000;
}

async function request(path: string, body: JsonRecord, token?: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(rocketfyRequestUrl(path), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as JsonRecord | null;
    if (response.status === 401 || response.status === 403) throw new RocketfyAuthenticationError("Rocketfy rechazó las credenciales o el acceso contractual.", response.status);
    if (!response.ok || !payload) throw new RocketfyRequestError("Rocketfy no pudo completar la solicitud.", response.status);
    return payload;
  } catch (error) {
    if (error instanceof RocketfyRequestError || error instanceof RocketfyConfigurationError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new RocketfyRequestError("Rocketfy excedió el tiempo máximo de respuesta.");
    throw new RocketfyRequestError("No fue posible conectar con Rocketfy.");
  } finally { clearTimeout(timer); }
}

function tokenExpiry(token: string) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp?: number };
    if (Number.isFinite(payload.exp)) return Math.max(Date.now() + 60_000, Number(payload.exp) * 1000 - 60_000);
  } catch {}
  return Date.now() + 10 * 60_000;
}

async function accessToken() {
  const partnerID = configured("ROCKETFY_PARTNER_ID");
  const apiKey = configured("ROCKETFY_API_KEY");
  const identity = `${partnerID}:${apiKey.length}`;
  if (cachedToken?.identity === identity && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const payload = await request("/api/public/connect", { partnerID, api_key: apiKey });
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  if (!token) throw new RocketfyAuthenticationError("Rocketfy no devolvió un token de acceso válido.");
  cachedToken = { value: token, expiresAt: tokenExpiry(token), identity };
  return token;
}

export async function calculateRocketfyShipping(body: JsonRecord) {
  return request("/api/public/calculateShipping", body, await accessToken());
}

export async function getRocketfyShipment(shippingId: string) {
  const customerID = process.env.ROCKETFY_CUSTOMER_ID?.trim();
  if (!customerID) throw new RocketfyAuthenticationError("Falta ROCKETFY_CUSTOMER_ID; no se puede consultar el envío.");
  return request("/api/public/shippings/get", { customerID, shipping_id: shippingId }, await accessToken());
}
