import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const sourceUrl = "https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=10&$order=vigenciadesde%20DESC";
const targetPath = path.resolve("src/data/exchange-rate.json");

function isoDate(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error("La TRM oficial no contiene una fecha válida.");
  return new Date(parsed).toISOString().slice(0, 10);
}

const response = await fetch(sourceUrl, { headers: { Accept: "application/json", "User-Agent": "Nexora-TRM-Updater/1.0" } });
if (!response.ok) throw new Error(`Datos Abiertos respondió HTTP ${response.status}.`);
const rows = await response.json();
if (!Array.isArray(rows) || !rows.length) throw new Error("Datos Abiertos no devolvió registros de TRM.");

const today = new Date().toISOString().slice(0, 10);
const row = rows
  .map((entry) => ({ entry, effectiveFrom: isoDate(entry.vigenciadesde) }))
  .filter(({ effectiveFrom }) => effectiveFrom <= today)
  .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0];
if (!row) throw new Error("No existe una TRM oficial vigente que no esté en el futuro.");

const copPerUsd = Number(row.entry.valor);
if (!Number.isFinite(copPerUsd) || copPerUsd < 1_000 || copPerUsd > 10_000) throw new Error("La TRM oficial quedó fuera del rango de seguridad.");
const effectiveTo = isoDate(row.entry.vigenciahasta || row.entry.vigenciadesde);
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
