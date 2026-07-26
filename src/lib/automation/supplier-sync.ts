import "server-only";

import { getCatalog } from "@/lib/catalog-store";
import { evaluateSupplierCost } from "./pricing";

type SupplierItem = {
  sku?: string;
  productSku?: string;
  stock?: number;
  quantity?: number;
  cost?: number;
  baseCost?: number;
  sellPrice?: number;
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
  if (response.data && typeof response.data === "object") return response.data.content || response.data.list || response.data.records || [];
  return response.items || response.products || [];
}

export async function syncSupplierCatalog() {
  const endpoint = process.env.CJ_DROPSHIPPING_API_URL;
  const token = process.env.CJ_DROPSHIPPING_API_TOKEN;
  if (!endpoint || !token) return { status: "skipped", reason: "Proveedor no configurado", updates: [] } as const;
  const response = await fetch(endpoint, {
    headers: { "CJ-Access-Token": token, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Proveedor no disponible: ${response.status}`);

  const catalog = await getCatalog();
  const catalogBySku = new Map(catalog.map((product) => [product.sku, product]));
  const updates = extractSupplierItems(await response.json()).flatMap((item) => {
    const product = catalogBySku.get(item.sku || item.productSku || "");
    const providerCost = Number(item.cost ?? item.baseCost ?? item.sellPrice);
    const stock = Number(item.stock ?? item.quantity);
    if (!product || !Number.isFinite(providerCost) || !Number.isFinite(stock)) return [];
    const previousCost = product.price * 0.45;
    const decision = evaluateSupplierCost({ salePrice: product.price, previousCost, nextCost: providerCost });
    return [{ sku: product.sku, stock: Math.max(0, Math.floor(stock)), providerCost, action: decision.action, marginPercent: decision.marginPercent, alert: decision.reason }];
  });
  // El runtime de Vercel no ofrece disco persistente. Las variaciones se
  // devuelven como propuesta y se consolidan en catalog.json mediante Git.
  return { status: "planned", importedAt: new Date().toISOString(), inspected: catalog.length, updates } as const;
}
