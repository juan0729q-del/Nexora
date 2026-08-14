import "server-only";

import type { Market } from "@/lib/i18n/config";
import { getMarketPaymentProvider } from "@/lib/payments/market-provider";

const maximumRateAgeDays = 7;

export type ExchangeRateSnapshot = {
  copPerUsd: number | null;
  updatedAt: string | null;
  valid: boolean;
  stale: boolean;
  source: "environment" | "unconfigured";
  detail: string;
};

export function getExchangeRateSnapshot(now = Date.now()): ExchangeRateSnapshot {
  const rawRate = process.env.USD_TO_COP_RATE?.trim();
  const rawUpdatedAt = process.env.USD_TO_COP_RATE_UPDATED_AT?.trim();
  const rate = Number(rawRate);
  const updatedAtMs = rawUpdatedAt ? Date.parse(rawUpdatedAt) : NaN;
  const validRate = Number.isFinite(rate) && rate >= 1_000 && rate <= 10_000;
  const validDate = Number.isFinite(updatedAtMs) && updatedAtMs <= now + 5 * 60_000;
  const stale = validDate ? now - updatedAtMs > maximumRateAgeDays * 86_400_000 : true;

  if (!validRate || !validDate) {
    return {
      copPerUsd: null,
      updatedAt: null,
      valid: false,
      stale: true,
      source: "unconfigured",
      detail: "Configura USD_TO_COP_RATE y USD_TO_COP_RATE_UPDATED_AT con una tasa aprobada y fecha ISO vigente.",
    };
  }

  return {
    copPerUsd: rate,
    updatedAt: new Date(updatedAtMs).toISOString(),
    valid: !stale,
    stale,
    source: "environment",
    detail: stale
      ? `La tasa tiene más de ${maximumRateAgeDays} días y debe actualizarse antes de habilitar cobros en USD.`
      : "Tasa COP por USD configurada manualmente y dentro de su ventana de vigencia.",
  };
}

export function marketPriceFromCop(priceCop: number, market: Market, snapshot = getExchangeRateSnapshot()) {
  if (market === "co") return { amount: priceCop, currency: "COP" as const, exchangeRateCopPerUsd: 1, rateUpdatedAt: null };
  if (!snapshot.valid || !snapshot.copPerUsd) return null;
  return {
    amount: Math.round((priceCop / snapshot.copPerUsd) * 100) / 100,
    currency: "USD" as const,
    exchangeRateCopPerUsd: snapshot.copPerUsd,
    rateUpdatedAt: snapshot.updatedAt,
  };
}

export function getMarketCommerceReadiness(market: Market) {
  const exchangeRate = getExchangeRateSnapshot();
  const provider = getMarketPaymentProvider(market);
  const checkoutEnabled = provider.checkoutEnabled && exchangeRate.valid;
  return {
    market,
    currency: provider.currency,
    paymentProvider: provider.id === "unconfigured" ? null : provider.id,
    paymentConfigured: provider.configured,
    checkoutEnabled,
    exchangeRate,
    reason: provider.reason || (!exchangeRate.valid ? exchangeRate.detail : null),
  };
}
