import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Uso: node scripts/persist-catalog-import.mjs <respuesta-importacion.json>");

const catalogPath = resolve("src/data/catalog.json");
const imageHostsPath = resolve("src/data/cj-image-hosts.json");
const payload = JSON.parse(await readFile(resolve(inputPath), "utf8"));
const current = JSON.parse(await readFile(catalogPath, "utf8"));
const cjImageHosts = JSON.parse(await readFile(imageHostsPath, "utf8"));
const products = payload?.products;

function isOfficialCjImageUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && cjImageHosts.includes(url.hostname);
  } catch {
    return false;
  }
}

function isOfficialCjApiUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "developers.cjdropshipping.com";
  } catch {
    return false;
  }
}

function validProduct(product) {
  const validImage = (image) => image?.source === "provider" && isOfficialCjImageUrl(image?.src) && typeof image?.alt === "string" && image.alt.trim().length > 0;
  const validDetails = product?.providerDetails
    && typeof product.providerDetails.description === "string" && product.providerDetails.description.trim().length > 0
    && Array.isArray(product.providerDetails.sections)
    && product.providerDetails.sections.every((section) => typeof section?.title === "string" && Array.isArray(section?.content) && section.content.every((line) => typeof line === "string" && line.trim().length > 0))
    && Array.isArray(product.providerDetails.specifications)
    && product.providerDetails.specifications.every((specification) => typeof specification?.label === "string" && typeof specification?.value === "string")
    && Array.isArray(product.providerDetails.packageContents)
    && product.providerDetails.packageContents.every((item) => typeof item === "string" && item.trim().length > 0);
  const validVariants = Array.isArray(product?.variants) && product.variants.every((variant) => (
    typeof variant?.sku === "string" && variant.sku.trim().length > 0
    && typeof variant?.label === "string" && variant.label.trim().length > 0
    && (!variant.image || validImage(variant.image))
  ));
  const validShipping = product?.shipping
    && Array.isArray(product.shipping.logisticsProperties)
    && product.shipping.logisticsProperties.every((property) => typeof property === "string" && property.trim().length > 0);
  return Boolean(
    product
    && typeof product.slug === "string"
    && typeof product.name === "string"
    && ["jewelry", "technologyHome", "wellbeing"].includes(product.niche)
    && Number.isFinite(product.price) && product.price > 0
    && Number.isInteger(product.stock) && product.stock > 0
    && product.active === true
    && validImage(product.image)
    && Array.isArray(product.images) && product.images.length > 0
    && product.images.every(validImage)
    && product.images.some((image) => image.src === product.image.src)
    && validDetails
    && validShipping
    && validVariants
    && product.supplier?.name === "CJ Dropshipping"
    && isOfficialCjApiUrl(product.supplier?.sourceUrl)
    && typeof product.supplier?.reference === "string" && product.supplier.reference.length > 0
    && Number.isFinite(product.supplier?.costUsd) && product.supplier.costUsd > 0,
  );
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalProducts(entries) {
  return entries
    .map((entry) => canonicalize(entry))
    .sort((left, right) => `${left.niche}:${left.sku}`.localeCompare(`${right.niche}:${right.sku}`));
}

if (!Array.isArray(products) || !products.every(validProduct)) {
  throw new Error("La respuesta contiene un producto incompleto, sin stock vendible o sin imagen nativa autorizada de CJ. catalog.json no fue modificado.");
}

const byNiche = new Map(["jewelry", "technologyHome", "wellbeing"].map((niche) => [niche, products.filter((product) => product.niche === niche)]));
for (const [niche, entries] of byNiche) {
  if (entries.length < 5 || entries.length > 10) throw new Error(`${niche} debe contener entre 5 y 10 productos reales; recibió ${entries.length}.`);
}

const slugs = new Set();
const skus = new Set();
for (const product of products) {
  if (slugs.has(product.slug) || skus.has(product.sku)) throw new Error("La respuesta tiene slugs o SKU duplicados. catalog.json no fue modificado.");
  slugs.add(product.slug);
  skus.add(product.sku);
}

const currentProducts = Array.isArray(current.products) ? current.products : [];
if (JSON.stringify(canonicalProducts(currentProducts)) === JSON.stringify(canonicalProducts(products))) {
  console.log("Catálogo CJ sin cambios reales; no se crea commit ni despliegue.");
  process.exit(0);
}

const nextCatalog = {
  version: Number.isInteger(current.version) ? current.version + 1 : 1,
  importedAt: new Date().toISOString(),
  source: "CJ Dropshipping — Product List v2 por categoría y número de listados",
  products,
};

await writeFile(catalogPath, `${JSON.stringify(nextCatalog, null, 2)}\n`, "utf8");
console.log(`Catálogo CJ validado y versionado: ${products.length} productos.`);
