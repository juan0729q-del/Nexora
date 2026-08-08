import { isStoreProductAvailable, type Product } from "./products";
import type { ProviderImage } from "./provider-product-details";

export type ProductPresentation = {
  title: string;
  cardDescription: string;
  detailDescription: string;
  imageAlt: string;
};

type EditorialCopy = Omit<ProductPresentation, "imageAlt">;

/** Datos públicos mínimos que pueden cruzar al componente de compra cliente. */
export type StorefrontProduct = Pick<
  Product,
  "slug" | "name" | "category" | "sku" | "image" | "price" | "compareAtPrice" | "rating" | "reviewCount" | "stock"
> & {
  available: boolean;
  /** Referencias de variante aptas para que el cliente cotice; el servidor
   * conserva y valida los identificadores/logística privados de CJ. */
  variants: Array<{ sku: string; label: string; options?: string; image?: ProviderImage }>;
};

/**
 * Capa editorial para el storefront. El JSON de CJ conserva el nombre y la
 * descripción originales para trazabilidad, mientras la interfaz muestra una
 * redacción clara y natural para el mercado hispanohablante.
 */
const copyBySku: Record<string, EditorialCopy> = {
  CJLX1237838: {
    title: "Collar Árbol de la Vida con Cristal",
    cardDescription: "Un amuleto de inspiración natural con cristal que acompaña tus días con un brillo sereno y personal.",
    detailDescription: "El motivo del árbol de la vida y su columna de cristal crean una pieza con presencia suave. Es ese detalle especial que transforma una salida cotidiana en un look con intención.",
  },
  CJLX1206870: {
    title: "Collar de Cristales 7 Chakras",
    cardDescription: "Una pieza de piedra natural y aire espiritual para volver más intencional tu rutina de yoga o tu look diario.",
    detailDescription: "Sus cristales de colores dan a este collar un carácter expresivo y luminoso. Llévalo como un recordatorio visual para reservar un momento para ti, incluso en los días más activos.",
  },
  CJZBLXLX06494: {
    title: "Colgante Árbol de la Vida Kabbalah",
    cardDescription: "Cobre, piedra natural y cordón de cuero en un talismán visual que añade carácter a cualquier look.",
    detailDescription: "Una combinación de texturas cálidas para quienes buscan accesorios con historia visual. Su silueta de árbol de la vida acompaña tanto estilos relajados como momentos que merecen un detalle distinto.",
  },
  CJLX1214580: {
    title: "Collar Corazón Cardinal",
    cardDescription: "Un detalle romántico en tono plata, pensado para celebrar un vínculo, una fecha especial o a ti.",
    detailDescription: "El corazón y el cardinal convierten este colgante en una pieza cargada de intención. Un regalo delicado para expresar cariño sin necesidad de decir demasiado.",
  },
  CJZBLXLX02215: {
    title: "Collar Luna y Estrella",
    cardDescription: "Un destello delicado con acabado brillante para cerrar tu look con una nota de cielo nocturno.",
    detailDescription: "La luna y la estrella aportan un brillo sutil que combina con capas, escotes y momentos especiales. Una pieza fácil de llevar cuando quieres sumar magia sin recargar tu estilo.",
  },
  CJXFZNZN00558: {
    title: "Difusor de Bruma Ambiente",
    cardDescription: "Una pieza compacta que suma bruma, luz LED y una atmósfera más agradable a tus espacios.",
    detailDescription: "Convierte una esquina de casa o tu escritorio en un pequeño refugio visual. Su formato compacto está pensado para acompañar tus pausas y hacer que el ambiente se sienta más cuidado.",
  },
  CJJJCFCF00469: {
    title: "Organizador Multifuncional de Cocina",
    cardDescription: "Mantén cuchillos y utensilios a mano con un organizador que devuelve calma visual a tu cocina.",
    detailDescription: "Cuando cada utensilio tiene su lugar, cocinar se siente más simple. Esta pieza ayuda a despejar la superficie y dejar lo esencial listo para el siguiente momento en la cocina.",
  },
  CJJJJTCF01196: {
    title: "Cuchara de Cocina 4 en 1",
    cardDescription: "Una aliada práctica para servir, escurrir y mezclar, creada para que cocinar se sienta más simple.",
    detailDescription: "Pensada para acompañar recetas de todos los días, reúne varias funciones en una sola pieza. Un pequeño ajuste que puede hacer tu cocina más ágil y ordenada.",
  },
  CJJJJTCF00671: {
    title: "Medidor de Porciones para Pasta",
    cardDescription: "El detalle compacto que convierte cada pasta en una porción a tu medida y una mesa bien pensada.",
    detailDescription: "Una herramienta discreta para quienes disfrutan cuidar los detalles al cocinar. Úsala para preparar porciones con más intención y servir con tranquilidad.",
  },
  CJJJCFCF00523: {
    title: "Soporte Magnético para Utensilios",
    cardDescription: "Un organizador que libera superficie y mantiene tus herramientas de cocina siempre a la vista.",
    detailDescription: "Dale orden a tus herramientas favoritas sin esconderlas. Su propuesta magnética convierte una pared o zona de trabajo en un espacio más claro, accesible y listo para crear.",
  },
  CJMJ1980349: {
    title: "Rodillo Facial de Hielo en Silicona",
    cardDescription: "Un gesto fresco para pausar, masajear y renovar la sensación de tu rutina de cuidado.",
    detailDescription: "Un minuto para ti también cuenta. Este rodillo aporta una sensación fresca a tu ritual de rostro, ideal para empezar el día con calma o cerrar la noche con un pequeño respiro.",
  },
  CJBJMRPF00214: {
    title: "Esponja Facial de Konjac",
    cardDescription: "Una textura de fibra de konjac para transformar la limpieza diaria en un ritual suave y consciente.",
    detailDescription: "Haz de tu limpieza un momento más amable. Su textura de konjac acompaña una rutina facial sencilla y te invita a bajar el ritmo durante unos minutos.",
  },
  CJPF1516421: {
    title: "Crema Corporal Bronceado Dorado",
    cardDescription: "Una crema corporal para añadir un toque cálido y luminoso a tu ritual de piel.",
    detailDescription: "Un gesto de cuidado para cuando quieres sentir la piel acompañada por un acabado dorado. Incorpórala a tu rutina como ese toque final que eleva un momento cotidiano.",
  },
  CJPF1675580: {
    title: "Esencia Facial 24K con Colágeno",
    cardDescription: "Una esencia facial para acompañar tu ritual de hidratación con un gesto de lujo diario.",
    detailDescription: "Su formato de esencia convierte unos minutos de cuidado facial en un momento especial. Una propuesta pensada para quienes disfrutan una rutina con sensación de detalle y presencia.",
  },
  CJYD2021218: {
    title: "Masajeador de Ojos con Luz y Calor",
    cardDescription: "Una pausa de cuidado con tres intensidades, luz de color y calor suave para cerrar el día con intención.",
    detailDescription: "Reserva un momento para bajar el ritmo después de una jornada intensa. Sus opciones de intensidad, luz y calor hacen de este masajeador un acompañante para tu ritual nocturno.",
  },
};

function cleanProviderText(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * El fallback evita que una próxima sincronización muestre HTML de CJ. Los
 * productos actuales tienen copy curado arriba; los nuevos siguen siendo
 * seguros y legibles mientras reciben su edición comercial.
 */
export function getProductPresentation(product: Pick<Product, "sku" | "name" | "category">): ProductPresentation {
  const editorialCopy = copyBySku[product.sku];

  if (editorialCopy) {
    return {
      ...editorialCopy,
      imageAlt: `${editorialCopy.title}. Imagen original del proveedor CJ Dropshipping.`,
    };
  }

  const title = cleanProviderText(product.name) || "Selección Nexora";
  const category = cleanProviderText(product.category).toLocaleLowerCase("es-CO");
  const categoryHint = category ? ` para ${category}` : "";

  return {
    title,
    cardDescription: `Una selección Nexora${categoryHint}, elegida para sumar intención y utilidad a tu rutina.`,
    detailDescription: `Una propuesta Nexora${categoryHint} con imagen original del proveedor. Estamos preparando una historia comercial detallada para acompañar sus especificaciones verificadas.`,
    imageAlt: `${title}. Imagen original del proveedor CJ Dropshipping.`,
  };
}

/**
 * Impide que el cliente reciba descripciones crudas, métricas operativas,
 * URLs internas de proveedor o costos. El checkout solo necesita el slug y
 * vuelve a validar el producto completo dentro del Route Handler.
 */
export function toStorefrontProduct(product: Product): StorefrontProduct {
  const presentation = getProductPresentation(product);

  return {
    slug: product.slug,
    name: presentation.title,
    category: product.category,
    sku: product.sku,
    image: { ...product.image, alt: presentation.imageAlt },
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    rating: product.rating,
    reviewCount: product.reviewCount,
    stock: product.stock,
    available: isStoreProductAvailable(product),
    variants: product.variants.map((variant) => ({
      sku: variant.sku,
      label: variant.label,
      options: variant.options,
      // Un producto de variante única puede reutilizar su imagen principal,
      // que también procede de CJ. Nunca se construye una imagen sustituta.
      image: variant.image || (product.variants.length === 1 ? product.image : undefined),
    })),
  };
}
