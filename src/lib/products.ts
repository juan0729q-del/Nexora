export type PaymentCurrency = "COP";

export type Product = {
  slug: string;
  name: string;
  category: string;
  description: string;
  longDescription: string;
  image: { src: string; alt: string };
  price: number;
  compareAtPrice?: number;
  rating: number;
  reviewCount: number;
  stock: number;
  active: boolean;
  sku: string;
  material: string;
  accent: "emerald" | "silver" | "warm";
};

// Fuente única de catálogo para la tienda, el detalle, el checkout y el dashboard.
// Al conectar una base de datos, sustituye esta constante en getCatalog() sin alterar consumidores.
const catalog: readonly Product[] = [
  { slug: "set-joyeria-acero-titanio", name: "Set de joyería Acero Titanio", category: "Moda masculina", description: "Cadena y pulsera con presencia sobria para todos los días.", longDescription: "Un set de joyería de acero titanio diseñado para completar un look masculino con una silueta limpia, resistente y fácil de combinar.", image: { src: "/products/joyeria-acero-titanio.png", alt: "Set de cadena y pulsera de acero titanio sobre una base negra" }, price: 129900, compareAtPrice: 159900, rating: 4.8, reviewCount: 126, stock: 14, active: true, sku: "NX-JOY-001", material: "Acero titanio", accent: "silver" },
  { slug: "estacion-carga-eco-bamboo", name: "Estación de carga Eco-Bamboo", category: "Tecnología", description: "Ordena tu escritorio y carga tus dispositivos en un solo lugar.", longDescription: "La estación de carga Eco-Bamboo combina organización y tecnología para mantener teléfono, reloj y accesorios al alcance, con una presencia cálida sobre tu escritorio.", image: { src: "/products/estacion-carga-eco-bamboo.png", alt: "Estación de carga de bambú para teléfono, reloj y audífonos" }, price: 189900, rating: 4.9, reviewCount: 84, stock: 8, active: true, sku: "NX-TEC-002", material: "Bambú certificado", accent: "warm" },
  { slug: "corrector-postura-inteligente", name: "Corrector de postura inteligente", category: "Bienestar", description: "Una señal suave para volver a una postura más consciente.", longDescription: "Un corrector de postura inteligente que acompaña tus jornadas de trabajo y movimiento con recordatorios discretos para construir mejores hábitos corporales.", image: { src: "/products/corrector-postura-inteligente.png", alt: "Corrector de postura inteligente negro con correa ajustable" }, price: 149900, compareAtPrice: 179900, rating: 4.7, reviewCount: 63, stock: 3, active: true, sku: "NX-BIE-003", material: "Sensor háptico", accent: "emerald" },
];

export const products = catalog;
export function getCatalog() { return catalog; }
export function getProduct(slug: string) { return catalog.find((product) => product.slug === slug); }
export const formatCOP = (amount: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);
