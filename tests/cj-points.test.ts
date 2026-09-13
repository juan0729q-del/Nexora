import assert from "node:assert/strict";
import test from "node:test";
import { parseCjPoints, verifyCjPoints, type CjPointsSnapshot } from "../src/lib/automation/cj-points";

test("un cero previo se contrasta con ajustes antes de bloquear la importación", async () => {
  let state: CjPointsSnapshot = { points: { remaining: 0, total: 50000 }, observedAt: 1000 };
  let refreshes = 0;
  const result = await verifyCjPoints(() => state, async () => {
    refreshes++;
    state = { points: { usedToday: 20, remaining: 50000, total: 50000 }, observedAt: 1000 };
  }, 250, () => 1000);
  assert.equal(refreshes, 1);
  assert.equal(result?.remaining, 50000);
});

test("la cuota realmente agotada se conserva sin bucles ni saldo ficticio", async () => {
  const state = { points: { remaining: 0, total: 50000 }, observedAt: 1000 };
  let refreshes = 0;
  const result = await verifyCjPoints(() => state, async () => { refreshes++; }, 250, () => 1000);
  assert.equal(result?.remaining, 0);
  assert.equal(refreshes, 1);
});

test("un saldo antiguo se renueva y un saldo vigente suficiente no añade consultas", async () => {
  let state = { points: { remaining: 50000 }, observedAt: 1000 };
  let refreshes = 0;
  const refresh = async () => { refreshes++; state = { points: { remaining: 100 }, observedAt: 61000 }; };
  assert.equal((await verifyCjPoints(() => state, refresh, 250, () => 1001))?.remaining, 50000);
  assert.equal(refreshes, 0);
  assert.equal((await verifyCjPoints(() => state, refresh, 250, () => 61000))?.remaining, 100);
  assert.equal(refreshes, 1);
});

test("campos ausentes o inválidos nunca se convierten en cero", () => {
  for (const remaining of [undefined, null, "", "  ", false, true, [], {}, -1, Infinity, "NaN"]) {
    assert.equal(parseCjPoints({ remaining })?.remaining, undefined);
  }
  assert.equal(parseCjPoints({ remaining: "0" })?.remaining, 0);
  assert.equal(parseCjPoints({ remaining: 50000 })?.remaining, 50000);
});
