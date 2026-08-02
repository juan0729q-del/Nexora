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
import { niches, type Product, type ProductNiche } from "@/lib/products";
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
  averageContributionMarginPercent: number;
  contributionCopAtListedPrice: number;
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
  const unitEconomics: CatalogUnitEconomics[] = products.map((product) => {
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
  });

  const byNiche = (Object.keys(niches) as ProductNiche[]).map((niche) => {
    const entries = unitEconomics.filter((entry) => entry.product.niche === niche);
    return {
      niche,
      label: niches[niche].label,
      productCount: entries.length,
      averageContributionMarginPercent: entries.length
        ? entries.reduce((total, entry) => total + entry.contributionMarginPercent, 0) / entries.length
        : 0,
      contributionCopAtListedPrice: entries.reduce((total, entry) => total + entry.contributionCop, 0),
    } satisfies NicheEconomics;
  });

  return {
    // A propósito no se inicializan en cero: aún no hay fuente de órdenes.
    sales: {
      // No se muestran ceros si el libro no puede leerse: no confundimos una
      // fuente temporalmente indisponible con una venta inexistente.
      approvedOrders: persistedSales?.approvedOrders ?? null as number | null,
      grossRevenueCop: persistedSales?.grossRevenueCop ?? null as number | null,
      netPayoutCop: persistedSales?.netPayoutCop ?? null as number | null,
      averageTicketCop: persistedSales?.averageTicketCop ?? null as number | null,
      approvalRatePercent: persistedSales?.approvalRatePercent ?? null as number | null,
      pendingOrders: persistedSales?.pendingOrders ?? null as number | null,
      declinedOrders: persistedSales?.declinedOrders ?? null as number | null,
      fulfillmentPending: persistedSales?.fulfillmentPending ?? null as number | null,
      fulfillmentInTransit: persistedSales?.fulfillmentInTransit ?? null as number | null,
      shippingRevenueCop: persistedSales?.shippingRevenueCop ?? null as number | null,
      supplierShippingCostCop: persistedSales?.supplierShippingCostCop ?? null as number | null,
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
    unitEconomics: unitEconomics.sort((left, right) => left.contributionMarginPercent - right.contributionMarginPercent),
    byNiche,
    priceReviewCount: unitEconomics.filter((entry) => entry.requiresPriceReview).length,
  };
}
