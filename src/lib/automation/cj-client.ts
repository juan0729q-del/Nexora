import "server-only";

const cjOrigin = "https://developers.cjdropshipping.com";
const tokenEndpoint = "/api2.0/v1/authentication/getAccessToken";
const refreshEndpoint = "/api2.0/v1/authentication/refreshAccessToken";

type CjEnvelope<T> = {
  code?: number;
  result?: boolean;
  success?: boolean;
  message?: string;
  requestId?: string;
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

export type CjSession = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiryDate?: string;
};

let loggedLegacyCredentialName = false;

export function getCjCredentialConfiguration() {
  const apiKey = process.env.CJ_DROPSHIPPING_API_KEY?.trim();
  const legacyApiKey = process.env.CJ_DROPSHIPPING_API_TOKEN?.trim();
  return {
    configured: Boolean(apiKey || legacyApiKey),
    usingLegacyName: !apiKey && Boolean(legacyApiKey),
  };
}

function apiKey() {
  const preferred = process.env.CJ_DROPSHIPPING_API_KEY?.trim();
  if (preferred) return preferred;
  const value = process.env.CJ_DROPSHIPPING_API_TOKEN?.trim();
  if (!value) throw new CjAuthenticationError("Falta CJ_DROPSHIPPING_API_KEY. Nexora ya no acepta un access token fijo como credencial de CJ.");
  if (!loggedLegacyCredentialName) {
    console.warn("CJ_DROPSHIPPING_API_TOKEN is deprecated. Rename it to CJ_DROPSHIPPING_API_KEY after confirming it is a CJ API Key.");
    loggedLegacyCredentialName = true;
  }
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
  if ([1600004, 1600005, 1600006, 1600200, 1600300, 16900500].includes(payload?.code || 0)) return false;
  if (response.status === 401 || response.status === 403) return true;
  if (payload?.code === 1600001 || payload?.code === 1600002 || payload?.code === 1600003) return true;
  return /(?:access\s*token|refresh\s*token|authentication|api\s*key)/i.test(payload?.message || "");
}

function responseDetail(response: Response, payload: CjEnvelope<unknown> | undefined, raw: string) {
  const message = payload?.message || raw.replace(/\s+/g, " ").slice(0, 180) || "sin detalle";
  return `CJ respondió ${response.status}${payload?.code !== undefined ? ` (código ${payload.code})` : ""}: ${message}`;
}

async function parseResponse(response: Response): Promise<CjResponse> {
  const raw = await response.text();
  let payload: CjEnvelope<unknown> | undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") payload = parsed as CjEnvelope<unknown>;
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

function canRetryWithNewToken(init?: RequestInit) {
  const method = init?.method?.toUpperCase() || "GET";
  return method === "GET" || method === "HEAD";
}

/**
 * Cliente efímero por ejecución. Autentica con la API key antes de cualquier
 * importación/consulta y comparte una sola sesión entre las peticiones del
 * mismo trabajo para respetar el límite de CJ. Ante un 401/403 o código de
 * autenticación, refresca una vez y repite exclusivamente la petición fallida.
 */
export class CjClient {
  private sessionPromise: Promise<CjSession> | undefined;
  private refreshPromise: Promise<CjSession> | undefined;

  private async authenticateWithApiKey() {
    const response = await this.fetchCj(`${cjOrigin}${tokenEndpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ apiKey: apiKey() }),
      cache: "no-store",
    });
    const parsed = await parseResponse(response);
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
    if (!isSuccessful(parsed.response, parsed.payload) || !parsed.payload) {
      if (!isAuthenticationFailure(parsed.response, parsed.payload)) throw new CjRequestError(`CJ no pudo renovar el access token. ${parsed.detail}`);
      throw new CjAuthenticationError(`CJ no pudo renovar el access token. ${parsed.detail}`);
    }
    return tokenFrom(parsed.payload, "refreshAccessToken");
  }

  private getSession() {
    if (!this.sessionPromise) {
      this.sessionPromise = this.authenticateWithApiKey().catch((error) => {
        this.sessionPromise = undefined;
        throw error;
      });
    }
    return this.sessionPromise;
  }

  private async renewSession(previous: CjSession) {
    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        if (previous.refreshToken) {
          try {
            return await this.refreshAccessToken(previous.refreshToken);
          } catch (error) {
            if (!(error instanceof CjAuthenticationError)) throw error;
          }
        }
        // Si el refresh token venció o CJ lo revocó, la API key crea una nueva sesión.
        return this.authenticateWithApiKey();
      })().finally(() => {
        this.refreshPromise = undefined;
      });
    }
    const renewed = await this.refreshPromise;
    this.sessionPromise = Promise.resolve(renewed);
    return renewed;
  }

  private async request(url: string, accessToken: string, init?: RequestInit) {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    headers.set("CJ-Access-Token", accessToken);
    return parseResponse(await this.fetchCj(officialCjUrl(url), {
      ...init,
      headers,
      cache: "no-store",
    }));
  }

  private async fetchCj(url: string, init: RequestInit) {
    try {
      return await fetch(url, { ...init, signal: init.signal || AbortSignal.timeout(requestTimeout()) });
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError" ? "CJ agotó el tiempo de espera." : "No fue posible contactar la API de CJ.";
      throw new CjRequestError(reason);
    }
  }

  async getJson<T>(url: string, init?: RequestInit): Promise<T> {
    const current = await this.getSession();
    let result = await this.request(url, current.accessToken, init);
    if (isSuccessful(result.response, result.payload)) return result.payload as T;

    if (canRetryWithNewToken(init) && isAuthenticationFailure(result.response, result.payload)) {
      const renewed = await this.renewSession(current);
      result = await this.request(url, renewed.accessToken, init);
      if (isSuccessful(result.response, result.payload)) return result.payload as T;
    }

    throw new CjRequestError(result.detail);
  }
}

export function createCjClient() {
  return new CjClient();
}
