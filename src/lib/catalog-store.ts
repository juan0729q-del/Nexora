import "server-only";

import catalogDocument from "@/data/catalog.json";
import { getCatalogDecision, type Product, type ProductNiche } from "@/lib/products";

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
  return catalog().products;
}

export async function getStoreCatalog(niche?: ProductNiche) {
  return (await getCatalog()).filter((product) => product.active && getCatalogDecision(product) !== "pause" && (!niche || product.niche === niche));
}

export async function getProduct(slug: string) {
  return (await getCatalog()).find((product) => product.slug === slug);
}

export function getCatalogImportMetadata() {
  const document = catalog();
  return { version: document.version, importedAt: document.importedAt, source: document.source };
}
