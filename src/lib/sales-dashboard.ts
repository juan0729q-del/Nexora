import "server-only";

import {
  estimateContribution,
  getFulfillmentReserveCop,
  getTargetContributionMargin,
  getWompiFeeConfiguration,
  recommendedPriceForContribution,
} from "@/lib/commerce-finance";
import { getCatalog } from "@/lib/catalog-store";
import { niches, type Product, type ProductNiche } from "@/lib/products";

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

function usdToCop(costUsd: number) {
  const configuredRate = Number(process.env.USD_TO_COP_RATE || 4200);
  const exchangeRate = Number.isFinite(configuredRate) && configuredRate > 0 ? configuredRate : 4200;
  return Math.round(costUsd * exchangeRate);
}

/**
 * Panel honesto: estas cifras son economía unitaria del catálogo real de CJ,
 * no ventas simuladas ni conciliación de pagos. La venta se vuelve métrica
 * sólo cuando exista un registro transaccional privado e idempotente.
 */
export async function getSalesDashboardSnapshot() {
  const products = await getCatalog();
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
      approvedOrders: null as number | null,
      grossRevenueCop: null as number | null,
      netPayoutCop: null as number | null,
      averageTicketCop: null as number | null,
      approvalRatePercent: null as number | null,
    },
    wompi,
    targetContributionMargin,
    fulfillmentReserveCop,
    unitEconomics: unitEconomics.sort((left, right) => left.contributionMarginPercent - right.contributionMarginPercent),
    byNiche,
    priceReviewCount: unitEconomics.filter((entry) => entry.requiresPriceReview).length,
  };
}
