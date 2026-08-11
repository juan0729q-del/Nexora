import "server-only";

import type { MarketSignal } from "../types";

const endpoint = "https://api.gdeltproject.org/api/v2/doc/doc";

function totalTimelineVolume(value: unknown) {
  if (!value || typeof value !== "object") return 0;
  const data = value as { timeline?: Array<{ data?: Array<{ value?: unknown }> }> };
  return (data.timeline || []).flatMap((entry) => entry.data || []).reduce((sum, entry) => {
    const amount = Number(entry.value);
    return sum + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
  }, 0);
}

/** Sensor contextual público: mide presencia reciente en noticias, no ventas. */
export async function queryGdeltSignal(query: string): Promise<MarketSignal> {
  const observedAt = new Date().toISOString();
  const url = new URL(endpoint);
  url.searchParams.set("query", `\"${query.replace(/[\"<>]/g, "").slice(0, 80)}\"`);
  url.searchParams.set("mode", "timelinevolraw");
  url.searchParams.set("format", "json");
  url.searchParams.set("timespan", "3months");
  try {
    const response = await fetch(url, { headers: { "User-Agent": "NexoraMarketIntelligence/1.0" }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const volume = totalTimelineVolume(await response.json());
    return {
      source: "gdelt",
      query,
      market: "global",
      score: Math.min(100, Math.round(Math.log10(volume + 1) * 24)),
      observedAt,
      detail: `${Math.round(volume)} menciones agregadas en la ventana consultada; es contexto editorial, no unidades vendidas.`,
      available: true,
    };
  } catch {
    return { source: "gdelt", query, market: "global", score: 0, observedAt, detail: "GDELT no estuvo disponible; Nexora conserva sus datos propios y no interpreta la ausencia como falta de demanda.", available: false };
  }
}
