import type { Market } from "../i18n/config";
import type { SupplierSource } from "./types";

/** Mantiene la curaduría dentro de cada proveedor y nunca elimina productos. */
export function prioritizeSuppliers<T extends { supplier: { source?: SupplierSource } }>(products: readonly T[], market: Market): T[] {
  const rank = market === "co"
    ? ({ rocketfy: 0, dropi: 1, cj: 2 } satisfies Record<SupplierSource, number>)
    : ({ cj: 0, rocketfy: 1, dropi: 2 } satisfies Record<SupplierSource, number>);
  return products.map((product, index) => ({ product, index }))
    .sort((a, b) => rank[a.product.supplier.source ?? "cj"] - rank[b.product.supplier.source ?? "cj"] || a.index - b.index)
    .map(({ product }) => product);
}
