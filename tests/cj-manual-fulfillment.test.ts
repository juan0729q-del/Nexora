import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("la creación manual CJ usa una sola solicitud y nunca cobra ni despacha", async () => {
  const route = await source("src/app/api/admin/sales/orders/cj/route.ts");
  const builder = await source("src/lib/fulfillment/cj-order.ts");
  const client = await source("src/lib/automation/cj-client.ts");
  assert.match(route, /body\.confirm !== true/);
  assert.match(route, /fulfillmentStatus\.trim\(\)\.toUpperCase\(\) !== "PAGO CONFIRMADO"/);
  assert.match(route, /CREACIÓN CJ EN CURSO/);
  assert.match(route, /postJsonOnce/);
  assert.match(builder, /payType: 3/);
  assert.match(builder, /orderFlow: 1/);
  const once = client.slice(client.indexOf("async postJsonOnce"), client.indexOf("export function createCjClient"));
  assert.doesNotMatch(once, /renewSession\(/);
  assert.doesNotMatch(once, /retryAfterMilliseconds\(/);
});

test("la lectura para CJ permanece firmada en Apps Script y no se publica por GET", async () => {
  const appsScript = await source("docs/google-apps-script/Code.gs");
  const ledger = await source("src/lib/sales-ledger.ts");
  assert.match(appsScript, /input\.action === "sales\.order\.fulfillment\.read"/);
  assert.match(appsScript, /function readSalesOrderForFulfillment_/);
  assert.match(appsScript, /Artículos JSON/);
  assert.match(ledger, /action: "sales\.order\.fulfillment\.read"/);
  const getHandler = appsScript.slice(appsScript.indexOf("function doGet"), appsScript.indexOf("function workbookReady_"));
  assert.doesNotMatch(getHandler, /fulfillment\.read/);
});

test("la interfaz exige confirmación humana para crear en CJ sin pago", async () => {
  const table = await source("src/components/admin/sales-order-table.tsx");
  assert.match(table, /window\.confirm/);
  assert.match(table, /Crear pedido en CJ \(sin pagar\)/);
  assert.match(table, /No reintentes: busca la referencia Nexora en MyCJ/);
});
