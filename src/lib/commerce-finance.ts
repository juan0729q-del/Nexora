export type WompiFeeConfiguration = {
  percentageRate: number;
  fixedFeeCop: number;
  vatRate: number;
};

export type WompiFeeBreakdown = {
  baseFeeCop: number;
  vatCop: number;
  totalFeeCop: number;
};

export type ContributionEstimate = WompiFeeBreakdown & {
  supplierCostCop: number;
  fulfillmentReserveCop: number;
  contributionCop: number;
  contributionMarginPercent: number;
};

const defaultWompiFeeConfiguration: WompiFeeConfiguration = {
  percentageRate: 0.0265,
  fixedFeeCop: 700,
  vatRate: 0.19,
};

function positiveNumber(value: string | undefined, fallback: number, minimum = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

/**
 * Tasa usada al capturar la cotización de CJ. Se mantiene configurable porque
 * el flete se devuelve en USD y Wompi cobra en COP; nunca se consulta una API
 * de cambio durante el checkout para evitar una segunda fuente inestable.
 */
export function getUsdToCopRate() {
  return positiveNumber(process.env.USD_TO_COP_RATE, 4200, 1);
}

export function usdToCop(amountUsd: number, exchangeRate = getUsdToCopRate()) {
  return Math.round(Math.max(0, amountUsd) * exchangeRate);
}

/**
 * Plan Avanzado mostrado por el comercio: 2,65 % + COP 700 y el IVA aplicado
 * únicamente sobre la comisión. Los valores siguen siendo configurables para
 * reflejar un contrato distinto sin editar código.
 */
export function getWompiFeeConfiguration(): WompiFeeConfiguration {
  return {
    percentageRate: positiveNumber(process.env.WOMPI_FEE_PERCENTAGE, defaultWompiFeeConfiguration.percentageRate),
    fixedFeeCop: positiveNumber(process.env.WOMPI_FEE_FIXED_COP, defaultWompiFeeConfiguration.fixedFeeCop),
    vatRate: positiveNumber(process.env.WOMPI_FEE_VAT_RATE, defaultWompiFeeConfiguration.vatRate),
  };
}

export function calculateWompiFee(salePriceCop: number, configuration = getWompiFeeConfiguration()): WompiFeeBreakdown {
  const salePrice = Math.max(0, salePriceCop);
  const baseFeeCop = Math.round((salePrice * configuration.percentageRate) + configuration.fixedFeeCop);
  const vatCop = Math.round(baseFeeCop * configuration.vatRate);
  return { baseFeeCop, vatCop, totalFeeCop: baseFeeCop + vatCop };
}

/** Calcula margen de contribución antes de flete real, CAC, impuestos y devoluciones si no fueron cargados. */
export function estimateContribution({
  salePriceCop,
  supplierCostCop,
  fulfillmentReserveCop = 0,
  configuration = getWompiFeeConfiguration(),
}: {
  salePriceCop: number;
  supplierCostCop: number;
  fulfillmentReserveCop?: number;
  configuration?: WompiFeeConfiguration;
}): ContributionEstimate {
  const safePrice = Math.max(0, salePriceCop);
  const safeSupplierCost = Math.max(0, supplierCostCop);
  const safeReserve = Math.max(0, fulfillmentReserveCop);
  const fee = calculateWompiFee(safePrice, configuration);
  const contributionCop = Math.round(safePrice - safeSupplierCost - safeReserve - fee.totalFeeCop);
  return {
    ...fee,
    supplierCostCop: safeSupplierCost,
    fulfillmentReserveCop: safeReserve,
    contributionCop,
    contributionMarginPercent: safePrice > 0 ? (contributionCop / safePrice) * 100 : 0,
  };
}

export function getTargetContributionMargin() {
  return positiveNumber(process.env.CATALOG_TARGET_CONTRIBUTION_MARGIN, 0.5, 0.01);
}

export function getFulfillmentReserveCop() {
  return positiveNumber(process.env.CATALOG_LANDED_COST_RESERVE_COP, 0);
}

/**
 * Precio mínimo para preservar una contribución objetivo después de Wompi.
 * No sustituye el flete cotizado por destino ni el CAC: ambos se agregan como
 * reserva explícita cuando el comercio los conoce.
 */
export function recommendedPriceForContribution({
  supplierCostCop,
  fulfillmentReserveCop = getFulfillmentReserveCop(),
  targetContributionMargin = getTargetContributionMargin(),
  configuration = getWompiFeeConfiguration(),
  roundingCop = 100,
}: {
  supplierCostCop: number;
  fulfillmentReserveCop?: number;
  targetContributionMargin?: number;
  configuration?: WompiFeeConfiguration;
  roundingCop?: number;
}) {
  const effectiveVariableRate = configuration.percentageRate * (1 + configuration.vatRate);
  const effectiveFixedFee = configuration.fixedFeeCop * (1 + configuration.vatRate);
  const denominator = 1 - effectiveVariableRate - targetContributionMargin;
  if (supplierCostCop < 0 || fulfillmentReserveCop < 0 || denominator <= 0) {
    throw new Error("La configuración de margen o costos no permite calcular un precio sostenible.");
  }
  const rawPrice = (supplierCostCop + fulfillmentReserveCop + effectiveFixedFee) / denominator;
  const safeRounding = Number.isFinite(roundingCop) && roundingCop >= 1 ? Math.floor(roundingCop) : 100;
  return Math.max(safeRounding, Math.ceil(rawPrice / safeRounding) * safeRounding);
}
