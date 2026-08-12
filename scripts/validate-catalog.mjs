import { readFileSync } from "node:fs";

const readJson = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const catalog = readJson("src/data/catalog.json");
const imageHosts = new Set(readJson("src/data/cj-image-hosts.json"));
const niches = ["jewelry", "technologyHome", "wellbeing"];
const errors = [];

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validHttpsUrl(value, expectedHosts) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && expectedHosts.has(url.hostname);
  } catch {
    return false;
  }
}

if (!Number.isInteger(catalog.version) || catalog.version < 1) errors.push("La versión del catálogo no es válida.");
if (!Array.isArray(catalog.products)) errors.push("El catálogo no contiene un arreglo products.");

const products = Array.isArray(catalog.products) ? catalog.products : [];
const slugs = new Set();
const skus = new Set();
const counts = Object.fromEntries(niches.map((niche) => [niche, 0]));

for (const [index, product] of products.entries()) {
  const label = `products[${index}]`;
  if (!product || typeof product !== "object") {
    errors.push(`${label} no es un objeto.`);
    continue;
  }
  if (!nonEmpty(product.slug) || slugs.has(product.slug)) errors.push(`${label} tiene slug vacío o duplicado.`);
  const normalizedSku = nonEmpty(product.sku) ? product.sku.trim().toUpperCase() : "";
  if (!normalizedSku || !/^[A-Z0-9-]{4,64}$/.test(normalizedSku) || skus.has(normalizedSku)) errors.push(`${label} tiene SKU vacío, duplicado o incompatible con el enlace corto /p/SKU.`);
  slugs.add(product.slug);
  skus.add(normalizedSku);

  if (!niches.includes(product.niche)) errors.push(`${label} tiene un nicho desconocido.`);
  else counts[product.niche] += 1;
  if (![product.name, product.description, product.longDescription, product.category].every(nonEmpty)) errors.push(`${label} tiene contenido obligatorio vacío.`);
  if (!Number.isSafeInteger(product.price) || product.price <= 0) errors.push(`${label} tiene un precio inválido.`);
  if (!Number.isInteger(product.stock) || product.stock < 0) errors.push(`${label} tiene stock inválido.`);
  if (typeof product.active !== "boolean") errors.push(`${label} no define active como booleano.`);

  if (product.supplier?.name !== "CJ Dropshipping" || !(product.supplier?.costUsd > 0)) errors.push(`${label} no conserva proveedor/costo CJ válido.`);
  if (!validHttpsUrl(product.supplier?.sourceUrl, new Set(["developers.cjdropshipping.com"]))) errors.push(`${label} no apunta a la API oficial de CJ.`);
  if (!Array.isArray(product.images) || product.images.length < 1) errors.push(`${label} no contiene galería oficial.`);
  const images = Array.isArray(product.images) ? product.images : [];
  for (const image of images) {
    if (image?.source !== "provider" || !validHttpsUrl(image?.src, imageHosts)) errors.push(`${label} contiene una imagen no oficial o de relleno.`);
  }
  if (!images.some((image) => image.src === product.image?.src)) errors.push(`${label} no incluye su portada en la galería.`);
  if (!Array.isArray(product.variants) || product.variants.length < 1) errors.push(`${label} no tiene variantes CJ cotizables.`);
}

for (const niche of niches) {
  if (counts[niche] < 5 || counts[niche] > 10) errors.push(`${niche} debe contener entre 5 y 10 productos CJ; contiene ${counts[niche]}.`);
}

if (errors.length) {
  console.error(`Catálogo CJ inválido (${errors.length}):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`Catálogo CJ válido: ${products.length} productos (${niches.map((niche) => `${niche}=${counts[niche]}`).join(", ")}).`);
