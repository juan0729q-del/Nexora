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
  image: { src: string; alt: string; source?: "provider" | "fallback" };
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

/** Regla determinista que el cron recalcula con stock y métricas persistentes. */
export function getCatalogDecision(product: Product): CatalogDecision {
  const { salesLast30Days, conversionRate, returnRate } = product.performance;
  // Métricas desconocidas se representan como 0; no se interpretan como ventas malas.
  if (product.stock < 1 || returnRate >= 7 || (salesLast30Days > 0 && salesLast30Days < 5 && conversionRate < 1)) return "pause";
  if (product.stock < 5 || returnRate >= 4 || (conversionRate > 0 && conversionRate < 2)) return "monitor";
  return "feature";
}

export function isStoreProductAvailable(product: Product) {
  return product.active && product.stock > 0 && getCatalogDecision(product) !== "pause";
}

export const formatCOP = (amount: number) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(amount);
