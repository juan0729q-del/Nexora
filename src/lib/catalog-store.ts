import "server-only";

import catalogDocument from "@/data/catalog.json";
import { getCatalogDecision, isValidCatalogProduct, type Product, type ProductNiche } from "@/lib/products";
import { getIntelligenceLedgerSnapshot } from "@/lib/sales-ledger";
import { applyExecutedCatalogDecisions } from "@/lib/intelligence/catalog-overlay";

type CatalogDocument = {
  version: number;
  importedAt: string | null;
  source: string;
  products: Product[];
};

/**
 * Catálogo de solo lectura versionado en Git. Es la alternativa persistente
 * dentro del proyecto: Vercel vuelve efímero cualquier cambio de filesystem
 * realizado durante una Function, por lo que las actualizaciones se importan
 * localmente y se publican mediante commit.
 */
function catalog() {
  return catalogDocument as CatalogDocument;
}

export async function getCatalog() {
  // Incluso una edición manual del JSON no puede introducir una imagen local,
  // de relleno, un proveedor no autorizado ni identificadores duplicados.
  const seenSlugs = new Set<string>();
  const seenSkus = new Set<string>();
  return catalog().products.filter((product) => {
    if (!isValidCatalogProduct(product) || seenSlugs.has(product.slug) || seenSkus.has(product.sku)) return false;
    seenSlugs.add(product.slug);
    seenSkus.add(product.sku);
    return true;
  });
}

let operationalCache: { expiresAt: number; products: Product[] } | null = null;

export function invalidateOperationalCatalogCache() {
  operationalCache = null;
}

/**
 * Capa operativa reversible. El JSON de CJ sigue siendo la fuente versionada;
 * las decisiones humanas ejecutadas en Sheets sólo pausan o priorizan la
 * vitrina. Un fallo del libro privado nunca inventa cambios de catálogo.
 */
export async function getOperationalCatalog({ fresh = false }: { fresh?: boolean } = {}) {
  if (!fresh && operationalCache && operationalCache.expiresAt > Date.now()) return operationalCache.products;
  const products = await getCatalog();
  const ledger = await getIntelligenceLedgerSnapshot().catch(() => null);
  const operational = applyExecutedCatalogDecisions(products, ledger?.proposals || []);
  operationalCache = { expiresAt: Date.now() + 30_000, products: operational };
  return operational;
}

export async function getStoreCatalog(niche?: ProductNiche) {
  return (await getOperationalCatalog()).filter((product) => product.active && getCatalogDecision(product) !== "pause" && (!niche || product.niche === niche));
}

export async function getProduct(slug: string) {
  return (await getOperationalCatalog()).find((product) => product.slug === slug);
}

/** Recupera el producto CJ desde una referencia de pago que conserva el SKU. */
export async function getProductBySku(sku: string) {
  const normalizedSku = sku.trim().toUpperCase();
  return (await getCatalog()).find((product) => product.sku.toUpperCase() === normalizedSku);
}

export function getCatalogImportMetadata() {
  const document = catalog();
  return { version: document.version, importedAt: document.importedAt, source: document.source };
}
