import "server-only";

import { dropiRequestUrl } from "@/lib/suppliers/dropi-config";

export type DropiFailureMetadata = {
  code?: number;
  message?: string;
};

export class DropiRequestError extends Error {
  readonly code?: number;

  constructor(message: string, metadata: DropiFailureMetadata = {}) {
    super(message);
    this.name = new.target.name;
    this.code = metadata.code;
  }
}

export class DropiAuthenticationError extends DropiRequestError {}

function getIntegrationKey() {
  const value = process.env.DROPI_INTEGRATION_KEY?.trim() || process.env.DROPI_API_KEY?.trim();
  if (!value) throw new DropiAuthenticationError("Falta DROPI_INTEGRATION_KEY en la configuración.");
  return value;
}

function requestTimeout() {
  const configured = Number(process.env.DROPI_REQUEST_TIMEOUT_MS || 12000);
  return Math.min(30000, Math.max(2000, Number.isFinite(configured) ? configured : 12000));
}

export class DropiClient {
  private async request(path: string, init?: RequestInit) {
    const url = dropiRequestUrl(path);
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");
    headers.set("dropi-integration-key", getIntegrationKey());
    
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        headers,
        signal: init?.signal || AbortSignal.timeout(requestTimeout()),
        cache: "no-store",
        redirect: "error",
      });
    } catch (error) {
      const reason = error instanceof Error && error.name === "TimeoutError" ? "Dropi agotó el tiempo de espera." : "No fue posible contactar la API de Dropi.";
      throw new DropiRequestError(reason);
    }
    
    if (!response.ok) {
      let message = `Dropi respondió con estado ${response.status}.`;
      try {
        const errorData = await response.json();
        if (errorData?.message) message = `Dropi rechazó la solicitud: ${errorData.message}`;
      } catch {
        // Ignorar si no se puede parsear JSON del error
      }
      
      if (response.status === 401 || response.status === 403) {
        throw new DropiAuthenticationError(message);
      }
      throw new DropiRequestError(message, { code: response.status });
    }
    
    let result;
    try {
      result = await response.json();
    } catch {
      throw new DropiRequestError("Dropi devolvió una respuesta que no es JSON válido.");
    }
    if (result?.isSuccess === false || result?.success === false) throw new DropiRequestError("Dropi rechazó la operación.", { code: result.status });
    return result;
  }

  async getJson<T>(path: string, init?: RequestInit): Promise<T> {
    const result = await this.request(path, { ...init, method: "GET" });
    return result as T;
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    const result = await this.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return result as T;
  }
}

export function createDropiClient() {
  return new DropiClient();
}
