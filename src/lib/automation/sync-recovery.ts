import type { InventoryUpdate } from "./inventory-sync-policy";

export type SyncPayload = { updates?: InventoryUpdate[]; baseVersion?: number; complete?: boolean; retryable?: boolean; missingSkus?: string[]; products?: unknown[]; message?: string };
export type SyncAttempt = { status: number; payload: SyncPayload };

/** Máximo tres lecturas; nunca se aplica a pedidos ni pagos. */
export async function recoverCatalogRead(request: () => Promise<SyncAttempt>, wait: (ms: number) => Promise<void>, expectedSkus?: string[]) {
  const updates = new Map<string, InventoryUpdate>();
  let baseVersion: number | undefined;
  let last: SyncAttempt = { status: 503, payload: { message: "Sin respuesta del proveedor." } };
  for (let attempt = 0; attempt < 3; attempt++) {
    try { last = await request(); } catch { last = { status: 503, payload: { message: "Fallo temporal de conexión." } }; }
    if (expectedSkus && last.payload.updates && typeof last.payload.baseVersion === "number") {
      if (baseVersion !== undefined && baseVersion !== last.payload.baseVersion) throw new Error("La versión cambió durante la sincronización.");
      baseVersion = last.payload.baseVersion;
      for (const update of last.payload.updates) if (expectedSkus.includes(update.sku)) updates.set(update.sku, update);
      const missingSkus = expectedSkus.filter(sku => !updates.has(sku));
      if (!missingSkus.length) return { status: 200, payload: { baseVersion, complete: true, missingSkus, updates: [...updates.values()] } };
    } else if (last.status >= 200 && last.status < 300) return last;
    const retryable = [409, 429, 500, 502, 503, 504].includes(last.status) || (last.status === 200 && last.payload.complete === false);
    if (!retryable || last.payload.retryable === false || attempt === 2) break;
    await wait(60_000 * (attempt + 1));
  }
  if (updates.size) return { status: 200, payload: { baseVersion, complete: false, updates: [...updates.values()], missingSkus: expectedSkus!.filter(sku => !updates.has(sku)) } };
  return last;
}
