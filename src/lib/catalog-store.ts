import "server-only";

import catalogDocument from "@/data/catalog.json";
import { getCatalogDecision, hasNativeProviderImage, type Product, type ProductNiche } from "@/lib/products";

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
  // de relleno o de un origen distinto a la ficha nativa del proveedor.
  return catalog().products.filter(hasNativeProviderImage);
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
