import "server-only";

import { queryGdeltSignal } from "./sources/gdelt";
import type { MarketSignal } from "./types";

const marketQueries = ["AI consumer electronics", "AI translator device", "smart home technology", "wellness technology"] as const;

export async function collectPublicMarketSignals(): Promise<MarketSignal[]> {
  // Serie corta y paralela: esta fuente nunca participa en checkout ni consume puntos CJ.
  return Promise.all(marketQueries.map(queryGdeltSignal));
}

