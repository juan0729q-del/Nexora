/** Select the official validity interval using Colombia's calendar date. */
export function selectOfficialExchangeRate(rows: unknown, now = new Date()) {
  if (!Array.isArray(rows)) throw new Error("Datos Abiertos no devolvió registros de TRM.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const candidates = rows.map((entry) => ({
    copPerUsd: Number(entry.valor),
    effectiveFrom: String(entry.vigenciadesde || "").slice(0, 10),
    effectiveTo: String(entry.vigenciahasta || entry.vigenciadesde || "").slice(0, 10),
  })).filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.effectiveFrom) && /^\d{4}-\d{2}-\d{2}$/.test(row.effectiveTo)
    && row.effectiveFrom <= today && row.effectiveTo >= today)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const row = candidates[0];
  if (!row) throw new Error("No existe una TRM oficial vigente para la fecha de Colombia.");
  if (!Number.isFinite(row.copPerUsd) || row.copPerUsd < 1000 || row.copPerUsd > 10000) throw new Error("La TRM oficial quedó fuera del rango de seguridad.");
  return row;
}
