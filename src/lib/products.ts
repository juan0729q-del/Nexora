import { isOfficialCjApiUrl, isOfficialCjImageUrl } from "./cj-assets";
import {
  isValidProductShippingDetails,
  isValidProviderDetails,
  isValidProviderImage,
  isValidProviderVariant,
  type ProductShippingDetails,
  type ProviderDetails,
  type ProviderImage,
  type ProviderVariant,
} from "./provider-product-details";

export type PaymentCurrency = "COP";

export const niches = {
  jewelry: {
    id: "jewelry",
    label: "Joyería",
    menuLabel: "Joyería",
    description: "Piezas de acero y detalles que elevan tu estilo.",
    supplierQuery: "necklace",
  },
  technologyHome: {
    id: "technologyHome",
    label: "Tecnología y hogar",
    menuLabel: "Tecnología/Hogar",
    description: "Tecnología funcional para un espacio mejor resuelto.",
    supplierQuery: "wireless charger",
  },
  wellbeing: {
    id: "wellbeing",
    label: "Bienestar",
    menuLabel: "Bienestar",
    description: "Herramientas para cuidar tu energía y tu rutina.",
    supplierQuery: "massager",
  },
} as const;

export type ProductNiche = keyof typeof niches;
export type ProductSupplier = {
  name: string;
  sourcePage: string;
  sourceUrl: string;
  reference: string;
  /** Costo vigente informado por CJ en USD; nunca se expone al storefront. */
  costUsd: number;
};
export type ProductPerformance = {
  salesLast30Days: number;
  conversionRate: number;
  returnRate: number;
};

/** Modelo de lectura compartido por la tienda, checkout y administración. */
export type Product = {
  slug: string;
  name: string;
  category: string;
  niche: ProductNiche;
  description: string;
  longDescription: string;
  /** Portada original de CJ, usada para LCP, tarjetas y Open Graph. */
  image: ProviderImage;
  /** Galería completa de recursos oficiales de CJ, sin placeholders ni proxies. */
  images: ProviderImage[];
  /** Descripción y especificaciones originales de CJ, transformadas a datos seguros. */
  providerDetails: ProviderDetails;
  /** Peso, empaque y propiedades logísticas comunicadas por CJ cuando existan. */
  shipping: ProductShippingDetails;
  /** Información de variantes; no se usa para cobrar hasta implementar selección por SKU. */
  variants: ProviderVariant[];
  price: number;
  compareAtPrice?: number;
  rating: number;
  reviewCount: number;
  stock: number;
  active: boolean;
  sku: string;
  material: string;
  accent: "emerald" | "silver" | "warm";
  supplier: ProductSupplier;
  performance: ProductPerformance;
};

export type CatalogDecision = "feature" | "monitor" | "pause";

// Compartido por servidor y cliente para que la disponibilidad sea idéntica
// en catálogo, ficha, botón y checkout. El umbral crítico es conservador.
const stockPauseThreshold = 2;

/** Regla determinista que el cron recalcula con stock y métricas persistentes. */
export function getCatalogDecision(product: Product): CatalogDecision {
  const { salesLast30Days, conversionRate, returnRate } = product.performance;
  // Métricas desconocidas se representan como 0; no se interpretan como ventas malas.
  if (product.stock <= stockPauseThreshold || returnRate >= 7 || (salesLast30Days > 0 && salesLast30Days < 5 && conversionRate < 1)) return "pause";
  if (product.stock < 5 || returnRate >= 4 || (conversionRate > 0 && conversionRate < 2)) return "monitor";
  return "feature";
}

export function isStoreProductAvailable(product: Product) {
  return hasNativeProviderImage(product) && product.active && product.stock > 0 && getCatalogDecision(product) !== "pause";
}

/** Invariante de Nexora: nunca renderizar ni vender imágenes sustitutas. */
export function hasNativeProviderImage(product: Product) {
  if (product.image.source !== "provider" || product.supplier.name !== "CJ Dropshipping") return false;
  return isOfficialCjImageUrl(product.image.src)
    && Array.isArray(product.images)
    && product.images.length > 0
    && product.images.every(isValidProviderImage)
    && product.images.some((image) => image.src === product.image.src)
    && isOfficialCjApiUrl(product.supplier.sourceUrl);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

/**
 * El JSON es un límite de confianza: solo llegan a la tienda registros CJ
 * completos, coherentes y con una imagen nativa HTTPS previamente validada.
 */
export function isValidCatalogProduct(value: unknown): value is Product {
  if (!isRecord(value) || !isRecord(value.image) || !isRecord(value.supplier) || !isRecord(value.performance)) return false;
  const product = value as Partial<Product>;
  const image = value.image as Partial<Product["image"]>;
  const supplier = value.supplier as Partial<ProductSupplier>;
  const performance = value.performance as Partial<ProductPerformance>;
  const strings = [product.slug, product.name, product.category, product.description, product.longDescription, product.sku, product.material];
  const hasRequiredStrings = strings.every((field) => typeof field === "string" && field.trim().length > 0);
  const numericFields = [product.price, product.rating, product.reviewCount, product.stock, performance.salesLast30Days, performance.conversionRate, performance.returnRate];
  const hasValidNumbers = numericFields.every((field) => typeof field === "number" && Number.isFinite(field) && field >= 0);
  const hasKnownNiche = typeof product.niche === "string" && product.niche in niches;
  const hasExpectedImage = isValidProviderImage(image);
  const hasProviderContent = Array.isArray(product.images)
    && product.images.length > 0
    && product.images.every(isValidProviderImage)
    && product.images.some((entry) => entry.src === image.src)
    && isValidProviderDetails(product.providerDetails)
    && isValidProductShippingDetails(product.shipping)
    && Array.isArray(product.variants)
    && product.variants.every(isValidProviderVariant);
  const hasExpectedSupplier = supplier.name === "CJ Dropshipping" && typeof supplier.sourcePage === "string" && typeof supplier.sourceUrl === "string" && typeof supplier.reference === "string" && typeof supplier.costUsd === "number" && Number.isFinite(supplier.costUsd) && supplier.costUsd > 0;
  const hasExpectedFlags = typeof product.active === "boolean" && ["emerald", "silver", "warm"].includes(product.accent || "");
  return hasRequiredStrings && hasValidNumbers && hasKnownNiche && hasExpectedImage && hasProviderContent && hasExpectedSupplier && hasExpectedFlags && hasNativeProviderImage(product as Product);
}

export const formatCOP = (amount: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
