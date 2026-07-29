import { isOfficialCjImageUrl } from "./cj-assets";

/** Recurso visual original recibido de CJ y apto para renderizarse en Nexora. */
export type ProviderImage = {
  src: string;
  alt: string;
  source: "provider";
};

export type ProviderSpecification = {
  label: string;
  value: string;
};

export type ProviderContentSection = {
  title: string;
  content: string[];
};

/**
 * Contenido textual de CJ convertido a datos, nunca a HTML ejecutable. El
 * texto sigue siendo el entregado por el proveedor, pero puede mostrarse sin
 * scripts, estilos, enlaces ni etiquetas externas.
 */
export type ProviderDetails = {
  description: string;
  sections: ProviderContentSection[];
  specifications: ProviderSpecification[];
  packageContents: string[];
};

export type ProductDimensions = {
  lengthMm?: number;
  widthMm?: number;
  heightMm?: number;
};

/** Variante oficial de CJ; el checkout la selecciona y la conserva en el pedido. */
export type ProviderVariant = {
  /** Identificador de variante oficial de CJ, necesario para cotizar el flete. */
  providerVariantId?: string;
  sku: string;
  label: string;
  options?: string;
  image?: ProviderImage;
  dimensions?: ProductDimensions;
  weightGrams?: number;
  /** Volumen nativo de CJ (mm³); se convierte a cm³ sólo en la cotización. */
  volumeCubicMillimeters?: number;
  /** Costo base vigente informado por CJ en USD; no se expone al storefront. */
  supplierCostUsd?: number;
};

export type ProductShippingDetails = {
  productWeightGrams?: number;
  packingWeightGrams?: number;
  unit?: string;
  logisticsProperties: string[];
};

const namedEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

function decodeHtml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, token: string) => {
    const normalized = token.toLowerCase();
    if (normalized in namedEntities) return namedEntities[normalized];
    const numeric = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : normalized.startsWith("#")
        ? Number.parseInt(normalized.slice(1), 10)
        : NaN;
    return Number.isFinite(numeric) && numeric >= 0 && numeric <= 0x10ffff
      ? String.fromCodePoint(numeric)
      : entity;
  });
}

function cleanLine(value: string) {
  return decodeHtml(value)
    .replace(/\u00a0/g, " ")
    .replace(/[\t ]+/g, " ")
    .trim();
}

/** Convierte el HTML de una ficha de CJ en texto seguro, conservando saltos útiles. */
export function providerHtmlToText(value: string) {
  return cleanLine(
    value
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
      .replace(/\n{3,}/g, "\n\n"),
  );
}

function titleForProviderLine(value: string) {
  const normalized = value.toLowerCase().replace(/[\s:.-]+$/g, "").trim();
  const titles: Array<[RegExp, string]> = [
    [/^(overview|description|product overview)/, "Descripción del proveedor"],
    [/^(product information|product details|information|details)/, "Información del producto"],
    [/^(size information|size chart|dimensions?|measurements?)/, "Medidas y dimensiones"],
    [/^(packing list|package contents?|packing information|package list)/, "Contenido del paquete"],
    [/^(specifications?|features?|parameters?)/, "Especificaciones"],
    [/^(notes?|notice|attention|warm tips?)/, "Notas del proveedor"],
  ];
  return titles.find(([pattern]) => pattern.test(normalized))?.[1];
}

function isSpecificationLine(value: string) {
  const match = value.match(/^([^:]{1,64}):\s*(.+)$/);
  if (!match) return undefined;
  const label = cleanLine(match[1].replace(/^[•\d.\-\s]+/, ""));
  const detail = cleanLine(match[2]);
  // No tratamos párrafos enumerados como propiedades técnicas.
  if (!label || !detail || /\d/.test(label) || !/^[\p{L}\s/()&+\-]+$/u.test(label)) return undefined;
  return { label, value: detail };
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values.map(cleanLine).filter(Boolean))];
}

/** Estructura la descripción oficial sin alterar ni inventar su contenido. */
export function createProviderDetails(description: string): ProviderDetails {
  const text = providerHtmlToText(description);
  const lines = text.split("\n").map(cleanLine).filter(Boolean);
  const sections: ProviderContentSection[] = [];
  let title = "Descripción del proveedor";
  let content: string[] = [];

  const flush = () => {
    const normalizedContent = uniqueStrings(content);
    if (!normalizedContent.length) return;
    const existing = sections.find((section) => section.title === title);
    if (existing) existing.content.push(...normalizedContent.filter((line) => !existing.content.includes(line)));
    else sections.push({ title, content: normalizedContent });
  };

  for (const line of lines) {
    const nextTitle = titleForProviderLine(line);
    if (nextTitle) {
      flush();
      title = nextTitle;
      content = [];
      continue;
    }
    content.push(line);
  }
  flush();

  const safeSections = sections.length ? sections : text ? [{ title: "Descripción del proveedor", content: [text] }] : [];
  const specifications = uniqueStrings(safeSections.flatMap((section) => section.content))
    .map(isSpecificationLine)
    .filter((entry): entry is ProviderSpecification => Boolean(entry));
  const packageContents = uniqueStrings(
    safeSections
      .filter((section) => section.title === "Contenido del paquete")
      .flatMap((section) => section.content),
  );

  return {
    description: text,
    sections: safeSections,
    specifications: specifications.filter((entry, index, entries) => entries.findIndex((candidate) => candidate.label.toLowerCase() === entry.label.toLowerCase() && candidate.value === entry.value) === index),
    packageContents,
  };
}

/** Obtiene únicamente fuentes visuales HTTPS servidas por los hosts oficiales de CJ. */
export function extractOfficialCjImageUrls(value: string) {
  const urls: string[] = [];
  const imagePattern = /<\s*img\b[^>]*?\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))[^>]*>/gi;
  for (const match of value.matchAll(imagePattern)) {
    const url = decodeHtml(match[1] || match[2] || match[3] || "").trim();
    if (isOfficialCjImageUrl(url)) urls.push(url);
  }
  return [...new Set(urls)];
}

function imageFrom(value: unknown, alt: string): ProviderImage | undefined {
  return isOfficialCjImageUrl(value) ? { src: value, alt, source: "provider" } : undefined;
}

/** Conserva el orden del proveedor: portada, set de producto, descripción y variantes. */
export function createProviderImages({
  alt,
  primary,
  productImageSet = [],
  description = "",
  variantImageSet = [],
}: {
  alt: string;
  primary?: unknown;
  productImageSet?: readonly unknown[];
  description?: string;
  variantImageSet?: readonly unknown[];
}) {
  const candidates = [primary, ...productImageSet, ...extractOfficialCjImageUrls(description), ...variantImageSet];
  const images: ProviderImage[] = [];
  for (const candidate of candidates) {
    const image = imageFrom(candidate, alt);
    if (image && !images.some((entry) => entry.src === image.src)) images.push(image);
  }
  return images;
}

function validPositiveNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isValidProviderImage(value: unknown): value is ProviderImage {
  if (!value || typeof value !== "object") return false;
  const image = value as Partial<ProviderImage>;
  return image.source === "provider" && typeof image.alt === "string" && image.alt.trim().length > 0 && isOfficialCjImageUrl(image.src);
}

export function isValidProviderDetails(value: unknown): value is ProviderDetails {
  if (!value || typeof value !== "object") return false;
  const details = value as Partial<ProviderDetails>;
  return typeof details.description === "string"
    && details.description.trim().length > 0
    && Array.isArray(details.sections)
    && details.sections.every((section) => Boolean(section) && typeof section.title === "string" && section.title.trim().length > 0 && Array.isArray(section.content) && section.content.every((line) => typeof line === "string" && line.trim().length > 0))
    && Array.isArray(details.specifications)
    && details.specifications.every((specification) => Boolean(specification) && typeof specification.label === "string" && typeof specification.value === "string")
    && Array.isArray(details.packageContents)
    && details.packageContents.every((item) => typeof item === "string" && item.trim().length > 0);
}

export function isValidProviderVariant(value: unknown): value is ProviderVariant {
  if (!value || typeof value !== "object") return false;
  const variant = value as ProviderVariant;
  const dimensions = variant.dimensions;
  const validDimensions = dimensions === undefined || (typeof dimensions === "object" && Object.values(dimensions).every((dimension) => dimension === undefined || validPositiveNumber(dimension)));
  return typeof variant.sku === "string"
    && variant.sku.trim().length > 0
    && (variant.providerVariantId === undefined || (typeof variant.providerVariantId === "string" && variant.providerVariantId.trim().length > 0))
    && typeof variant.label === "string"
    && variant.label.trim().length > 0
    && (variant.options === undefined || typeof variant.options === "string")
    && (variant.image === undefined || isValidProviderImage(variant.image))
    && validDimensions
    && (variant.weightGrams === undefined || validPositiveNumber(variant.weightGrams))
    && (variant.volumeCubicMillimeters === undefined || validPositiveNumber(variant.volumeCubicMillimeters))
    && (variant.supplierCostUsd === undefined || validPositiveNumber(variant.supplierCostUsd));
}

export function isValidProductShippingDetails(value: unknown): value is ProductShippingDetails {
  if (!value || typeof value !== "object") return false;
  const shipping = value as ProductShippingDetails;
  return (shipping.productWeightGrams === undefined || validPositiveNumber(shipping.productWeightGrams))
    && (shipping.packingWeightGrams === undefined || validPositiveNumber(shipping.packingWeightGrams))
    && (shipping.unit === undefined || typeof shipping.unit === "string")
    && Array.isArray(shipping.logisticsProperties)
    && shipping.logisticsProperties.every((property) => typeof property === "string" && property.trim().length > 0);
}
