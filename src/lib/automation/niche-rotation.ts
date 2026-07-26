import "server-only";

import { niches, type Product, type ProductNiche } from "@/lib/products";
import type { NicheCatalogDecision } from "./catalog-optimizer";

type SupplierItem = {
  id?: string;
  pid?: string;
  sku?: string;
  productSku?: string;
  name?: string;
  title?: string;
  productName?: string;
  productNameEn?: string;
  nameEn?: string;
  description?: string;
  productDesc?: string;
  price?: number | string;
  sellingPrice?: number | string;
  sellPrice?: number | string;
  stock?: number | string;
  quantity?: number | string;
  inventory?: number | string;
  warehouseInventoryNum?: number | string;
  sales?: number | string;
  salesVolume?: number | string;
  orderCount?: number | string;
  orderNum?: number | string;
  image?: string;
  imageUrl?: string;
  productImage?: string;
  bigImage?: string;
  images?: Array<string | { url?: string }>;
  productImageSet?: Array<string | { url?: string }>;
  productUrl?: string;
  url?: string;
};

type SupplierResponse = {
  data?: SupplierItem[] | { content?: SupplierItem[]; list?: SupplierItem[]; records?: SupplierItem[] };
  items?: SupplierItem[];
  products?: SupplierItem[];
};

export type TopSellerCandidate = {
  sku: string;
  name: string;
  description: string;
  supplierCostUsd: number;
  stock: number;
  sourceUrl: string;
  image: { src: string; alt: string; source: "provider" };
};

export type CatalogSelection = {
  source: "cj-top-selling-endpoint";
  endpoint: string;
  providerOrderPreserved: true;
};

export function getTopSellingConfiguration() {
  return {
    configured: Boolean(process.env.CJ_DROPSHIPPING_API_TOKEN && process.env.CJ_DROPSHIPPING_TOP_SELLING_URL),
    reason: "CJ_DROPSHIPPING_TOP_SELLING_URL debe apuntar al endpoint del proveedor que entregue el ranking de ventas por nicho.",
  };
}

function extractItems(payload: unknown): SupplierItem[] {
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

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function providerImage(item: SupplierItem) {
  const fromSets = [...(item.images || []), ...(item.productImageSet || [])]
    .map((image) => typeof image === "string" ? image : image.url)
    .find(isHttpsUrl);
  const candidate = item.productImage || item.bigImage || item.imageUrl || item.image || fromSets;
  return isHttpsUrl(candidate) ? candidate : undefined;
}

function topSellerUrl(niche: ProductNiche) {
  const endpoint = process.env.CJ_DROPSHIPPING_TOP_SELLING_URL?.trim();
  if (!endpoint) {
    throw new Error("Falta CJ_DROPSHIPPING_TOP_SELLING_URL. Product List V2 no certifica un ranking de ventas; Nexora no importará candidatos como 'top-selling' sin un endpoint de CJ que sí lo haga.");
  }
  const query = niches[niche].supplierQuery;
  const resolved = endpoint.includes("{niche}") ? endpoint.replace("{niche}", encodeURIComponent(query)) : endpoint;
  const url = new URL(resolved);
  if (!endpoint.includes("{niche}")) url.searchParams.set("keyWord", query);
  url.searchParams.set("page", "1");
  url.searchParams.set("size", "40");
  return url.toString();
}

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCandidate(item: SupplierItem): TopSellerCandidate | undefined {
  const name = item.name || item.title || item.nameEn || item.productNameEn || item.productName;
  const sku = item.sku || item.productSku || item.pid || item.id;
  const supplierCostUsd = numberOrZero(item.sellingPrice ?? item.sellPrice ?? item.price);
  const stock = Math.floor(numberOrZero(item.stock ?? item.quantity ?? item.inventory ?? item.warehouseInventoryNum));
  const image = providerImage(item);
  const sourceUrl = item.productUrl || item.url;
  if (!name || !sku || supplierCostUsd <= 0 || stock < 1 || !image || !isHttpsUrl(sourceUrl)) return undefined;
  return {
    sku: String(sku),
    name,
    description: item.description || item.productDesc || `Consulta las especificaciones oficiales de este artículo en CJ Dropshipping.`,
    supplierCostUsd,
    stock,
    sourceUrl,
    image: { src: image, alt: name, source: "provider" },
  };
}

/**
 * Consulta exclusivamente el endpoint CJ que el comercio declara como
 * top-selling. Se conserva su orden para no sustituir el ranking del proveedor
 * por métricas locales o por `listedNum`, que no equivale a ventas.
 */
export async function fetchTopSellersForNiche(niche: ProductNiche, limit: number) {
  const url = topSellerUrl(niche);
  const token = process.env.CJ_DROPSHIPPING_API_TOKEN;
  if (!token) throw new Error("CJ_DROPSHIPPING_API_TOKEN es obligatorio para importar el catálogo.");

  const response = await fetch(url, {
    headers: { "CJ-Access-Token": token, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 220);
    throw new Error(`CJ Dropshipping respondió ${response.status} al consultar ${niches[niche].label} (${new URL(url).pathname}): ${detail || "sin detalle"}`);
  }

  const unique = new Map<string, TopSellerCandidate>();
  for (const raw of extractItems(await response.json())) {
    const candidate = normalizeCandidate(raw);
    if (candidate && !unique.has(candidate.sku)) unique.set(candidate.sku, candidate);
  }
  return [...unique.values()].slice(0, limit);
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 72);
}

function priceInCop(supplierCostUsd: number) {
  const exchangeRate = Number(process.env.USD_TO_COP_RATE || 4200);
  const multiplier = Number(process.env.CATALOG_MARKUP_MULTIPLIER || 2.15);
  const calculated = supplierCostUsd * (Number.isFinite(exchangeRate) ? exchangeRate : 4200) * (Number.isFinite(multiplier) ? multiplier : 2.15);
  return Math.max(1_000, Math.round(calculated / 100) * 100);
}

function categoryFor(niche: ProductNiche) {
  if (niche === "jewelry") return "Joyería";
  if (niche === "technologyHome") return "Tecnología y hogar";
  return "Bienestar";
}

function accentFor(niche: ProductNiche): Product["accent"] {
  if (niche === "jewelry") return "silver";
  if (niche === "technologyHome") return "warm";
  return "emerald";
}

export function candidateToProduct(candidate: TopSellerCandidate, niche: ProductNiche): Product {
  const price = priceInCop(candidate.supplierCostUsd);
  const slug = `${slugify(candidate.name) || "producto-cj"}-${slugify(candidate.sku).slice(-16)}`;
  return {
    slug,
    name: candidate.name,
    category: categoryFor(niche),
    niche,
    description: candidate.description,
    longDescription: candidate.description,
    image: candidate.image,
    price,
    compareAtPrice: undefined,
    rating: 0,
    reviewCount: 0,
    stock: candidate.stock,
    active: true,
    sku: candidate.sku,
    material: "Según ficha del proveedor",
    accent: accentFor(niche),
    supplier: {
      name: "CJ Dropshipping",
      sourcePage: `CJ Dropshipping · ${niches[niche].label}`,
      sourceUrl: candidate.sourceUrl,
      reference: candidate.sku,
      costUsd: candidate.supplierCostUsd,
    },
    // Un producto recién importado no tiene ventas ni conversiones de Nexora;
    // cero representa "sin telemetría local" y no una señal negativa.
    performance: { salesLast30Days: 0, conversionRate: 0, returnRate: 0 },
  };
}

export async function collectInitialCatalog(perNiche = 5): Promise<{ products: Product[]; selection: CatalogSelection }> {
  const limit = Math.min(10, Math.max(5, Math.floor(perNiche)));
  const selected = await Promise.all((Object.keys(niches) as ProductNiche[]).map(async (niche) => {
    const candidates = await fetchTopSellersForNiche(niche, limit);
    if (candidates.length < 5) {
      throw new Error(`CJ solo devolvió ${candidates.length} productos vendibles con imagen nativa y referencia directa para ${niches[niche].label}; se requieren al menos 5.`);
    }
    return candidates.map((candidate) => candidateToProduct(candidate, niche));
  }));
  return {
    products: selected.flat(),
    selection: { source: "cj-top-selling-endpoint", endpoint: process.env.CJ_DROPSHIPPING_TOP_SELLING_URL!, providerOrderPreserved: true },
  };
}

/**
 * Propone un reemplazo del mismo nicho. El catálogo JSON es inmutable en
 * ejecución: la propuesta se materializa mediante el importador versionado,
 * nunca mediante un filesystem efímero de Vercel.
 */
export async function rotateCatalogByNiche(decisions: readonly NicheCatalogDecision[]) {
  const replacements = [] as Array<{ niche: ProductNiche; removeSlugs: string[]; replacementSku?: string; reason: string }>;
  for (const decision of decisions) {
    if (!decision.needsReplacement) continue;
    const candidate = (await fetchTopSellersForNiche(decision.niche, 1))[0];
    if (!candidate) {
      replacements.push({ niche: decision.niche, removeSlugs: decision.paused, reason: "CJ no entregó un producto vendible con imagen nativa para reemplazar este nicho." });
      continue;
    }
    replacements.push({ niche: decision.niche, removeSlugs: decision.paused, replacementSku: candidate.sku, reason: "Reemplazo top-selling del mismo nicho listo para el importador versionado." });
  }
  return { replacements, persistence: { status: "planned", store: "catalog.json versionado" } };
}
