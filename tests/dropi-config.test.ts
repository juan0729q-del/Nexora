import assert from "node:assert/strict";
import test from "node:test";
import { dropiBaseUrl, dropiRequestUrl } from "../src/lib/suppliers/dropi-config";

test("Dropi defaults to test and rejects mismatched hosts and traversal", () => {
  assert.equal(dropiBaseUrl({}), "https://test-api.dropi.co/integrations");
  assert.equal(dropiRequestUrl("/products", { DROPI_ENVIRONMENT: "production" }), "https://api.dropi.co/integrations/products");
  for (const url of ["http://api.dropi.co/integrations", "https://evil.example/integrations", "https://api.dropi.co/integrations"]) {
    assert.throws(() => dropiBaseUrl({ DROPI_API_BASE_URL: url }));
  }
  assert.throws(() => dropiRequestUrl("/../orders", {}));
  assert.throws(() => dropiBaseUrl({ DROPI_ENVIRONMENT: "prodution" }));
});
