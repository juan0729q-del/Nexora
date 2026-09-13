import assert from "node:assert/strict";
import test from "node:test";
import { prioritizeSuppliers } from "../src/lib/suppliers/market-priority";
import { marketFromCountry } from "../src/lib/i18n/config";
import type { SupplierSource } from "../src/lib/suppliers/types";

const products: { sku: string; supplier: { source?: SupplierSource } }[] = [
  { sku: "international-promoted", supplier: {} },
  { sku: "local-promoted", supplier: { source: "dropi" } },
  { sku: "international", supplier: { source: "cj" } },
  { sku: "local", supplier: { source: "dropi" } },
];

test("Colombia prioriza Dropi, conserva CJ y la curaduría de cada proveedor", () => {
  const original = structuredClone(products);
  assert.deepEqual(prioritizeSuppliers(products, marketFromCountry("CO")).map(p => p.sku), ["local-promoted", "local", "international-promoted", "international"]);
  assert.deepEqual(products, original);
});

test("Estados Unidos prioriza CJ; catálogo legado y vacío siguen funcionando", () => {
  assert.deepEqual(prioritizeSuppliers(products, marketFromCountry("US")).map(p => p.sku), ["international-promoted", "international", "local-promoted", "local"]);
  assert.deepEqual(prioritizeSuppliers([], "co"), []);
  assert.deepEqual(prioritizeSuppliers(products.filter(p => p.supplier.source !== "dropi"), "co").map(p => p.sku), ["international-promoted", "international"]);
});
