import "server-only";

import {
  estimateContribution,
  getFulfillmentReserveCop,
  getTargetContributionMargin,
  getWompiFeeConfiguration,
  recommendedPriceForContribution,
  usdToCop,
} from "@/lib/commerce-finance";
import { getCatalog } from "@/lib/catalog-store";
import { isOfficialCjImageUrl } from "@/lib/cj-assets";
import { getExchangeRateSnapshot, getMarketCommerceReadiness } from "@/lib/market-pricing";
import { marketIds, type Market } from "@/lib/i18n/config";
import { getProductPresentation, hasCompleteEditorial } from "@/lib/product-presentation";
import { isStoreProductAvailable, niches, type Product, type ProductNiche } from "@/lib/products";
import { getPersistedSalesDashboard, getSalesLedgerStatus, type SalesLedgerDailyMetric, type SalesLedgerOrder } from "@/lib/sales-ledger";

export type CatalogUnitEconomics = {
  product: Product;
  supplierCostCop: number;
  wompiFeeCop: number;
  contributionCop: number;
  contributionMarginPercent: number;
  recommendedPriceCop: number;
  requiresPriceReview: boolean;
};

export type NicheEconomics = {
  niche: ProductNiche;
  label: string;
  productCount: number;
  averageContributionMarginPercent: number | null;
  contributionCopAtListedPrice: number | null;
};

export type MarketCatalogCandidate = {
  market: Market;
  product: Product;
  localizedTitle: string;
  officialImageCount: number;
  editorialComplete: boolean;
  publicEligible: boolean;
  checkoutReady: boolean;
  contributionMarginPercent: number | null;
  shippingEvidenceCount: number;
  salesLast30Days: number | null;
  conversionRate: number | null;
  returnRate: number | null;
  seoReady: boolean;
  semReady: boolean;
  reason: string;
};

/**
 * Panel honesto: estas cifras son economía unitaria del catálogo real de CJ,
 * no ventas simuladas ni conciliación de pagos. La venta se vuelve métrica
 * sólo cuando exista un registro transaccional privado e idempotente.
 */
export async function getSalesDashboardSnapshot({ includePersistedSales = true }: { includePersistedSales?: boolean } = {}) {
  const ledger = getSalesLedgerStatus();
  let ledgerReadFailed = false;
  const [products, persistedSales] = await Promise.all([
    getCatalog(),
    includePersistedSales && ledger.configured
      ? getPersistedSalesDashboard().catch((error) => {
        ledgerReadFailed = true;
        console.error("Private sales dashboard could not be read", { error: error instanceof Error ? error.message : "unknown" });
        return null;
      })
      : Promise.resolve(null),
  ]);
  const targetContributionMargin = getTargetContributionMargin();
  const fulfillmentReserveCop = getFulfillmentReserveCop();
  const wompi = getWompiFeeConfiguration();
  const exchangeRate = getExchangeRateSnapshot();
  const unitEconomics: CatalogUnitEconomics[] = exchangeRate.valid ? products.map((product) => {
    const supplierCostCop = usdToCop(product.supplier.costUsd);
    const estimate = estimateContribution({
      salePriceCop: product.price,
      supplierCostCop,
      fulfillmentReserveCop,
      configuration: wompi,
    });
    const recommendedPriceCop = recommendedPriceForContribution({
      supplierCostCop,
      fulfillmentReserveCop,
      targetContributionMargin,
      configuration: wompi,
      roundingCop: 100,
    });
    return {
      product,
      supplierCostCop,
      wompiFeeCop: estimate.totalFeeCop,
      contributionCop: estimate.contributionCop,
      contributionMarginPercent: estimate.contributionMarginPercent,
      recommendedPriceCop,
      requiresPriceReview: estimate.contributionMarginPercent < targetContributionMargin * 100,
    };
  }) : [];

  const byNiche = (Object.keys(niches) as ProductNiche[]).map((niche) => {
    const entries = unitEconomics.filter((entry) => entry.product.niche === niche);
    const nicheProducts = products.filter((product) => product.niche === niche);
    return {
      niche,
      label: niches[niche].label,
      productCount: nicheProducts.length,
      averageContributionMarginPercent: entries.length
        ? entries.reduce((total, entry) => total + entry.contributionMarginPercent, 0) / entries.length
        : null,
      contributionCopAtListedPrice: entries.length
        ? entries.reduce((total, entry) => total + entry.contributionCop, 0)
        : null,
    } satisfies NicheEconomics;
  });
  const commerceByMarket = marketIds.map((market) => getMarketCommerceReadiness(market));
  const economicsBySku = new Map(unitEconomics.map((entry) => [entry.product.sku, entry]));
  const marketCandidates: MarketCatalogCandidate[] = marketIds.flatMap((market) => {
    const commerce = commerceByMarket.find((entry) => entry.market === market)!;
    return products.map((product) => {
      const officialImageCount = product.images.filter((image) => isOfficialCjImageUrl(image.src)).length;
      const editorialComplete = hasCompleteEditorial(product, market);
      const publicEligible = isStoreProductAvailable(product) && officialImageCount > 0;
      const economics = market === "co" ? economicsBySku.get(product.sku) : undefined;
      const contributionMarginPercent = economics?.contributionMarginPercent ?? null;
      const shippingEvidenceCount = (persistedSales?.recentOrders || []).filter((order) =>
        order.market === market && order.productSku.split(",").map((sku) => sku.trim()).includes(product.sku)
          && (market === "us" ? order.supplierShippingCost !== null : order.supplierShippingCostCop !== null),
      ).length;
      const salesLast30Days = product.performance.salesLast30Days > 0 ? product.performance.salesLast30Days : null;
      const conversionRate = salesLast30Days === null ? null : product.performance.conversionRate;
      const returnRate = salesLast30Days === null ? null : product.performance.returnRate;
      const seoReady = publicEligible && editorialComplete;
      const marginReady = contributionMarginPercent !== null && contributionMarginPercent >= targetContributionMargin * 100;
      const semReady = seoReady && commerce.checkoutEnabled && marginReady;
      const reason = !publicEligible
        ? "No disponible para venta"
        : !editorialComplete
          ? "Editorial incompleta"
          : !commerce.checkoutEnabled
            ? market === "us" ? "Pago USD no configurado" : "Checkout Colombia no configurado"
            : contributionMarginPercent === null
              ? "Margen no calculable"
              : !marginReady
                ? "Margen inferior al objetivo"
                : "Apto para evaluación humana";
      return {
        market,
        product,
        localizedTitle: getProductPresentation(product, market).title,
        officialImageCount,
        editorialComplete,
        publicEligible,
        checkoutReady: commerce.checkoutEnabled,
        contributionMarginPercent,
        shippingEvidenceCount,
        salesLast30Days,
        conversionRate,
        returnRate,
        seoReady,
        semReady,
        reason,
      };
    });
  });

  return {
    // A propósito no se inicializan en cero: aún no hay fuente de órdenes.
    sales: {
      // No se muestran ceros si el libro no puede leerse: no confundimos una
      // fuente temporalmente indisponible con una venta inexistente.
      approvedOrders: persistedSales?.approvedOrders ?? null as number | null,
      approvedOrdersCop: persistedSales?.approvedOrdersCop ?? null as number | null,
      approvedOrdersUsd: persistedSales?.approvedOrdersUsd ?? null as number | null,
      grossRevenueCop: persistedSales?.grossRevenueCop ?? null as number | null,
      grossRevenueUsd: persistedSales?.grossRevenueUsd ?? null as number | null,
      netPayoutCop: persistedSales?.netPayoutCop ?? null as number | null,
      averageTicketCop: persistedSales?.averageTicketCop ?? null as number | null,
      averageTicketUsd: persistedSales?.averageTicketUsd ?? null as number | null,
      approvalRatePercent: persistedSales?.approvalRatePercent ?? null as number | null,
      pendingOrders: persistedSales?.pendingOrders ?? null as number | null,
      declinedOrders: persistedSales?.declinedOrders ?? null as number | null,
      fulfillmentPending: persistedSales?.fulfillmentPending ?? null as number | null,
      fulfillmentInTransit: persistedSales?.fulfillmentInTransit ?? null as number | null,
      shippingRevenueCop: persistedSales?.shippingRevenueCop ?? null as number | null,
      shippingRevenueUsd: persistedSales?.shippingRevenueUsd ?? null as number | null,
      supplierShippingCostCop: persistedSales?.supplierShippingCostCop ?? null as number | null,
      supplierShippingCostUsd: persistedSales?.supplierShippingCostUsd ?? null as number | null,
      shippingMarginCop: persistedSales?.shippingMarginCop ?? null as number | null,
      contributionCop: persistedSales?.contributionCop ?? null as number | null,
    },
    ledger: {
      configured: ledger.configured,
      connected: Boolean(persistedSales),
      detail: persistedSales
        ? "Pedidos, pagos y postventa provienen del libro privado."
        : ledgerReadFailed
          ? "Google Sheets está configurado, pero Apps Script no respondió dentro del tiempo permitido. Las cifras se muestran como pendientes y nunca se interpretan como ventas en cero."
          : ledger.detail,
    },
    recentOrders: (persistedSales?.recentOrders || []) as SalesLedgerOrder[],
    dailySales: (persistedSales?.dailySales || []) as SalesLedgerDailyMetric[],
    wompi,
    targetContributionMargin,
    fulfillmentReserveCop,
    exchangeRate,
    commerceByMarket,
    marketCandidates,
    unitEconomics: unitEconomics.sort((left, right) => left.contributionMarginPercent - right.contributionMarginPercent),
    byNiche,
    priceReviewCount: exchangeRate.valid ? unitEconomics.filter((entry) => entry.requiresPriceReview).length : null as number | null,
  };
}
