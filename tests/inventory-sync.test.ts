import assert from "node:assert/strict";
import test from "node:test";
import catalogDocument from "../src/data/catalog.json";
import type { Product } from "../src/lib/products";
import { applyInventoryUpdates, parseOfficialStock } from "../src/lib/automation/inventory-sync-policy";
import { recoverCatalogRead } from "../src/lib/automation/sync-recovery";

const verifiedAt = "2026-09-13T20:00:00.000Z";
const catalog = { ...catalogDocument, products: structuredClone(catalogDocument.products) as Product[] };

test("inventario vacío, malformado o parcial no se convierte en cero", () => {
  for (const payload of [null, {}, { data: [] }, { data: {} }, { data: [{ stock: null }] }, { data: [{ stock: "" }] }, { data: [{ stock: false }] }, { data: [{ stock: -1 }] }, { data: [{ stock: 5 }, {}] }]) assert.equal(parseOfficialStock(payload), undefined);
  assert.equal(parseOfficialStock({ data: [{ stock: 0 }] }), 0);
  assert.equal(parseOfficialStock({ data: { inventories: [{ totalInventoryNum: "7" }, { totalInventoryNum: 3 }] } }), 10);
});

test("una lectura parcial actualiza solo lo confirmado y conserva Dropi y métricas", () => {
  const local = { ...catalog.products[0], sku: "DROP-TEST", supplier: { ...catalog.products[0].supplier, source: "dropi" as const } };
  const before = { ...catalog, products: [...catalog.products, local] };
  const updated = applyInventoryUpdates(before, [{ sku: before.products[0].sku, stock: 0, verifiedAt }], before.version);
  assert.equal(updated.products[0].stock, 0);
  assert.deepEqual(updated.products[0].performance, before.products[0].performance);
  assert.deepEqual(updated.products.slice(1), before.products.slice(1));
  assert.equal(updated.importedAt, before.importedAt);
  assert.equal(updated.stockSync.complete, false);
  assert.equal(before.products[0].stock, catalog.products[0].stock);
});

test("la confirmación completa renueva la fecha incluso sin cambios de cantidades", () => {
  const updates = catalog.products.map(product => ({ sku: product.sku, stock: product.stock, verifiedAt }));
  const updated = applyInventoryUpdates(catalog, updates, catalog.version);
  assert.equal(updated.importedAt, verifiedAt);
  assert.equal(updated.version, catalog.version + 1);
  assert.equal(updated.stockSync.complete, true);
  assert.throws(() => applyInventoryUpdates(catalog, updates, catalog.version - 1), /versión/);
  assert.throws(() => applyInventoryUpdates(catalog, [...updates, updates[0]], catalog.version), /duplicada/);
  assert.throws(() => applyInventoryUpdates(catalog, [{ sku: "UNKNOWN", stock: 3, verifiedAt }], catalog.version), /inválida/);
});

test("la recuperación acotada combina lecturas parciales de la misma versión", async () => {
  let calls = 0;
  const waits: number[] = [];
  const result = await recoverCatalogRead(async () => {
    calls++;
    return { status: 200, payload: { baseVersion: 1, complete: false, updates: [{ sku: calls === 1 ? "A" : "B", stock: calls, verifiedAt }] } };
  }, async ms => { waits.push(ms); }, ["A", "B"]);
  assert.equal(result.payload.complete, true);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [60_000]);
  assert.deepEqual(result.payload.updates?.map(update => update.sku), ["A", "B"]);
});

test("los fallos permanentes no se reintentan y los temporales tienen límite", async () => {
  let calls = 0;
  const unavailable = await recoverCatalogRead(async () => { calls++; return { status: 503, payload: {} }; }, async () => {});
  assert.equal(calls, 3);
  assert.equal(unavailable.status, 503);
  calls = 0;
  await recoverCatalogRead(async () => { calls++; return { status: 401, payload: {} }; }, async () => {});
  assert.equal(calls, 1);
  calls = 0;
  await recoverCatalogRead(async () => { calls++; return { status: 503, payload: { retryable: false } }; }, async () => {});
  assert.equal(calls, 1);
});

test("un despliegue pendiente se recupera sin consultar una versión incompatible", async () => {
  let calls = 0;
  const result = await recoverCatalogRead(async () => (++calls === 1 ? { status: 409, payload: {} } : { status: 200, payload: { products: [{}] } }), async () => {});
  assert.equal(calls, 2);
  assert.equal(result.status, 200);
});
