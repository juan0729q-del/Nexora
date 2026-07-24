export type PaymentCurrency = "COP";

export type ProductSupplier = { name: string; sourcePage: string; sourceUrl: string; reference: string };
export type ProductPerformance = { salesLast30Days: number; conversionRate: number; returnRate: number };

export type Product = {
  slug: string; name: string; category: string; description: string; longDescription: string;
  image: { src: string; alt: string }; price: number; compareAtPrice?: number; rating: number;
  reviewCount: number; stock: number; active: boolean; sku: string; material: string;
  accent: "emerald" | "silver" | "warm"; supplier: ProductSupplier; performance: ProductPerformance;
};

export type CatalogDecision = "feature" | "monitor" | "pause";

/** Fuente única de tienda, checkout, detalle y dashboard. */
const catalog: readonly Product[] = [
  {
    slug: "set-joyeria-acero-titanio", name: "Set de joyería Acero Titanio", category: "Moda masculina", description: "Cadena y pulsera con presencia sobria para todos los días.", longDescription: "Un set de joyería de acero titanio diseñado para completar un look masculino con una silueta limpia, resistente y fácil de combinar.", image: { src: "/products/joyeria-acero-titanio.png", alt: "Set de cadena y pulsera de acero titanio sobre una base negra" }, price: 129900, compareAtPrice: 159900, rating: 4.8, reviewCount: 126, stock: 14, active: true, sku: "NX-JOY-001", material: "Acero titanio", accent: "silver", supplier: { name: "CJ Dropshipping", sourcePage: "Catálogo de joyería", sourceUrl: "https://cjdropshipping.com/", reference: "CJ-NX-JOY-001" }, performance: { salesLast30Days: 34, conversionRate: 5.4, returnRate: 1.2 },
  },
  {
    slug: "estacion-carga-eco-bamboo", name: "Estación de carga Eco-Bamboo", category: "Tecnología", description: "Ordena tu escritorio y carga tus dispositivos en un solo lugar.", longDescription: "La estación de carga Eco-Bamboo combina organización y tecnología para mantener teléfono, reloj y accesorios al alcance, con una presencia cálida sobre tu escritorio.", image: { src: "/products/estacion-carga-eco-bamboo.png", alt: "Estación de carga de bambú para teléfono, reloj y audífonos" }, price: 189900, rating: 4.9, reviewCount: 84, stock: 8, active: true, sku: "NX-TEC-002", material: "Bambú certificado", accent: "warm", supplier: { name: "CJ Dropshipping", sourcePage: "Catálogo de hogar y electrónica", sourceUrl: "https://cjdropshipping.com/", reference: "CJ-NX-TEC-002" }, performance: { salesLast30Days: 29, conversionRate: 5.1, returnRate: 0.8 },
  },
  {
    slug: "corrector-postura-inteligente", name: "Corrector de postura inteligente", category: "Bienestar", description: "Una señal suave para volver a una postura más consciente.", longDescription: "Un corrector de postura inteligente que acompaña tus jornadas de trabajo y movimiento con recordatorios discretos para construir mejores hábitos corporales.", image: { src: "/products/corrector-postura-inteligente.png", alt: "Corrector de postura inteligente negro con correa ajustable" }, price: 149900, compareAtPrice: 179900, rating: 4.7, reviewCount: 63, stock: 3, active: true, sku: "NX-BIE-003", material: "Sensor háptico", accent: "emerald", supplier: { name: "CJ Dropshipping", sourcePage: "Catálogo de bienestar", sourceUrl: "https://cjdropshipping.com/", reference: "CJ-NX-BIE-003" }, performance: { salesLast30Days: 22, conversionRate: 4.6, returnRate: 1.8 },
  },
  {
    slug: "cadena-eslabones-titanio", name: "Cadena de eslabones Titanio", category: "Moda masculina", description: "Una cadena de perfil limpio para elevar combinaciones diarias.", longDescription: "Cadena de acero titanio con acabado pulido y una construcción creada para uso frecuente.", image: { src: "/products/joyeria-acero-titanio.png", alt: "Cadena de eslabones de acero titanio sobre una base negra" }, price: 89900, rating: 4.6, reviewCount: 41, stock: 21, active: true, sku: "NX-JOY-004", material: "Acero titanio", accent: "silver", supplier: { name: "CJ Dropshipping", sourcePage: "Catálogo de joyería", sourceUrl: "https://cjdropshipping.com/", reference: "CJ-NX-JOY-004" }, performance: { salesLast30Days: 18, conversionRate: 4.3, returnRate: 1.4 },
  },
  {
    slug: "soporte-carga-bamboo-mini", name: "Soporte de carga Bamboo Mini", category: "Tecnología", description: "Base compacta para conservar orden y energía en tu espacio.", longDescription: "Un soporte de escritorio en bambú pensado para mantener el teléfono visible mientras se carga.", image: { src: "/products/estacion-carga-eco-bamboo.png", alt: "Soporte de carga compacto de bambú para escritorio" }, price: 99900, rating: 4.5, reviewCount: 36, stock: 17, active: true, sku: "NX-TEC-005", material: "Bambú certificado", accent: "warm", supplier: { name: "CJ Dropshipping", sourcePage: "Catálogo de hogar y electrónica", sourceUrl: "https://cjdropshipping.com/", reference: "CJ-NX-TEC-005" }, performance: { salesLast30Days: 16, conversionRate: 4.1, returnRate: 1.1 },
  },
  {
    slug: "corrector-postura-active", name: "Corrector de postura Active", category: "Bienestar", description: "Soporte ajustable para jornadas largas y movimiento cotidiano.", longDescription: "Corrector de postura con bandas ajustables, ideado para acompañar una rutina de movilidad consciente.", image: { src: "/products/corrector-postura-inteligente.png", alt: "Corrector de postura Active negro con bandas ajustables" }, price: 119900, rating: 4.2, reviewCount: 12, stock: 11, active: true, sku: "NX-BIE-006", material: "Tejido técnico ajustable", accent: "emerald", supplier: { name: "CJ Dropshipping", sourcePage: "Catálogo de bienestar", sourceUrl: "https://cjdropshipping.com/", reference: "CJ-NX-BIE-006" }, performance: { salesLast30Days: 3, conversionRate: 0.7, returnRate: 8.2 },
  },
];

/** Regla determinista que el cron puede recalcular con datos reales de analytics. */
export function getCatalogDecision(product: Product): CatalogDecision {
  const { salesLast30Days, conversionRate, returnRate } = product.performance;
  if (product.stock < 1 || returnRate >= 7 || (salesLast30Days < 5 && conversionRate < 1)) return "pause";
  if (product.stock < 5 || returnRate >= 4 || conversionRate < 2) return "monitor";
  return "feature";
}

export const products = catalog;
export function getCatalog() { return catalog; }
export function getStoreCatalog() { return catalog.filter((product) => product.active && getCatalogDecision(product) !== "pause"); }
export function isStoreProductAvailable(product: Product) { return product.active && product.stock > 0 && getCatalogDecision(product) !== "pause"; }
export function getProduct(slug: string) { return catalog.find((product) => product.slug === slug); }
export const formatCOP = (amount: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
