import assert from "node:assert/strict";
import test from "node:test";
import { selectOfficialExchangeRate } from "../src/lib/official-exchange-rate";

test("TRM uses Colombia date across UTC midnight and rejects expired intervals", () => {
  const rows = [
    { valor: 3200, vigenciadesde: "2026-09-13", vigenciahasta: "2026-09-13" },
    { valor: 3100, vigenciadesde: "2026-09-12", vigenciahasta: "2026-09-12" },
  ];
  assert.equal(selectOfficialExchangeRate(rows, new Date("2026-09-13T02:00:00Z")).copPerUsd, 3100);
  assert.throws(() => selectOfficialExchangeRate(rows, new Date("2026-09-14T15:00:00Z")), /vigente/);
  assert.throws(() => selectOfficialExchangeRate([{ valor: NaN, vigenciadesde: "2026-09-12", vigenciahasta: "2026-09-12" }], new Date("2026-09-12T15:00:00Z")), /rango/);
});
