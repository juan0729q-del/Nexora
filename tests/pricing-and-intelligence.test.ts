import assert from "node:assert/strict";
import test from "node:test";
import catalogDocument from "../src/data/catalog.json";
import { applyExecutedCatalogDecisions } from "../src/lib/intelligence/catalog-overlay";
import type { IntelligenceProposal } from "../src/lib/intelligence/types";
import { defaultCommercePricingPolicy, recommendedSalePriceCopFromSupplierCost, salePriceCopForVariant } from "../src/lib/pricing-policy";
import type { Product } from "../src/lib/products";

test("el precio por estilo conserva el margen y aumenta con el costo real de CJ", () => {
  const product = catalogDocument.products.find((entry) => entry.variants.length > 1) as Product | undefined;
  assert.ok(product);
  const variants = [...product.variants].sort((left, right) => (left.supplierCostUsd || 0) - (right.supplierCostUsd || 0));
  assert.ok(variants[0].supplierCostUsd && variants.at(-1)?.supplierCostUsd);
  const low = salePriceCopForVariant(product, variants[0].sku, 3053.48);
  const high = salePriceCopForVariant(product, variants.at(-1)!.sku, 3053.48);
  assert.ok(high > low, "un estilo CJ más costoso no puede conservar el precio del estilo barato");

  const supplierCostCop = variants[0].supplierCostUsd! * 3053.48;
  const variableFee = defaultCommercePricingPolicy.wompiPercentageRate * (1 + defaultCommercePricingPolicy.wompiVatRate);
  const fixedFee = defaultCommercePricingPolicy.wompiFixedFeeCop * (1 + defaultCommercePricingPolicy.wompiVatRate);
  const contribution = low - supplierCostCop - low * variableFee - fixedFee;
  assert.ok(contribution / low >= defaultCommercePricingPolicy.targetContributionMargin);
  const paypalContribution = low - supplierCostCop - low * defaultCommercePricingPolicy.paypalPercentageRate - defaultCommercePricingPolicy.paypalFixedFeeUsd * 3053.48;
  assert.ok(paypalContribution / low >= defaultCommercePricingPolicy.targetContributionMargin);
});

test("COP y USD representan el mismo precio canónico salvo redondeo de centavos", () => {
  const cop = recommendedSalePriceCopFromSupplierCost({ supplierCostUsd: 4.25, copPerUsd: 3053.48 });
  const usd = Math.round((cop / 3053.48) * 100) / 100;
  assert.ok(Math.abs(usd * 3053.48 - cop) <= 3053.48 / 200);
});

test("sólo una decisión ejecutada pausa o prioriza el catálogo", () => {
  const products = catalogDocument.products.slice(0, 3) as Product[];
  const base = {
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    niche: products[0].niche, title: "test", summary: "test", rationale: [], benefits: [], risks: [],
    implications: "test", rollback: "test", confidencePercent: 100, evidence: [], execution: "merchandising" as const,
  };
  const proposals: IntelligenceProposal[] = [
    { ...base, id: "pending", action: "pause_product", status: "authorized", targetSku: products[1].sku },
    { ...base, id: "pause", action: "pause_product", status: "executed", targetSku: products[0].sku },
    { ...base, id: "promote", action: "promote_product", status: "executed", targetSku: products[2].sku },
  ];
  const result = applyExecutedCatalogDecisions(products, proposals);
  assert.equal(result[0].sku, products[2].sku);
  assert.equal(result.find((entry) => entry.sku === products[0].sku)?.active, false);
  assert.equal(result.find((entry) => entry.sku === products[1].sku)?.active, products[1].active);
});
