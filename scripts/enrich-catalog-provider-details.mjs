import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const catalogPath = resolve("src/data/catalog.json");
const hostsPath = resolve("src/data/cj-image-hosts.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
const allowedHosts = new Set(JSON.parse(await readFile(hostsPath, "utf8")));

function officialImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.has(url.hostname);
  } catch {
    return false;
  }
}

function decode(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: '"' };
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, token) => {
    const key = token.toLowerCase();
    if (key in named) return named[key];
    const numeric = key.startsWith("#x") ? Number.parseInt(key.slice(2), 16) : key.startsWith("#") ? Number.parseInt(key.slice(1), 10) : NaN;
    return Number.isFinite(numeric) && numeric <= 0x10ffff ? String.fromCodePoint(numeric) : entity;
  });
}

function clean(value) {
  return decode(value).replace(/\u00a0/g, " ").replace(/[\t ]+/g, " ").trim();
}

function textFromHtml(value) {
  return clean(String(value || "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(?:script|style)[^>]*>[\s\S]*?<\s*\/\s*(?:script|style)\s*>/gi, "")
    .replace(/<\s*img\b[^>]*>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/\s*(?:p|div|li|h[1-6]|tr)\s*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "• ")
    .replace(/<[^>]*>/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n"));
}

function heading(value) {
  const normalized = value.toLowerCase().replace(/[\s:.-]+$/g, "").trim();
  const titles = [
    [/^(overview|description|product overview)/, "Descripción del proveedor"],
    [/^(product information|product details|information|details)/, "Información del producto"],
    [/^(size information|size chart|dimensions?|measurements?)/, "Medidas y dimensiones"],
    [/^(packing list|package contents?|packing information|package list)/, "Contenido del paquete"],
    [/^(specifications?|features?|parameters?)/, "Especificaciones"],
    [/^(notes?|notice|attention|warm tips?)/, "Notas del proveedor"],
  ];
  return titles.find(([pattern]) => pattern.test(normalized))?.[1];
}

function unique(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function detailsFromHtml(value) {
  const description = textFromHtml(value);
  const lines = description.split("\n").map(clean).filter(Boolean);
  const sections = [];
  let title = "Descripción del proveedor";
  let content = [];
  const flush = () => {
    const next = unique(content);
    if (!next.length) return;
    const existing = sections.find((section) => section.title === title);
    if (existing) existing.content.push(...next.filter((line) => !existing.content.includes(line)));
    else sections.push({ title, content: next });
  };
  for (const line of lines) {
    const nextTitle = heading(line);
    if (nextTitle) {
      flush();
      title = nextTitle;
      content = [];
    } else content.push(line);
  }
  flush();
  const safeSections = sections.length ? sections : [{ title: "Descripción del proveedor", content: [description] }];
  const specifications = [];
  for (const line of safeSections.flatMap((section) => section.content)) {
    const match = line.match(/^([^:]{1,64}):\s*(.+)$/);
    if (!match) continue;
    const label = clean(match[1].replace(/^[•\d.\-\s]+/, ""));
    const detail = clean(match[2]);
    if (!label || !detail || /\d/.test(label) || !/^[\p{L}\s/()&+\-]+$/u.test(label)) continue;
    if (!specifications.some((entry) => entry.label.toLowerCase() === label.toLowerCase() && entry.value === detail)) specifications.push({ label, value: detail });
  }
  return {
    description,
    sections: safeSections,
    specifications,
    packageContents: unique(safeSections.filter((section) => section.title === "Contenido del paquete").flatMap((section) => section.content)),
  };
}

function extractImages(value) {
  const matches = String(value || "").matchAll(/<\s*img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi);
  return [...matches].map((match) => decode(match[1] || match[2] || match[3] || "").trim()).filter(officialImage);
}

let changed = false;
catalog.products = catalog.products.map((product) => {
  const sourceDescription = product.description || product.longDescription || "";
  const imageUrls = [product.image?.src, ...(product.images || []).map((image) => image.src), ...extractImages(sourceDescription)]
    .filter(officialImage);
  const uniqueUrls = [...new Set(imageUrls)];
  if (!uniqueUrls.length) throw new Error(`${product.sku || product.slug} no tiene imagen oficial CJ; se canceló la migración.`);
  const images = uniqueUrls.map((src) => ({ src, alt: product.name, source: "provider" }));
  const next = {
    ...product,
    image: { ...images[0], alt: product.image?.alt || product.name },
    images,
    providerDetails: detailsFromHtml(sourceDescription),
    shipping: product.shipping || { logisticsProperties: [] },
    variants: product.variants || [],
  };
  if (JSON.stringify(next) !== JSON.stringify(product)) changed = true;
  return next;
});

if (!changed) {
  console.log("Las fichas actuales ya incluyen detalles y galería CJ; no se modificó catalog.json.");
  process.exit(0);
}

catalog.version = Number.isInteger(catalog.version) ? catalog.version + 1 : 1;
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Fichas CJ enriquecidas: ${catalog.products.length} productos; galería y datos seguros versionados.`);
