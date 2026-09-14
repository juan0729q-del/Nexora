import type { Product } from "../products";

export type InventoryUpdate = { sku: string; stock: number; verifiedAt: string };

/** Ausencia de datos no significa inventario agotado. Exige cantidades explícitas. */
export function parseOfficialStock(payload: unknown): number | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const response = payload as Record<string, unknown>;
  const data = response.data;
  const container = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : response;
  const items = Array.isArray(data) ? data : container.inventories ?? container.content ?? container.list ?? container.records ?? container.items ?? container.products;
  if (!Array.isArray(items) || !items.length) return undefined;
  let total = 0;
  for (const item of items) {
    if (!item || typeof item !== "object") return undefined;
    const value = item.totalInventoryNum ?? item.totalInventory ?? item.warehouseInventoryNum ?? item.stock ?? item.quantity ?? item.inventory;
    if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && !value.trim())) return undefined;
    const stock = Number(value);
    if (!Number.isSafeInteger(stock) || stock < 0 || !Number.isSafeInteger(total + stock)) return undefined;
    total += stock;
  }
  return total;
}

export function applyInventoryUpdates<T extends { version: number; importedAt: string | null; products: Product[] }>(catalog: T, updates: InventoryUpdate[], baseVersion: number) {
  if (baseVersion !== catalog.version) throw new Error("La versión consultada no coincide con el catálogo actual; vuelve a sincronizar.");
  const cj = catalog.products.filter(product => (product.supplier.source ?? "cj") === "cj");
  const allowed = new Set(cj.map(product => product.sku));
  const bySku = new Map<string, InventoryUpdate>();
  for (const update of updates) {
    if (!allowed.has(update.sku) || bySku.has(update.sku) || !Number.isSafeInteger(update.stock) || update.stock < 0 || !Number.isFinite(Date.parse(update.verifiedAt))) throw new Error("Actualización de inventario inválida o duplicada.");
    bySku.set(update.sku, update);
  }
  if (!bySku.size) throw new Error("No hay inventario confirmado para publicar.");
  const missingSkus = cj.filter(product => !bySku.has(product.sku)).map(product => product.sku);
  const verifiedAt = updates.map(update => update.verifiedAt).sort().at(-1)!;
  return {
    ...catalog,
    version: catalog.version + 1,
    importedAt: missingSkus.length ? catalog.importedAt : verifiedAt,
    stockSync: { verifiedAt, complete: !missingSkus.length, verifiedCount: bySku.size, totalCount: cj.length, missingSkus },
    products: catalog.products.map(product => {
      const update = bySku.get(product.sku);
      return update ? { ...product, stock: update.stock, stockVerifiedAt: update.verifiedAt } : product;
    }),
  };
}
