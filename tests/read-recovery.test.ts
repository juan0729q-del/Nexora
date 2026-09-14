import assert from "node:assert/strict";
import test from "node:test";
import { recoverRead } from "../src/lib/read-recovery";

test("la lectura recupera un fallo transitorio sin cambiar el resultado", async () => {
  let calls = 0;
  const result = await recoverRead(async () => {
    if (++calls === 1) throw new Error("temporal");
    return { paused: ["sku"] };
  }, () => true);
  assert.equal(calls, 2);
  assert.deepEqual(result, { paused: ["sku"] });
});

test("la lectura termina tras dos fallos y no reintenta rechazos permanentes", async () => {
  for (const retryable of [false, true]) {
    let calls = 0;
    await assert.rejects(recoverRead(async () => { calls++; throw new Error("sin datos"); }, () => retryable));
    assert.equal(calls, retryable ? 2 : 1);
  }
});
