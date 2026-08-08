import "server-only";

const cjOrigin = "https://developers.cjdropshipping.com";
const tokenEndpoint = "/api2.0/v1/authentication/getAccessToken";
const refreshEndpoint = "/api2.0/v1/authentication/refreshAccessToken";
// El nivel gratuito de CJ puede estar limitado a una petición por segundo.
// El margen extra protege contra la precisión del reloj y ejecuciones cálidas.
const cjRequestIntervalMs = 1_100;

type CjPointsInfo = {
  usedToday?: number;
  remaining?: number;
  total?: number;
};

type CjEnvelope<T> = {
  code?: number;
  result?: boolean;
  success?: boolean;
  message?: string;
  requestId?: string;
  pointsInfo?: CjPointsInfo;
  data?: T;
};

type CjTokenPayload = {
  accessToken?: string;
  accessTokenExpiryDate?: string;
  refreshToken?: string;
  refreshTokenExpiryDate?: string;
};

type CjResponse = {
  response: Response;
  payload: CjEnvelope<unknown> | undefined;
  detail: string;
};

export class CjAuthenticationError extends Error {}
export class CjRequestError extends Error {}
export class CjQuotaError extends CjRequestError {}

export type CjSession = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiryDate?: string;
};

export type CjTelemetry = {
  requestId?: string;
  points?: CjPointsInfo;
};

let sharedRequestQueue: Promise<void> = Promise.resolve();
let sharedNextRequestAt = 0;
let sharedSessionPromise: Promise<CjSession> | undefined;
let sharedRefreshPromise: Promise<CjSession> | undefined;
const sharedTelemetry: CjTelemetry = {};

function sessionIsFresh(session: CjSession) {
  if (!session.accessTokenExpiryDate) return true;
  const expiry = Date.parse(session.accessTokenExpiryDate);
  return !Number.isFinite(expiry) || expiry - Date.now() > 5 * 60_000;
}

export function getCjCredentialConfiguration() {
  const apiKey = process.env.CJ_DROPSHIPPING_API_KEY?.trim();
  return {
    configured: Boolean(apiKey),
  };
}

function apiKey() {
  const value = process.env.CJ_DROPSHIPPING_API_KEY?.trim();
  if (!value) throw new CjAuthenticationError("Falta CJ_DROPSHIPPING_API_KEY. Nexora requiere una API Key vigente de CJ para autenticarse.");
  return value;
}

function officialCjUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CjRequestError("La URL configurada de CJ no es válida.");
  }
  if (url.protocol !== "https:" || url.origin !== cjOrigin) {
    throw new CjRequestError("Las consultas CJ solo pueden dirigirse al host HTTPS oficial developers.cjdropshipping.com.");
  }
  return url.toString();
}

function isSuccessful(response: Response, payload: CjEnvelope<unknown> | undefined) {
  return response.ok && payload !== undefined && (payload.code === undefined || payload.code === 200) && payload.result !== false && payload.success !== false;
}

function isAuthenticationFailure(response: Response, payload: CjEnvelope<unknown> | undefined) {
  if ([1600004, 1600005, 1600006, 1600200, 1600201, 1600300, 16900500].includes(payload?.code || 0)) return false;
  if (response.status === 401 || response.status === 403) return true;
  if (payload?.code === 1600001 || payload?.code === 1600002 || payload?.code === 1600003) return true;
  return /(?:access\s*token|refresh\s*token|authentication|api\s*key)/i.test(payload?.message || "");
}

function responseDetail(response: Response, payload: CjEnvelope<unknown> | undefined, raw: string) {
  const message = payload?.message || raw.replace(/\s+/g, " ").slice(0, 180) || "sin detalle";
  return `CJ respondió ${response.status}${payload?.code !== undefined ? ` (código ${payload.code})` : ""}: ${message}`;
}

function numberOrUndefined(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function pointsFrom(value: unknown): CjPointsInfo | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  const usedToday = numberOrUndefined(candidate.usedToday);
  const remaining = numberOrUndefined(candidate.remaining);
  const total = numberOrUndefined(candidate.total);
  if (usedToday === undefined && remaining === undefined && total === undefined) return undefined;
  return { usedToday, remaining, total };
}

async function parseResponse(response: Response): Promise<CjResponse> {
  const raw = await response.text();
  let payload: CjEnvelope<unknown> | undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const envelope = parsed as CjEnvelope<unknown>;
      payload = { ...envelope, pointsInfo: pointsFrom(envelope.pointsInfo) };
    }
  } catch {
    // CJ puede responder HTML/texto al atravesar una capa de red. Nunca se registra
    // el cuerpo completo para evitar filtrar información sensible del proveedor.
  }
  return { response, payload, detail: responseDetail(response, payload, raw) };
}

function tokenFrom(payload: CjEnvelope<unknown>, operation: string): CjSession {
  const data = payload.data as CjTokenPayload | undefined;
  if (!data?.accessToken) throw new CjAuthenticationError(`CJ no entregó un access token durante ${operation}.`);
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    accessTokenExpiryDate: data.accessTokenExpiryDate,
  };
}

function requestTimeout() {
  const configured = Number(process.env.CJ_DROPSHIPPING_REQUEST_TIMEOUT_MS || 12_000);
  return Math.min(30_000, Math.max(2_000, Number.isFinite(configured) ? configured : 12_000));
}

function minimumPointsReserve(override?: number) {
  const configured = override ?? Number(process.env.CJ_MINIMUM_POINTS_RESERVE || 200);
  return Number.isFinite(configured) && configured >= 0 ? Math.floor(configured) : 200;
}

function canRetryWithNewToken(init?: RequestInit) {
  const method = init?.method?.toUpperCase() || "GET";
  return method === "GET" || method === "HEAD";
}

function isQuotaExhausted(response: Response, payload: CjEnvelope<unknown> | undefined) {
  if ([1600201, 16900500].includes(payload?.code || 0)) return true;
  return response.status === 429 && /(?:insufficient|quota|points)/i.test(payload?.message || "");
}

function isRateLimitFailure(response: Response, payload: CjEnvelope<unknown> | undefined) {
  return (response.status === 429 && !isQuotaExhausted(response, payload)) || payload?.code === 1600200;
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function retryAfterMilliseconds(response: Response) {
  const retryAfter = response.headers.get("retry-after")?.trim();
  if (!retryAfter) return cjRequestIntervalMs;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, Math.max(cjRequestIntervalMs, Math.ceil(seconds * 1_000)));
  const date = Date.parse(retryAfter);
  return Number.isFinite(date) ? Math.min(60_000, Math.max(cjRequestIntervalMs, date - Date.now())) : cjRequestIntervalMs;
}

async function waitForSharedRequestSlot() {
  const previous = sharedRequestQueue;
  let release: (() => void) | undefined;
  sharedRequestQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  try {
    const delay = Math.max(0, sharedNextRequestAt - Date.now());
    if (delay) await wait(delay);
    sharedNextRequestAt = Date.now() + cjRequestIntervalMs;
  } finally {
    release?.();
  }
}

/**
 * Cliente efímero por ejecución. Autentica con API key antes de consultar CJ,
 * mantiene tokens solamente en memoria y coordina las solicitudes de todas
 * las instancias cálidas del proceso para respetar el límite más conservador.
 */
export class CjClient {
  constructor(private readonly pointsReserveOverride?: number) {}

  getTelemetry(): CjTelemetry {
    return {
      requestId: sharedTelemetry.requestId,
      points: sharedTelemetry.points ? { ...sharedTelemetry.points } : undefined,
    };
  }

  assertPointsAvailable(nextRequestCost = 0) {
    const remaining = sharedTelemetry.points?.remaining;
    const reserve = minimumPointsReserve(this.pointsReserveOverride);
    const required = reserve + Math.max(0, nextRequestCost);
    if (remaining !== undefined && remaining < required) {
      throw new CjQuotaError(`CJ reportó ${remaining} puntos disponibles; Nexora reservó ${reserve} puntos y detuvo la consulta antes de exceder la cuota.`);
    }
  }

  /** Obtiene primero la telemetría de la sesión y luego valida la reserva. */
  async authenticateAndAssertPoints(nextRequestCost = 0) {
    await this.getSession();
    this.assertPointsAvailable(nextRequestCost);
  }

  private observe(payload: CjEnvelope<unknown> | undefined) {
    if (!payload) return;
    if (payload.requestId) sharedTelemetry.requestId = payload.requestId;
    if (payload.pointsInfo) sharedTelemetry.points = payload.pointsInfo;
  }

  private async authenticateWithApiKey() {
    const response = await this.fetchCj(`${cjOrigin}${tokenEndpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ apiKey: apiKey() }),
      cache: "no-store",
    });
    const parsed = await parseResponse(response);
    this.observe(parsed.payload);
    if (!isSuccessful(parsed.response, parsed.payload) || !parsed.payload) {
      throw new CjAuthenticationError(`No fue posible autenticar con CJ. ${parsed.detail}`);
    }
    return tokenFrom(parsed.payload, "getAccessToken");
  }

  private async refreshAccessToken(refreshToken: string) {
    const response = await this.fetchCj(`${cjOrigin}${refreshEndpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken }),
      cache: "no-store",
    });
    const parsed = await parseResponse(response);
    this.observe(parsed.payload);
    if (!isSuccessful(parsed.response, parsed.payload) || !parsed.payload) {
      if (!isAuthenticationFailure(parsed.response, parsed.payload)) throw new CjRequestError(`CJ no pudo renovar el access token. ${parsed.detail}`);
      throw new CjAuthenticationError(`CJ no pudo renovar el access token. ${parsed.detail}`);
    }
    return tokenFrom(parsed.payload, "refreshAccessToken");
  }

  private async getSession() {
    if (!sharedSessionPromise) {
      sharedSessionPromise = this.authenticateWithApiKey().catch((error) => {
        sharedSessionPromise = undefined;
        throw error;
      });
    }
    const session = await sharedSessionPromise;
    if (sessionIsFresh(session)) return session;
    return this.renewSession(session);
  }

  private async renewSession(previous: CjSession) {
    if (!sharedRefreshPromise) {
      sharedRefreshPromise = (async () => {
        if (previous.refreshToken) {
          try {
            return await this.refreshAccessToken(previous.refreshToken);
          } catch (error) {
            if (!(error instanceof CjAuthenticationError)) throw error;
          }
        }
        // Si el refresh token venció o fue revocado, la API key crea otra sesión.
        return this.authenticateWithApiKey();
      })().finally(() => {
        sharedRefreshPromise = undefined;
      });
    }
    const renewed = await sharedRefreshPromise;
    sharedSessionPromise = Promise.resolve(renewed);
    return renewed;
  }

  private async request(url: string, accessToken: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    headers.set("CJ-Access-Token", accessToken);
    const parsed = await parseResponse(await this.fetchCj(officialCjUrl(url), {
      ...init,
      headers,
      cache: "no-store",
    }));
    this.observe(parsed.payload);
    return parsed;
  }

  private async fetchCj(url: string, init: RequestInit) {
    await waitForSharedRequestSlot();
    try {
      return await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(requestTimeout()) });
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError" ? "CJ agotó el tiempo de espera." : "No fue posible contactar la API de CJ.";
      throw new CjRequestError(reason);
    }
  }

  async getJson<T>(url: string, init?: RequestInit): Promise<T> {
    const current = await this.getSession();
    let activeSession = current;
    let result = await this.request(url, activeSession.accessToken, init);
    if (isSuccessful(result.response, result.payload)) return result.payload as T;

    if (isQuotaExhausted(result.response, result.payload)) throw new CjQuotaError(result.detail);

    if (canRetryWithNewToken(init) && isAuthenticationFailure(result.response, result.payload)) {
      const renewed = await this.renewSession(current);
      activeSession = renewed;
      result = await this.request(url, activeSession.accessToken, init);
      if (isSuccessful(result.response, result.payload)) return result.payload as T;
      if (isQuotaExhausted(result.response, result.payload)) throw new CjQuotaError(result.detail);
    }

    if (isRateLimitFailure(result.response, result.payload)) {
      // CJ recomienda regular la frecuencia; solo se hace un reintento con
      // Retry-After, margen conservador y jitter, nunca un bucle agresivo.
      const jitter = Math.floor(Math.random() * 250);
      await wait(retryAfterMilliseconds(result.response) + jitter);
      result = await this.request(url, activeSession.accessToken, init);
      if (isSuccessful(result.response, result.payload)) return result.payload as T;
      if (isQuotaExhausted(result.response, result.payload)) throw new CjQuotaError(result.detail);
    }

    throw new CjRequestError(result.detail);
  }

  /**
   * Algunas consultas de CJ, como freightCalculateTip, son POST pero no
   * cambian estado. Este método limita los reintentos al token/429 de esa
   * consulta idempotente; nunca debe usarse para crear pedidos o compras.
   */
  async postJson<T>(url: string, body: unknown): Promise<T> {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
    const current = await this.getSession();
    let activeSession = current;
    let result = await this.request(url, activeSession.accessToken, init);
    if (isSuccessful(result.response, result.payload)) return result.payload as T;
    if (isQuotaExhausted(result.response, result.payload)) throw new CjQuotaError(result.detail);

    // La cotización no tiene efectos laterales en CJ; un único reintento con
    // token fresco evita que un access token vencido bloquee el checkout.
    if (isAuthenticationFailure(result.response, result.payload)) {
      activeSession = await this.renewSession(current);
      result = await this.request(url, activeSession.accessToken, init);
      if (isSuccessful(result.response, result.payload)) return result.payload as T;
      if (isQuotaExhausted(result.response, result.payload)) throw new CjQuotaError(result.detail);
    }

    if (isRateLimitFailure(result.response, result.payload)) {
      const jitter = Math.floor(Math.random() * 250);
      await wait(retryAfterMilliseconds(result.response) + jitter);
      result = await this.request(url, activeSession.accessToken, init);
      if (isSuccessful(result.response, result.payload)) return result.payload as T;
      if (isQuotaExhausted(result.response, result.payload)) throw new CjQuotaError(result.detail);
    }

    throw new CjRequestError(result.detail);
  }
}

export function createCjClient(options?: { minimumPointsReserve?: number }) {
  return new CjClient(options?.minimumPointsReserve);
}
