import { getCatalog, type Product } from "@/lib/products";
import { evaluateSupplierCost } from "./pricing";

type SupplierItem = { sku?: string; productSku?: string; stock?: number; quantity?: number; cost?: number; baseCost?: number; currency?: string };
type SupplierResponse = { data?: SupplierItem[]; items?: SupplierItem[]; products?: SupplierItem[] };

function extractSupplierItems(payload: unknown): SupplierItem[] {
  if (!payload || typeof payload !== "object") return [];
  const response = payload as SupplierResponse;
  return response.data || response.items || response.products || [];
}

function normalizeUpdate(item: SupplierItem, product: Product) {
  const nextCost = Number(item.cost ?? item.baseCost);
  const stock = Number(item.stock ?? item.quantity);
  if (!Number.isFinite(nextCost) || !Number.isFinite(stock)) return null;
  // product.price actúa como precio de venta actual hasta conectar una fuente persistente de costos.
  const decision = evaluateSupplierCost({ salePrice: product.price, previousCost: nextCost, nextCost });
  return { sku: product.sku, stock: Math.max(0, Math.floor(stock)), providerCost: nextCost, action: decision.action, marginPercent: decision.marginPercent, alert: decision.reason };
}

export async function syncSupplierCatalog() {
  const endpoint = process.env.CJ_DROPSHIPPING_API_URL;
  const token = process.env.CJ_DROPSHIPPING_API_TOKEN;
  if (!endpoint || !token) return { status: "skipped", reason: "Proveedor no configurado", updates: [] } as const;
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Proveedor no disponible: ${response.status}`);
  const items = extractSupplierItems(await response.json());
  const catalogBySku = new Map(getCatalog().map((product) => [product.sku, product]));
  const updates = items.flatMap((item) => {
    const product = catalogBySku.get(item.sku || item.productSku || "");
    const update = product ? normalizeUpdate(item, product) : null;
    return update ? [update] : [];
  });
  // Hook de persistencia: guarda updates en tu BD y, si action es pause_product,
  // marca el producto inactivo y crea una alerta roja. La tienda mantiene el mismo
  // catálogo local hasta que conectes ese repositorio persistente.
  return { status: "completed", importedAt: new Date().toISOString(), inspected: items.length, updates } as const;
}
