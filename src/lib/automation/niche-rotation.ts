import "server-only";

import { isOfficialCjImageUrl } from "@/lib/cj-assets";
import {
  createProviderDetails,
  createProviderImages,
  type ProductShippingDetails,
  type ProviderVariant,
} from "@/lib/provider-product-details";
import { getCatalog } from "@/lib/catalog-store";
import { niches, type Product, type ProductNiche } from "@/lib/products";
import type { NicheCatalogDecision } from "./catalog-optimizer";
import { createCjClient, getCjCredentialConfiguration, type CjClient } from "./cj-client";

const cjOrigin = "https://developers.cjdropshipping.com";
const categoryEndpoint = `${cjOrigin}/api2.0/v1/product/getCategory`;
const productListV2Endpoint = `${cjOrigin}/api2.0/v1/product/listV2`;
const productQueryEndpoint = `${cjOrigin}/api2.0/v1/product/query`;

type CjCategory = {
  categoryFirstName?: string;
  categoryFirstList?: Array<{
    categorySecondName?: string;
    categorySecondList?: Array<{ categoryId?: string; categoryName?: string }>;
  }>;
};

type CjCategoryLeaf = {
  id: string;
  name: string;
  path: string;
};

type CjListProduct = {
  id?: string;
  sku?: string;
  spu?: string;
  nameEn?: string;
  productNameEn?: string;
  bigImage?: string;
  sellPrice?: number | string;
  nowPrice?: number | string;
  discountPrice?: number | string;
  description?: string;
  warehouseInventoryNum?: number | string;
  totalVerifiedInventory?: number | string;
  listedNum?: number | string;
  saleStatus?: number | string;
  authorityStatus?: number | string;
  categoryId?: string;
  oneCategoryName?: string;
  twoCategoryName?: string;
  threeCategoryName?: string;
};

type CjProductDetail = {
  pid?: string;
  productSku?: string;
  productNameEn?: string;
  bigImage?: string;
  productImageSet?: string[];
  sellPrice?: number | string;
  description?: string;
  materialNameEn?: string | string[];
  materialNameEnSet?: string[];
  categoryName?: string;
  productWeight?: number | string;
  packingWeight?: number | string;
  productUnit?: string;
  productProEnSet?: string[];
  productProEn?: string | string[];
  productKeyEn?: string;
  variants?: CjProductVariant[];
  listedNum?: number | string;
  status?: number | string;
};

type CjProductVariant = {
  vid?: string;
  variantName?: string;
  variantNameEn?: string;
  variantSku?: string;
  variantKey?: string;
  variantImage?: string;
  variantLength?: number | string;
  variantWidth?: number | string;
  variantHeight?: number | string;
  variantWeight?: number | string;
};

type CjCategoryResponse = { data?: CjCategory[] };
type CjProductListResponse = { data?: { content?: Array<{ productList?: CjListProduct[] }> } };
type CjProductDetailResponse = { data?: CjProductDetail };

export type CjTrendingCandidate = {
  id: string;
  sku: string;
  name: string;
  description: string;
  material: string;
  supplierCostUsd: number;
  stock: number;
  listedNum: number;
  categoryPath: string;
  sourceUrl: string;
  image: Product["image"];
  images: Product["images"];
  providerDetails: Product["providerDetails"];
  shipping: ProductShippingDetails;
  variants: ProviderVariant[];
};

export type CatalogSelection = {
  source: "cj-product-list-v2";
  endpoint: string;
  categoryFiltered: true;
  trendFlag: "trending-first";
  ranking: "listing-count";
  providerOrderPreserved: true;
  continuityFallbackNiches: ProductNiche[];
  discoveryDiagnostics: Partial<Record<ProductNiche, string>>;
};

const nicheCategoryTerms: Record<ProductNiche, readonly string[]> = {
  jewelry: ["jewelry", "jewellery", "necklace", "earring", "bracelet", "ring", "pendant", "brooch"],
  technologyHome: ["electronics", "electronic", "computer", "phone", "charger", "smart", "home", "kitchen", "household", "lighting", "office", "appliance", "security"],
  wellbeing: ["health", "beauty", "massage", "fitness", "sport", "wellness", "personal care", "yoga", "therapy", "relaxation"],
};

const nicheSearchTerms: Record<ProductNiche, readonly string[]> = {
  jewelry: ["necklace", "bracelet", "ring"],
  technologyHome: ["wireless charger", "smart home", "kitchen gadget"],
  wellbeing: ["massager", "fitness", "personal care"],
};

export function getProductDiscoveryConfiguration() {
  return {
    configured: getCjCredentialConfiguration().configured,
    reason: "Configura CJ_DROPSHIPPING_API_KEY para consultar Product List v2, sus categorías y fichas oficiales de CJ.",
  };
}

function normalizeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function productQueryUrl(productId: string) {
  const url = new URL(productQueryEndpoint);
  url.searchParams.set("pid", productId);
  return url.toString();
}

function materialFrom(detail: CjProductDetail) {
  const supplied = detail.materialNameEnSet || detail.materialNameEn;
  if (Array.isArray(supplied)) return supplied.filter(Boolean).join(", ") || "Según ficha oficial de CJ";
  if (typeof supplied !== "string" || !supplied.trim()) return "Según ficha oficial de CJ";
  try {
    const parsed = JSON.parse(supplied) as unknown;
    if (Array.isArray(parsed)) {
      const values = parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
      if (values.length) return values.join(", ");
    }
  } catch {
    // La API puede devolver un texto normal en vez de una matriz JSON.
  }
  return supplied.replace(/[\[\]"]/g, "").trim() || "Según ficha oficial de CJ";
}

function optionalPositiveNumber(value: unknown) {
  const number = numberOrZero(value);
  return number > 0 ? number : undefined;
}

function variantFrom(detail: CjProductVariant): ProviderVariant | undefined {
  const sku = detail.variantSku?.trim();
  const label = detail.variantNameEn?.trim() || detail.variantName?.trim() || detail.variantKey?.trim();
  if (!sku || !label) return undefined;

  const lengthMm = optionalPositiveNumber(detail.variantLength);
  const widthMm = optionalPositiveNumber(detail.variantWidth);
  const heightMm = optionalPositiveNumber(detail.variantHeight);
  const dimensions = lengthMm || widthMm || heightMm ? { lengthMm, widthMm, heightMm } : undefined;
  const image = isOfficialCjImageUrl(detail.variantImage)
    ? { src: detail.variantImage, alt: label, source: "provider" as const }
    : undefined;
  return {
    sku,
    label,
    options: detail.variantKey?.trim() || undefined,
    image,
    dimensions,
    weightGrams: optionalPositiveNumber(detail.variantWeight),
  };
}

function shippingFrom(detail: CjProductDetail): ProductShippingDetails {
  const suppliedProperties = detail.productProEnSet || detail.productProEn;
  const logisticsProperties = Array.isArray(suppliedProperties)
    ? suppliedProperties
    : typeof suppliedProperties === "string"
      ? suppliedProperties.replace(/[\[\]"]/g, "").split(",")
      : [];
  return {
    productWeightGrams: optionalPositiveNumber(detail.productWeight),
    packingWeightGrams: optionalPositiveNumber(detail.packingWeight),
    unit: detail.productUnit?.trim() || undefined,
    logisticsProperties: [...new Set(logisticsProperties.map((property) => property.trim()).filter(Boolean))],
  };
}

function categoryPath(item: CjListProduct) {
  return [item.oneCategoryName, item.twoCategoryName, item.threeCategoryName].filter((value): value is string => Boolean(value?.trim())).join(" › ");
}

function extractProducts(payload: CjProductListResponse): CjListProduct[] {
  return (payload.data?.content || []).flatMap((entry) => entry.productList || []);
}

function extractCategoryLeaves(payload: CjCategoryResponse): CjCategoryLeaf[] {
  const leaves = new Map<string, CjCategoryLeaf>();
  for (const first of payload.data || []) {
    for (const second of first.categoryFirstList || []) {
      for (const third of second.categorySecondList || []) {
        if (!third.categoryId || !third.categoryName) continue;
        leaves.set(third.categoryId, {
          id: third.categoryId,
          name: third.categoryName,
          path: [first.categoryFirstName, second.categorySecondName, third.categoryName].filter(Boolean).join(" › "),
        });
      }
    }
  }
  return [...leaves.values()];
}

async function fetchCategoryLeaves(client: CjClient) {
  return extractCategoryLeaves(await client.getJson<CjCategoryResponse>(categoryEndpoint));
}

function categoriesForNiche(niche: ProductNiche, categories: readonly CjCategoryLeaf[]) {
  const terms = [...nicheCategoryTerms[niche], ...niches[niche].supplierQuery.split(/\s+/)].map(normalizeText);
  return categories
    .map((category) => {
      const haystack = normalizeText(`${category.name} ${category.path}`);
      const score = terms.reduce((total, term) => total + (haystack === term ? 20 : haystack.includes(term) ? 4 : 0), 0);
      return { category, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.category.path.localeCompare(right.category.path))
    .map(({ category }) => category);
}

type ProductListCriteria = {
  categoryId?: string;
  keyWord?: string;
  trendingOnly: boolean;
};

function productListUrl({ categoryId, keyWord, trendingOnly }: ProductListCriteria) {
  const url = new URL(productListV2Endpoint);
  url.searchParams.set("page", "1");
  // List v2 cobra por consulta, no por el tamaño solicitado. Un pool mayor
  // reduce reintentos de categorías con pocas fichas realmente vendibles.
  url.searchParams.set("size", "50");
  if (categoryId) url.searchParams.set("categoryId", categoryId);
  if (keyWord) url.searchParams.set("keyWord", keyWord);
  if (trendingOnly) url.searchParams.set("productFlag", "0");
  url.searchParams.set("startWarehouseInventory", "1");
  url.searchParams.set("verifiedWarehouse", "1");
  url.searchParams.set("sort", "desc");
  url.searchParams.set("orderBy", "1");
  url.searchParams.append("features", "enable_description");
  url.searchParams.append("features", "enable_category");
  return url.toString();
}

type ListedCandidate = {
  id: string;
  sku: string;
  name: string;
  description?: string;
  supplierCostUsd: number;
  stock: number;
  listedNum: number;
  categoryPath: string;
  item: CjListProduct;
};

function normalizeListedCandidate(item: CjListProduct, fallbackCategory: CjCategoryLeaf): ListedCandidate | undefined {
  const id = item.id?.trim();
  const sku = (item.sku || item.spu)?.trim();
  const name = (item.nameEn || item.productNameEn)?.trim();
  const supplierCostUsd = numberOrZero(item.discountPrice ?? item.nowPrice ?? item.sellPrice);
  const stock = Math.floor(numberOrZero(item.totalVerifiedInventory ?? item.warehouseInventoryNum));
  const saleStatus = String(item.saleStatus ?? "");
  const authorityStatus = String(item.authorityStatus ?? "");
  if (!id || !sku || !name || supplierCostUsd <= 0 || stock < 1 || !isOfficialCjImageUrl(item.bigImage) || saleStatus !== "3" || authorityStatus !== "1") return undefined;
  return {
    id,
    sku,
    name,
    description: item.description?.trim(),
    supplierCostUsd,
    stock,
    listedNum: numberOrZero(item.listedNum),
    categoryPath: categoryPath(item) || fallbackCategory.path,
    item,
  };
}

function hasReturnedNicheCategory(item: CjListProduct, niche: ProductNiche) {
  const returnedPath = normalizeText(categoryPath(item));
  if (!returnedPath) return false;
  const terms = [...nicheCategoryTerms[niche], ...niches[niche].supplierQuery.split(/\s+/)].map(normalizeText);
  return terms.some((term) => returnedPath.includes(term));
}

function addListedCandidates(
  items: readonly CjListProduct[],
  fallbackCategory: CjCategoryLeaf,
  candidates: Map<string, ListedCandidate>,
  excludedSkus: ReadonlySet<string>,
  requireReturnedNicheCategory: ProductNiche | undefined,
) {
  for (const item of items) {
    if (requireReturnedNicheCategory && !hasReturnedNicheCategory(item, requireReturnedNicheCategory)) continue;
    const candidate = normalizeListedCandidate(item, fallbackCategory);
    if (candidate && !excludedSkus.has(candidate.sku) && !candidates.has(candidate.sku)) candidates.set(candidate.sku, candidate);
  }
}

async function enrichCandidate(candidate: ListedCandidate, client: CjClient): Promise<CjTrendingCandidate | undefined> {
  const payload = await client.getJson<CjProductDetailResponse>(productQueryUrl(candidate.id));
  const detail = payload.data;
  if (!detail || (detail.pid && detail.pid !== candidate.id) || (detail.status !== undefined && String(detail.status) !== "3")) return undefined;

  const description = detail.description?.trim() || candidate.description?.trim();
  const name = detail.productNameEn?.trim() || candidate.name;
  const sku = detail.productSku?.trim() || candidate.sku;
  const supplierCostUsd = numberOrZero(detail.sellPrice) || candidate.supplierCostUsd;
  const variants = (detail.variants || []).map(variantFrom).filter((variant): variant is ProviderVariant => Boolean(variant));
  const images = createProviderImages({
    alt: name,
    primary: detail.bigImage || candidate.item.bigImage,
    productImageSet: detail.productImageSet || [],
    description: description || "",
    variantImageSet: variants.flatMap((variant) => variant.image?.src || []),
  });
  const image = images[0];
  if (!image || !description || !name || !sku || supplierCostUsd <= 0) return undefined;

  return {
    id: candidate.id,
    sku,
    name,
    description,
    material: materialFrom(detail),
    supplierCostUsd,
    stock: candidate.stock,
    listedNum: candidate.listedNum,
    categoryPath: detail.categoryName?.trim() || candidate.categoryPath,
    sourceUrl: productQueryUrl(candidate.id),
    image,
    images,
    providerDetails: createProviderDetails(description),
    shipping: shippingFrom(detail),
    variants,
  };
}

/**
 * Product List v2 no entrega unidades vendidas. La estrategia prioriza
 * productFlag=0 (Trending) y, si una categoría no tiene resultados, conserva
 * el filtro de categoría o valida la categoría devuelta por una búsqueda de
 * palabras clave. En todos los casos orderBy=1 ordena por cantidad de listados.
 */
export async function fetchTrendingProductsForNiche(
  niche: ProductNiche,
  limit: number,
  client: CjClient = createCjClient(),
  categories?: readonly CjCategoryLeaf[],
  excludedSkus: ReadonlySet<string> = new Set(),
) {
  const categoryLeaves = categories || await fetchCategoryLeaves(client);
  const matchingCategories = categoriesForNiche(niche, categoryLeaves);
  if (!matchingCategories.length) throw new Error(`CJ no devolvió una categoría compatible con ${niches[niche].label}. No se importarán productos sin clasificación verificable.`);

  const candidates = new Map<string, ListedCandidate>();
  // A bounded plan keeps one import below the function timeout and CJ points
  // budget even when a category has few valid products.
  const candidatePoolTarget = Math.min(15, Math.max(limit * 2, 10));
  for (const category of matchingCategories.slice(0, 2)) {
    client.assertPointsAvailable(50);
    const payload = await client.getJson<CjProductListResponse>(productListUrl({ categoryId: category.id, trendingOnly: true }));
    addListedCandidates(extractProducts(payload), category, candidates, excludedSkus, undefined);
    if (candidates.size >= candidatePoolTarget) break;
  }

  // Hay categorías CJ sin productos marcados Trending. Se conserva la
  // clasificación del nicho usando la categoría que CJ devuelve en la búsqueda.
  if (candidates.size < candidatePoolTarget) {
    for (const searchTerm of nicheSearchTerms[niche].slice(0, 3)) {
      const keywordCategory: CjCategoryLeaf = {
        id: `keyword-${niche}-${slugify(searchTerm)}`,
        name: searchTerm,
        path: `Búsqueda oficial CJ › ${niches[niche].label}`,
      };
      client.assertPointsAvailable(50);
      const payload = await client.getJson<CjProductListResponse>(productListUrl({ keyWord: searchTerm, trendingOnly: true }));
      addListedCandidates(extractProducts(payload), keywordCategory, candidates, excludedSkus, niche);
      if (candidates.size >= candidatePoolTarget) break;
    }
  }

  // Último respaldo: la misma categoría, sin productFlag, pero ordenada por
  // número de listados y con inventario verificado. No se afirma que sean ventas.
  if (candidates.size < candidatePoolTarget) {
    for (const category of matchingCategories.slice(0, 1)) {
      client.assertPointsAvailable(50);
      const payload = await client.getJson<CjProductListResponse>(productListUrl({ categoryId: category.id, trendingOnly: false }));
      addListedCandidates(extractProducts(payload), category, candidates, excludedSkus, undefined);
      if (candidates.size >= candidatePoolTarget) break;
    }
  }

  const selected: CjTrendingCandidate[] = [];
  // Un pequeño margen evita descartar un nicho completo cuando algunas fichas
  // destacadas no tienen descripción o imágenes oficiales completas.
  const detailAttemptLimit = Math.min(12, Math.max(limit * 2, 10));
  let detailAttempts = 0;
  for (const candidate of [...candidates.values()].sort((left, right) => right.listedNum - left.listedNum || left.sku.localeCompare(right.sku))) {
    if (detailAttempts >= detailAttemptLimit) break;
    client.assertPointsAvailable(10);
    const enriched = await enrichCandidate(candidate, client);
    detailAttempts += 1;
    if (enriched && !excludedSkus.has(enriched.sku) && !selected.some((entry) => entry.sku === enriched.sku)) selected.push(enriched);
    if (selected.length >= limit) break;
  }
  return selected;
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

export function candidateToProduct(candidate: CjTrendingCandidate, niche: ProductNiche): Product {
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
    images: candidate.images,
    providerDetails: candidate.providerDetails,
    shipping: candidate.shipping,
    variants: candidate.variants,
    price,
    compareAtPrice: undefined,
    rating: 0,
    reviewCount: 0,
    stock: candidate.stock,
    active: true,
    sku: candidate.sku,
    material: candidate.material,
    accent: accentFor(niche),
    supplier: {
      name: "CJ Dropshipping",
      sourcePage: `CJ Product List v2 · Categoría y número de listados · ${candidate.categoryPath}`,
      sourceUrl: candidate.sourceUrl,
      reference: `${candidate.sku} · ${candidate.id}`,
      costUsd: candidate.supplierCostUsd,
    },
    // Un producto recién importado no tiene ventas ni conversiones de Nexora;
    // cero representa "sin telemetría local" y no una señal negativa.
    performance: { salesLast30Days: 0, conversionRate: 0, returnRate: 0 },
  };
}

function productIdFrom(product: Product) {
  try {
    const productId = new URL(product.supplier.sourceUrl).searchParams.get("pid")?.trim();
    if (productId) return productId;
  } catch {
    // La validación del catálogo ya impide URLs ajenas a CJ; se conserva este
    // resguardo para que un registro dañado nunca dispare una consulta ambigua.
  }
  return undefined;
}

/**
 * Rehidrata las fichas YA publicadas con Product Details de CJ. Este camino no
 * descubre ni reemplaza productos: conserva SKU, precio y rendimiento de
 * Nexora, y actualiza exclusivamente la información oficial de proveedor.
 */
export async function enrichPublishedCatalogDetails(client: CjClient = createCjClient()) {
  const catalog = await getCatalog();
  const products: Product[] = [];

  for (const product of catalog) {
    const productId = productIdFrom(product);
    if (!productId) throw new Error(`No se pudo recuperar el identificador CJ de ${product.sku}; la ficha no fue modificada.`);

    client.assertPointsAvailable(10);
    const payload = await client.getJson<CjProductDetailResponse>(productQueryUrl(productId));
    const detail = payload.data;
    if (!detail || (detail.pid && detail.pid !== productId) || (detail.status !== undefined && String(detail.status) !== "3")) {
      throw new Error(`CJ no confirmó una ficha vendible para ${product.sku}; no se persistirá un catálogo parcial.`);
    }

    const sku = detail.productSku?.trim() || product.sku;
    if (sku !== product.sku) throw new Error(`CJ devolvió un SKU distinto al esperado para ${product.sku}; se canceló la actualización por seguridad.`);
    const name = detail.productNameEn?.trim() || product.name;
    const description = detail.description?.trim() || product.description;
    const variants = (detail.variants || []).map(variantFrom).filter((variant): variant is ProviderVariant => Boolean(variant));
    const images = createProviderImages({
      alt: name,
      primary: detail.bigImage || product.image.src,
      productImageSet: detail.productImageSet || product.images.map((image) => image.src),
      description,
      variantImageSet: variants.flatMap((variant) => variant.image?.src || []),
    });
    const image = images[0];
    if (!image || !description) throw new Error(`CJ no devolvió descripción e imágenes oficiales completas para ${product.sku}; no se persistirá un catálogo parcial.`);

    products.push({
      ...product,
      name,
      description,
      longDescription: description,
      image,
      images,
      material: materialFrom(detail),
      providerDetails: createProviderDetails(description),
      shipping: shippingFrom(detail),
      variants,
      supplier: {
        ...product.supplier,
        sourceUrl: productQueryUrl(productId),
        reference: `${sku} · ${productId}`,
        costUsd: numberOrZero(detail.sellPrice) || product.supplier.costUsd,
      },
    });
  }

  return {
    products,
    telemetry: client.getTelemetry(),
    persistence: "La respuesta se valida y versiona mediante GitHub Actions; Vercel no escribe en filesystem de Functions.",
  };
}

export async function collectInitialCatalog(perNiche = 5): Promise<{ products: Product[]; selection: CatalogSelection; telemetry: ReturnType<CjClient["getTelemetry"]> }> {
  const limit = Math.min(10, Math.max(5, Math.floor(perNiche)));
  const client = createCjClient();
  const categories = await fetchCategoryLeaves(client);
  // El catálogo vigente es continuidad segura, no relleno: ya pasó la validación de CJ.
  const verifiedCatalog = await getCatalog();
  const excludedSkus = new Set<string>();
  const products: Product[] = [];
  const continuityFallbackNiches: ProductNiche[] = [];
  const discoveryDiagnostics: Partial<Record<ProductNiche, string>> = {};

  for (const niche of Object.keys(niches) as ProductNiche[]) {
    const candidates = await fetchTrendingProductsForNiche(niche, limit, client, categories, excludedSkus);
    const selected = candidates.map((candidate) => candidateToProduct(candidate, niche));
    if (selected.length < 5) {
      const recovered = verifiedCatalog
        .filter((product) => product.niche === niche && product.active && product.stock > 0 && !excludedSkus.has(product.sku) && !selected.some((entry) => entry.sku === product.sku))
        .slice(0, 5 - selected.length);
      if (recovered.length) {
        selected.push(...recovered);
        continuityFallbackNiches.push(niche);
        discoveryDiagnostics[niche] = `CJ devolvió ${candidates.length} candidatos nuevos completos; se conservaron ${recovered.length} fichas CJ ya verificadas para sostener el mínimo de cinco.`;
      }
    }
    if (selected.length < 5) {
      throw new Error(`CJ solo devolvió ${candidates.length} productos vendibles con imagen nativa y ficha oficial para ${niches[niche].label}; se requieren al menos 5.`);
    }
    for (const product of selected) excludedSkus.add(product.sku);
    products.push(...selected);
  }

  return {
    products,
    telemetry: client.getTelemetry(),
    selection: {
      source: "cj-product-list-v2",
      endpoint: productListV2Endpoint,
      categoryFiltered: true,
      trendFlag: "trending-first",
      ranking: "listing-count",
      providerOrderPreserved: true,
      continuityFallbackNiches,
      discoveryDiagnostics,
    },
  };
}

/**
 * Propone un reemplazo del mismo nicho. El catálogo JSON es inmutable en
 * ejecución: la propuesta se materializa mediante el importador versionado,
 * nunca mediante un filesystem efímero de Vercel.
 */
export async function rotateCatalogByNiche(decisions: readonly NicheCatalogDecision[], client: CjClient = createCjClient()) {
  const replacements = [] as Array<{ niche: ProductNiche; removeSlugs: string[]; replacementSku?: string; reason: string }>;
  const categories = await fetchCategoryLeaves(client);
  for (const decision of decisions) {
    if (!decision.needsReplacement) continue;
    const candidate = (await fetchTrendingProductsForNiche(decision.niche, 1, client, categories))[0];
    if (!candidate) {
      replacements.push({ niche: decision.niche, removeSlugs: decision.paused, reason: "CJ no entregó un producto vendible con imagen nativa para reemplazar este nicho." });
      continue;
    }
    replacements.push({ niche: decision.niche, removeSlugs: decision.paused, replacementSku: candidate.sku, reason: "Reemplazo del mismo nicho preparado desde Product List v2 de CJ." });
  }
  return { replacements, persistence: { status: "planned", store: "catalog.json versionado" }, telemetry: client.getTelemetry() };
}
