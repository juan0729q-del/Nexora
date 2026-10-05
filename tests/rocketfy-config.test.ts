import assert from "node:assert/strict";
import test from "node:test";
import { rocketfyBaseUrl, rocketfyCommerceEnabled, rocketfyRequestUrl } from "../src/lib/suppliers/rocketfy-config";

test("Rocketfy usa únicamente el host y las operaciones públicas verificadas", () => {
  assert.equal(rocketfyBaseUrl({}), "https://api.rocketfy.co");
  assert.equal(rocketfyRequestUrl("/api/public/calculateShipping", {}), "https://api.rocketfy.co/api/public/calculateShipping");
  for (const base of ["http://api.rocketfy.co", "https://evil.example", "https://api.rocketfy.co/api/public"]) {
    assert.throws(() => rocketfyBaseUrl({ ROCKETFY_API_BASE_URL: base }));
  }
  assert.throws(() => rocketfyRequestUrl("/api/public/deleteOrder", {}));
});

test("el comercio local permanece cerrado salvo activación explícita", () => {
  assert.equal(rocketfyCommerceEnabled({}), false);
  assert.equal(rocketfyCommerceEnabled({ ROCKETFY_LOCAL_COMMERCE_ENABLED: "true" }), true);
  assert.equal(rocketfyCommerceEnabled({ ROCKETFY_LOCAL_COMMERCE_ENABLED: "TRUE" }), true);
  assert.equal(rocketfyCommerceEnabled({ ROCKETFY_LOCAL_COMMERCE_ENABLED: "1" }), false);
});
