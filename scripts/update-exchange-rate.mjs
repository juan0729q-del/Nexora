import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { selectOfficialExchangeRate } from "../src/lib/official-exchange-rate.ts";

const sourceUrl = "https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=10&$order=vigenciadesde%20DESC";
const targetPath = path.resolve("src/data/exchange-rate.json");

const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json", "User-Agent": "Nexora-TRM-Updater/1.0" } });
if (!response.ok) throw new Error(`Datos Abiertos respondió HTTP ${response.status}.`);
const rows = await response.json();
if (!Array.isArray(rows) || !rows.length) throw new Error("Datos Abiertos no devolvió registros de TRM.");

const row = selectOfficialExchangeRate(rows);
const { copPerUsd, effectiveTo } = row;
const next = {
  copPerUsd,
  updatedAt: `${row.effectiveFrom}T00:00:00-05:00`,
  source: "Superintendencia Financiera de Colombia via Datos Abiertos Colombia",
  sourceUrl: "https://www.datos.gov.co/resource/32sa-8pi3.json",
  effectiveFrom: row.effectiveFrom,
  effectiveTo,
};

const current = JSON.parse(await readFile(targetPath, "utf8"));
if (JSON.stringify(current) === JSON.stringify(next)) {
  console.log(`TRM sin cambios: ${copPerUsd} COP/USD (${row.effectiveFrom}).`);
} else {
  await writeFile(targetPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(`TRM actualizada: ${copPerUsd} COP/USD (${row.effectiveFrom}).`);
}
