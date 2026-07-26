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
  listedNum?: number | string;
  warehouseInventoryNum?: number | string;
  nowPrice?: number | string;
  discountPrice?: number | string;
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
  salesLast30Days: number;
  sourceUrl: string;
  image: { src: string; alt: string; source: "provider" };
};

function extractItems(payload: unknown): SupplierItem[] {
  if (!payload || typeof payload !== "object") return [];
  const response = payload as SupplierResponse;
  if (Array.isArray(response.data)) return response.data;
  if (response.data && typeof response.data === "object") {
    const data = response.data;
    const content = data.content || data.list || data.records || [];
    return content.flatMap((entry) => {
      if (entry && typeof entry === "object" && Array.isArray((entry as { productList?: unknown }).productList)) return (entry as { productList: SupplierItem[] }).productList;
      return entry as SupplierItem;
    });
  }
  return response.items || response.products || [];
}

function providerImage(item: SupplierItem) {
  const fromSets = [...(item.images || []), ...(item.productImageSet || [])]
    .map((image) => typeof image === "string" ? image : image.url)
    .find((image): image is string => Boolean(image && /^https:\/\//.test(image)));
  const candidate = item.productImage || item.bigImage || item.imageUrl || item.image || fromSets;
  return candidate && /^https:\/\//.test(candidate) ? candidate : undefined;
}

function topSellerUrl(niche: ProductNiche) {
  const customEndpoint = process.env.CJ_DROPSHIPPING_TOP_SELLING_URL;
  let endpoint = customEndpoint || process.env.CJ_DROPSHIPPING_API_URL;
  if (!endpoint) return undefined;
  const query = niches[niche].supplierQuery;
  if (endpoint.includes("{niche}")) return endpoint.replace("{niche}", encodeURIComponent(query));
  // Acepta tanto el endpoint completo como la URL base /api2.0 configurada
  // normalmente en Vercel para CJ.
  if (!customEndpoint) {
    const configured = new URL(endpoint);
    if (!configured.pathname.includes("/product/")) {
      configured.pathname = `${configured.pathname.replace(/\/$/, "")}/v1/product/listV2`;
      configured.search = "";
      endpoint = configured.toString();
    }
  }
  const url = new URL(endpoint);
  // Product List v2 de CJ no expone un contador de ventas. La respuesta
  // incluye listedNum, que se usa localmente para ordenar los resultados sin
  // enviar filtros opcionales incompatibles con cuentas antiguas de CJ.
  url.searchParams.set("keyWord", query);
  url.searchParams.set("page", "1");
  url.searchParams.set("size", "40");
  return url.toString();
}

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCandidate(item: SupplierItem, niche: ProductNiche): TopSellerCandidate | undefined {
  const name = item.name || item.title || item.nameEn || item.productNameEn || item.productName;
  const sku = item.sku || item.productSku || item.pid || item.id;
  const supplierCostUsd = numberOrZero(item.discountPrice ?? item.nowPrice ?? item.sellingPrice ?? item.sellPrice ?? item.price);
  const image = providerImage(item);
  if (!name || !sku || supplierCostUsd <= 0 || !image) return undefined;
  return {
    sku: String(sku),
    name,
    description: item.description || item.productDesc || `Producto seleccionado desde el catálogo de ${niches[niche].label} de CJ Dropshipping.`,
    supplierCostUsd,
    stock: Math.max(0, Math.floor(numberOrZero(item.stock ?? item.quantity ?? item.inventory ?? item.warehouseInventoryNum))),
    salesLast30Days: Math.max(0, Math.floor(numberOrZero(item.sales ?? item.salesVolume ?? item.orderCount ?? item.orderNum ?? item.listedNum))),
    sourceUrl: item.productUrl || item.url || `https://cjdropshipping.com/search?keyWord=${encodeURIComponent(String(sku))}`,
    image: { src: image, alt: name, source: "provider" },
  };
}

function score(candidate: TopSellerCandidate) {
  return candidate.salesLast30Days * 1_000_000 + candidate.stock;
}

/** Consulta CJ con CJ-Access-Token y descarta cualquier artículo sin foto original HTTPS. */
export async function fetchTopSellersForNiche(niche: ProductNiche, limit: number) {
  const url = topSellerUrl(niche);
  const token = process.env.CJ_DROPSHIPPING_API_TOKEN;
  if (!url || !token) throw new Error("CJ_DROPSHIPPING_API_URL y CJ_DROPSHIPPING_API_TOKEN son obligatorios para importar el catálogo.");
  const response = await fetch(url, {
    headers: { "CJ-Access-Token": token, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 220);
    throw new Error(`CJ Dropshipping respondió ${response.status} al consultar ${niche} (${new URL(url).pathname}): ${detail || "sin detalle"}`);
  }

  const unique = new Map<string, TopSellerCandidate>();
  for (const raw of extractItems(await response.json())) {
    const candidate = normalizeCandidate(raw, niche);
    if (candidate && !unique.has(candidate.sku)) unique.set(candidate.sku, candidate);
  }
  return [...unique.values()].sort((a, b) => score(b) - score(a)).slice(0, limit);
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
    active: candidate.stock > 0,
    sku: candidate.sku,
    material: "Según ficha del proveedor",
    accent: accentFor(niche),
    supplier: {
      name: "CJ Dropshipping",
      sourcePage: `CJ Dropshipping · ${niches[niche].label}`,
      sourceUrl: candidate.sourceUrl,
      reference: candidate.sku,
    },
    performance: {
      salesLast30Days: candidate.salesLast30Days,
      conversionRate: 0,
      returnRate: 0,
    },
  };
}

export async function collectInitialCatalog(perNiche = 5) {
  const limits = Math.min(10, Math.max(5, Math.floor(perNiche)));
  const selected = await Promise.all((Object.keys(niches) as ProductNiche[]).map(async (niche) => {
    const candidates = await fetchTopSellersForNiche(niche, limits);
    if (candidates.length < 5) {
      throw new Error(`CJ solo devolvió ${candidates.length} productos con imagen nativa para ${niches[niche].label}; se requieren al menos 5.`);
    }
    return candidates.map((candidate) => candidateToProduct(candidate, niche));
  }));
  return selected.flat();
}

/**
 * Propone un reemplazo del mismo nicho. El catálogo JSON es inmutable en
 * ejecución: la propuesta se convierte en un commit durante la importación,
 * nunca en una escritura efímera del filesystem de Vercel.
 */
export async function rotateCatalogByNiche(decisions: readonly NicheCatalogDecision[]) {
  const replacements = [] as Array<{ niche: ProductNiche; removeSlugs: string[]; replacementSku?: string; reason: string }>;
  for (const decision of decisions) {
    if (!decision.needsReplacement) continue;
    const candidate = (await fetchTopSellersForNiche(decision.niche, 1))[0];
    if (!candidate) {
      replacements.push({ niche: decision.niche, removeSlugs: decision.paused, reason: "CJ no entregó una imagen nativa válida para reemplazar este nicho." });
      continue;
    }
    replacements.push({ niche: decision.niche, removeSlugs: decision.paused, replacementSku: candidate.sku, reason: "Top-selling del mismo nicho listo para revisión e importación versionada." });
  }
  return { replacements, persistence: { status: "planned", store: "catalog.json versionado" } };
}
