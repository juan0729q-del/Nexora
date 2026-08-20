import "server-only";

import exchangeRateDocument from "@/data/exchange-rate.json";
import type { Market } from "@/lib/i18n/config";
import { getMarketPaymentProvider } from "@/lib/payments/market-provider";

const maximumRateAgeDays = 7;

export type ExchangeRateSnapshot = {
  copPerUsd: number | null;
  updatedAt: string | null;
  valid: boolean;
  stale: boolean;
  source: "environment" | "versioned-official" | "unconfigured";
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

  if (validRate && validDate && !stale) {
    return {
      copPerUsd: rate,
      updatedAt: new Date(updatedAtMs).toISOString(),
      valid: true,
      stale: false,
      source: "environment",
      detail: "Tasa COP por USD configurada manualmente y dentro de su ventana de vigencia.",
    };
  }

  const versionedRate = Number(exchangeRateDocument.copPerUsd);
  const versionedAtMs = Date.parse(exchangeRateDocument.updatedAt);
  const versionedRateValid = Number.isFinite(versionedRate) && versionedRate >= 1_000 && versionedRate <= 10_000;
  const versionedDateValid = Number.isFinite(versionedAtMs) && versionedAtMs <= now + 5 * 60_000;
  const versionedStale = versionedDateValid ? now - versionedAtMs > maximumRateAgeDays * 86_400_000 : true;
  if (versionedRateValid && versionedDateValid) {
    return {
      copPerUsd: versionedRate,
      updatedAt: new Date(versionedAtMs).toISOString(),
      valid: !versionedStale,
      stale: versionedStale,
      source: "versioned-official",
      detail: versionedStale
        ? `La TRM oficial versionada tiene más de ${maximumRateAgeDays} días; la automatización debe actualizarla antes de nuevos cobros.`
        : `TRM oficial versionada (${exchangeRateDocument.effectiveFrom}) obtenida de Datos Abiertos Colombia.`,
    };
  }

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

  return { copPerUsd: rate, updatedAt: new Date(updatedAtMs).toISOString(), valid: false, stale: true, source: "environment", detail: `La tasa configurada tiene más de ${maximumRateAgeDays} días.` };
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
