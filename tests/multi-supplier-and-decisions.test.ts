import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import catalog from "../src/data/catalog.json";
import { getCatalogDecision, isValidCatalogProduct, type Product } from "../src/lib/products";
import { supplierCostUsdForVariant } from "../src/lib/pricing-policy";
import { applyExecutedCatalogDecisions } from "../src/lib/intelligence/catalog-overlay";
import type { IntelligenceProposal } from "../src/lib/intelligence/types";
import { effectiveIntelligenceProposalStatus } from "../src/lib/intelligence/status";

test("supplier validation keeps legacy CJ and isolates Dropi hosts and COP costs", () => {
  const cj = structuredClone(catalog.products[0]) as Product;
  assert.equal(isValidCatalogProduct(cj), true);
  const image = { src: "https://cdn.dropi.co/test-only.jpg", alt: "Test fixture", source: "provider" as const };
  const local: Product = { ...cj, image, images: [image], variants: [{ sku: "DROP-TEST", label: "Test fixture", image, supplierCostCop: 12000 }], supplier: { name: "Dropi", source: "dropi", sourcePage: "Test fixture", sourceUrl: "https://api.dropi.co/integrations/products/v2/1", reference: "1", costCop: 10000, costUsd: 0 } };
  assert.equal(isValidCatalogProduct(local), true);
  assert.equal(supplierCostUsdForVariant(local, "DROP-TEST", 3000), 4);
  assert.equal(supplierCostUsdForVariant(local, "DROP-TEST", 4000), 3);
  assert.equal(isValidCatalogProduct({ ...local, supplier: { ...local.supplier, costCop: 0 } }), false);
  assert.equal(isValidCatalogProduct({ ...local, image: cj.image, images: cj.images }), false);
  assert.equal(isValidCatalogProduct({ ...local, supplier: { ...local.supplier, sourceUrl: "https://evil.example/products/1" } }), false);
  assert.equal(isValidCatalogProduct({ ...cj, supplier: { ...cj.supplier, source: "unknown" } }), false);
});

test("latest executed decision reverses a pause and monitoring changes operational state", () => {
  const product = { ...catalog.products[0], active: true, stock: 20 } as Product;
  const decision = (action: IntelligenceProposal["action"], at: string, status = "executed") => ({ id: at, targetSku: product.sku, action, status, decidedAt: at }) as IntelligenceProposal;
  const old = decision("pause_product", "2026-09-10T00:00:00Z");
  const newer = decision("promote_product", "2026-09-11T00:00:00Z");
  assert.equal(applyExecutedCatalogDecisions([product], [newer, old])[0].active, true);
  assert.equal(applyExecutedCatalogDecisions([product], [old, { ...newer, status: "authorized" }])[0].active, false);
  const monitored = applyExecutedCatalogDecisions([product], [old, decision("monitor_product", "2026-09-12T00:00:00Z")])[0];
  assert.equal(getCatalogDecision(monitored), "monitor");
  assert.equal(getCatalogDecision({ ...monitored, stock: 1 }), "pause");
});

test("authorized intelligence decisions reconcile execution markers and expire stale retries", () => {
  const future = "2099-01-01T00:00:00Z";
  const past = "2020-01-01T00:00:00Z";
  assert.equal(effectiveIntelligenceProposalStatus("authorized", "[NEXORA_EXECUTED_V1] applied", past), "executed");
  assert.equal(effectiveIntelligenceProposalStatus("authorized", "[NEXORA_EXECUTION_FAILED_V1] temporary", future), "authorized");
  assert.equal(effectiveIntelligenceProposalStatus("authorized", "autorizado", past), "expired");
  assert.equal(effectiveIntelligenceProposalStatus("rejected", undefined, past), "rejected");
});

test("unverified Dropi fulfillment and freight cannot create orders or fabricate charges", async () => {
  const route = await readFile(new URL("../src/app/api/admin/sales/orders/dropi/route.ts", import.meta.url), "utf8");
  const shipping = await readFile(new URL("../src/lib/shipping/dropi-shipping.ts", import.meta.url), "utf8");
  assert.match(route, /await isAdmin\(\)/);
  assert.match(route, /body\.confirm !== true/);
  assert.match(route, /created: false/);
  assert.doesNotMatch(route, /postJson|updateFulfillment|fetch\(/);
  assert.match(shipping, /throw new DropiRequestError/);
  assert.doesNotMatch(shipping, /13500|4000|randomUUID/);
});
