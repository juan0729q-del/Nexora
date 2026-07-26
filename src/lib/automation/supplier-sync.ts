import "server-only";

import { getCatalog } from "@/lib/catalog-store";
import { evaluateSupplierCost } from "./pricing";

type SupplierItem = {
  sku?: string;
  productSku?: string;
  stock?: number | string;
  quantity?: number | string;
  inventory?: number | string;
  warehouseInventoryNum?: number | string;
  cost?: number | string;
  baseCost?: number | string;
  sellingPrice?: number | string;
  sellPrice?: number | string;
  price?: number | string;
};

type SupplierResponse = {
  data?: SupplierItem[] | { content?: SupplierItem[]; list?: SupplierItem[]; records?: SupplierItem[] };
  items?: SupplierItem[];
  products?: SupplierItem[];
};

function extractSupplierItems(payload: unknown): SupplierItem[] {
  if (!payload || typeof payload !== "object") return [];
  const response = payload as SupplierResponse;
  if (Array.isArray(response.data)) return response.data;
  if (response.data && typeof response.data === "object") {
    const data = response.data;
    const content = data.content || data.list || data.records || [];
    return content.flatMap((entry) => {
      if (entry && typeof entry === "object" && Array.isArray((entry as { productList?: unknown }).productList)) {
        return (entry as { productList: SupplierItem[] }).productList;
      }
      return entry as SupplierItem;
    });
  }
  return response.items || response.products || [];
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function syncUrlFor(sku: string) {
  const template = process.env.CJ_DROPSHIPPING_PRODUCT_SYNC_URL?.trim();
  if (!template) return undefined;
  const url = new URL(template.replace("{sku}", encodeURIComponent(sku)));
  if (!template.includes("{sku}")) url.searchParams.set("sku", sku);
  return url.toString();
}

function usdToCop(costUsd: number) {
  const exchangeRate = Number(process.env.USD_TO_COP_RATE || 4200);
  return costUsd * (Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 4200);
}

/**
 * Consulta una ficha de inventario/costo por SKU mediante el endpoint CJ que
 * el comercio configure. Los resultados son propuestas versionables: Vercel
 * no dispone de un disco durable para reescribir catalog.json durante un cron.
 */
export async function syncSupplierCatalog() {
  const token = process.env.CJ_DROPSHIPPING_API_TOKEN;
  const template = process.env.CJ_DROPSHIPPING_PRODUCT_SYNC_URL;
  if (!token || !template) {
    return {
      status: "skipped" as const,
      reason: "Configura CJ_DROPSHIPPING_API_TOKEN y CJ_DROPSHIPPING_PRODUCT_SYNC_URL con {sku} para sincronizar inventario y costos por producto.",
      updates: [],
    };
  }

  const catalog = await getCatalog();
  const updates = [] as Array<{ sku: string; stock: number; providerCostUsd: number; providerCostCop: number; action: "keep_active" | "pause_product"; marginPercent: number; alert?: string }>;

  for (const product of catalog) {
    const endpoint = syncUrlFor(product.sku);
    if (!endpoint) continue;
    const response = await fetch(endpoint, {
      headers: { "CJ-Access-Token": token, Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`CJ no pudo sincronizar ${product.sku}: ${response.status}`);

    const item = extractSupplierItems(await response.json()).find((candidate) => (candidate.sku || candidate.productSku) === product.sku);
    if (!item) continue;
    const providerCostUsd = number(item.cost ?? item.baseCost ?? item.sellingPrice ?? item.sellPrice ?? item.price);
    const stock = number(item.stock ?? item.quantity ?? item.inventory ?? item.warehouseInventoryNum);
    if (providerCostUsd === undefined || providerCostUsd <= 0 || stock === undefined) continue;

    const decision = evaluateSupplierCost({
      salePrice: product.price,
      previousCost: usdToCop(product.supplier.costUsd),
      nextCost: usdToCop(providerCostUsd),
    });
    updates.push({
      sku: product.sku,
      stock: Math.max(0, Math.floor(stock)),
      providerCostUsd,
      providerCostCop: Math.round(usdToCop(providerCostUsd)),
      action: decision.action,
      marginPercent: decision.marginPercent,
      alert: decision.reason,
    });
  }

  return { status: "planned" as const, importedAt: new Date().toISOString(), inspected: catalog.length, updates };
}
