import "server-only";

import { niches, type ProductNiche } from "@/lib/products";
import type { NicheCatalogDecision } from "./catalog-optimizer";

type SupplierItem = {
  id?: string; sku?: string; productSku?: string; name?: string; title?: string; description?: string;
  price?: number | string; sellingPrice?: number | string; stock?: number | string; quantity?: number | string;
  image?: string; imageUrl?: string; images?: Array<string | { url?: string }>; productUrl?: string; url?: string;
};
type SupplierResponse = { data?: SupplierItem[]; items?: SupplierItem[]; products?: SupplierItem[] };
export type TopSellerCandidate = { sku: string; name: string; description: string; price: number; stock: number; sourceUrl: string; image: { src: string; alt: string; source: "provider" | "fallback" } };
export type NicheReplacement = { niche: ProductNiche; removeSlugs: string[]; replacement?: TopSellerCandidate; reason: string };

function extractItems(payload: unknown): SupplierItem[] {
  if (!payload || typeof payload !== "object") return [];
  const response = payload as SupplierResponse;
  return response.data || response.items || response.products || [];
}

function nativeProviderImage(item: SupplierItem) {
  const firstImage = item.images?.map((image) => typeof image === "string" ? image : image.url).find(Boolean);
  const candidate = item.imageUrl || item.image || firstImage;
  return candidate && /^https:\/\//.test(candidate) ? candidate : undefined;
}

function fallbackImage(niche: ProductNiche) {
  if (niche === "jewelry") return "/products/joyeria-acero-titanio.png";
  if (niche === "technologyHome") return "/products/estacion-carga-eco-bamboo.png";
  return "/products/corrector-postura-inteligente.png";
}

function supplierTopSellerUrl(niche: ProductNiche) {
  const endpoint = process.env.CJ_DROPSHIPPING_TOP_SELLING_URL || process.env.CJ_DROPSHIPPING_API_URL;
  if (!endpoint) return undefined;
  const query = niches[niche].supplierQuery;
  if (endpoint.includes("{niche}")) return endpoint.replace("{niche}", encodeURIComponent(query));
  const url = new URL(endpoint);
  url.searchParams.set("category", query);
  url.searchParams.set("sort", "top_selling");
  url.searchParams.set("limit", "8");
  return url.toString();
}

function normalizeCandidate(item: SupplierItem, niche: ProductNiche): TopSellerCandidate | undefined {
  const name = item.name || item.title;
  const sku = item.sku || item.productSku || item.id;
  const price = Number(item.sellingPrice ?? item.price);
  const stock = Number(item.stock ?? item.quantity ?? 0);
  if (!name || !sku || !Number.isFinite(price) || price <= 0) return undefined;
  const imageUrl = nativeProviderImage(item);
  return {
    sku,
    name,
    description: item.description || `Producto destacado de ${niches[niche].label}.`,
    price: Math.round(price),
    stock: Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0,
    sourceUrl: item.productUrl || item.url || "https://cjdropshipping.com/",
    // La imagen nativa del proveedor siempre tiene prioridad; el fallback solo
    // se utiliza cuando el proveedor no entrega una URL HTTPS válida.
    image: imageUrl ? { src: imageUrl, alt: name, source: "provider" } : { src: fallbackImage(niche), alt: name, source: "fallback" },
  };
}

async function getTopSeller(niche: ProductNiche): Promise<TopSellerCandidate | undefined> {
  const url = supplierTopSellerUrl(niche);
  const token = process.env.CJ_DROPSHIPPING_API_TOKEN;
  if (!url || !token) return undefined;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Top-selling supplier request failed for ${niche}: ${response.status}`);
  return extractItems(await response.json()).map((item) => normalizeCandidate(item, niche)).find((item): item is TopSellerCandidate => Boolean(item));
}

async function persistReplacement(replacements: NicheReplacement[]) {
  const endpoint = process.env.CATALOG_STORE_API_URL;
  const token = process.env.CATALOG_STORE_API_TOKEN;
  if (!endpoint || !token) return { status: "skipped", reason: "CATALOG_STORE_API_URL y CATALOG_STORE_API_TOKEN no configurados" } as const;
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ operation: "replace_by_niche", replacements }), cache: "no-store" });
  if (!response.ok) throw new Error(`Catalog store update failed: ${response.status}`);
  return { status: "persisted" } as const;
}

/** Consulta top-selling por nicho y persiste reemplazos en la misma categoría. */
export async function rotateCatalogByNiche(decisions: readonly NicheCatalogDecision[]) {
  const replacements = await Promise.all(decisions.map(async (decision): Promise<NicheReplacement | undefined> => {
    if (!decision.needsReplacement) return undefined;
    const replacement = await getTopSeller(decision.niche);
    return { niche: decision.niche, removeSlugs: decision.paused, replacement, reason: replacement ? "Top-selling del mismo nicho seleccionado" : "No hubo candidato válido del proveedor" };
  }));
  const actionable = replacements.filter((replacement): replacement is NicheReplacement => Boolean(replacement));
  return { replacements: actionable, persistence: await persistReplacement(actionable) };
}
