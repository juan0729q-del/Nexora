import type { Market } from "../i18n/config";
import type { SupplierSource } from "./types";

/** Mantiene la curaduría dentro de cada proveedor y nunca elimina productos. */
export function prioritizeSuppliers<T extends { supplier: { source?: SupplierSource } }>(products: readonly T[], market: Market): T[] {
  const preferred: SupplierSource = market === "co" ? "dropi" : "cj";
  return [...products.filter((product) => (product.supplier.source ?? "cj") === preferred),
    ...products.filter((product) => (product.supplier.source ?? "cj") !== preferred)];
}
