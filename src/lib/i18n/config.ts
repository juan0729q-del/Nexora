export const markets = {
  co: {
    id: "co",
    countryCode: "CO",
    locale: "es-CO",
    language: "es",
    currency: "COP",
    label: "Colombia",
    homePath: "/co",
    productSegment: "productos",
    cartSegment: "carrito",
    categorySlugs: {
      jewelry: "joyeria",
      technologyHome: "tecnologia-y-hogar",
      wellbeing: "bienestar",
    },
  },
  us: {
    id: "us",
    countryCode: "US",
    locale: "en-US",
    language: "en",
    currency: "USD",
    label: "United States",
    homePath: "/us",
    productSegment: "products",
    cartSegment: "cart",
    categorySlugs: {
      jewelry: "jewelry",
      technologyHome: "technology-and-home",
      wellbeing: "wellbeing",
    },
  },
} as const;

export type Market = keyof typeof markets;
export type StoreLocale = (typeof markets)[Market]["locale"];
export type StoreCurrency = (typeof markets)[Market]["currency"];
export type LocalizedCategorySlug = (typeof markets)[Market]["categorySlugs"][keyof (typeof markets)[Market]["categorySlugs"]];

export const marketIds = Object.keys(markets) as Market[];

export function isMarket(value: string): value is Market {
  return value in markets;
}

export function marketFromCountry(countryCode: string | null | undefined): Market {
  return countryCode?.trim().toUpperCase() === "US" ? "us" : "co";
}

export function productPath(market: Market, slug: string) {
  return `${markets[market].homePath}/${markets[market].productSegment}/${slug}`;
}

export function cartPath(market: Market) {
  return `${markets[market].homePath}/${markets[market].cartSegment}`;
}

export function categoryPath(market: Market, niche: keyof (typeof markets)[Market]["categorySlugs"]) {
  return `${markets[market].homePath}/${markets[market].categorySlugs[niche]}`;
}

export function localizedPathForMarket(pathname: string, target: Market) {
  const source = pathname.split("/").filter(Boolean)[0];
  const sourceMarket = isMarket(source) ? source : "co";
  const sourceConfig = markets[sourceMarket];
  const targetConfig = markets[target];

  const productPrefix = `${sourceConfig.homePath}/${sourceConfig.productSegment}/`;
  if (pathname.startsWith(productPrefix)) return productPath(target, pathname.slice(productPrefix.length));
  if (pathname === cartPath(sourceMarket)) return cartPath(target);

  const niche = (Object.keys(sourceConfig.categorySlugs) as Array<keyof typeof sourceConfig.categorySlugs>)
    .find((key) => pathname === categoryPath(sourceMarket, key));
  if (niche) return categoryPath(target, niche);

  const sourceTrust = pathname.startsWith(`${sourceConfig.homePath}/`)
    ? pathname.slice(sourceConfig.homePath.length + 1)
    : "";
  const trustPairs: Record<string, string> = {
    contacto: "contact", envios: "shipping", devoluciones: "returns", privacidad: "privacy",
    terminos: "terms", pagos: "payments", "preguntas-frecuentes": "faq",
    contact: "contacto", shipping: "envios", returns: "devoluciones", privacy: "privacidad",
    terms: "terminos", payments: "pagos", faq: "preguntas-frecuentes",
  };
  const translatedTrust = trustPairs[sourceTrust];
  if (translatedTrust) return `${targetConfig.homePath}/${translatedTrust}`;
  return targetConfig.homePath;
}

export function formatMoney(amount: number, market: Market) {
  const { locale, currency } = markets[market];
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "COP" ? 0 : 2,
    minimumFractionDigits: currency === "COP" ? 0 : 2,
  }).format(amount);
}

export const dictionaries = {
  "es-CO": {
    skip: "Saltar al contenido",
    navigation: "Navegación principal",
    mobileNavigation: "Navegación móvil",
    jewelry: "Joyería",
    technology: "Tecnología y hogar",
    aiTechnology: "Tecnología con IA",
    wellbeing: "Bienestar",
    cart: "Carrito",
    market: "País, idioma y moneda",
    heroEyebrow: "Selección inteligente",
    heroTitle: "Diseño que eleva tu rutina.",
    heroDescription: "Joyería, tecnología para el hogar y bienestar seleccionados con trazabilidad del proveedor.",
    exploreJewelry: "Explorar joyería",
    seeTechnology: "Ver tecnología",
    catalog: "Catálogo",
    verified: "Verificado",
    payment: "Pago",
    protected: "Protegido",
    images: "Imágenes",
    original: "Originales",
    purposeEyebrow: "Nuestro estándar",
    purposeTitle: "Menos ruido. Más intención.",
    purposeOne: "Evaluamos utilidad, información disponible y calidad visual antes de publicar un producto. Cada nicho rota de forma independiente.",
    purposeTwo: "Las automatizaciones proponen cambios de catálogo bajo supervisión humana y conservan la fuente original de CJ.",
    products: "Productos",
    contact: "Contacto",
    shipping: "Envíos",
    returns: "Devoluciones",
    privacy: "Privacidad",
    terms: "Términos",
    payments: "Métodos de pago",
    faq: "Preguntas frecuentes",
    footerTagline: "Diseño que eleva tu rutina.",
    noReviews: "Nuevo · sin reseñas verificadas",
    style: "Estilo",
    selectStyle: "Selecciona un estilo",
    quantity: "Cantidad",
    addToCart: "Agregar al carrito",
    viewCart: "Ver carrito",
    viewProduct: "Ver",
    shippingCalculated: "El envío real se cotiza para todo el carrito antes de pagar.",
    unavailable: "No disponible",
    outOfStock: "Agotado",
    selectStyleHelp: "Elige un estilo para continuar con tu compra.",
    lastUnits: "Últimas unidades",
    categoryEyebrow: "Selección Nexora",
    emptyCategory: "No hay productos verificables disponibles en esta categoría.",
    breadcrumbs: "Ruta de navegación",
    home: "Inicio",
    availability: "Disponibilidad",
    units: "unidades",
    material: "Material",
    specifications: "Características y especificaciones",
    packageContents: "Contenido del paquete",
    warnings: "Uso y advertencias",
    related: "Productos relacionados",
    officialImages: "Imágenes oficiales de CJ Dropshipping",
    commercialInfo: "Información editorial",
    exchangeUnavailable: "El precio en USD no está disponible hasta validar la tasa de cambio.",
    usCheckoutUnavailable: "Las compras en Estados Unidos todavía no están habilitadas. Puedes explorar el catálogo, pero Nexora no realizará ningún cobro en USD hasta conectar y validar un procesador autorizado.",
  },
  "en-US": {
    skip: "Skip to content",
    navigation: "Main navigation",
    mobileNavigation: "Mobile navigation",
    jewelry: "Jewelry",
    technology: "Technology and home",
    aiTechnology: "AI technology",
    wellbeing: "Wellbeing",
    cart: "Cart",
    market: "Country, language, and currency",
    heroEyebrow: "Thoughtful selection",
    heroTitle: "Design that elevates your everyday.",
    heroDescription: "Jewelry, home technology, and wellbeing products selected with supplier traceability.",
    exploreJewelry: "Explore jewelry",
    seeTechnology: "See technology",
    catalog: "Catalog",
    verified: "Verified",
    payment: "Payment",
    protected: "Protected",
    images: "Images",
    original: "Official",
    purposeEyebrow: "Our standard",
    purposeTitle: "Less noise. More intention.",
    purposeOne: "We review utility, available product information, and visual quality before publishing an item. Each category rotates independently.",
    purposeTwo: "Automations propose catalog changes under human supervision while preserving CJ's original source data.",
    products: "Products",
    contact: "Contact",
    shipping: "Shipping",
    returns: "Returns",
    privacy: "Privacy",
    terms: "Terms",
    payments: "Payment methods",
    faq: "Frequently asked questions",
    footerTagline: "Design that elevates your everyday.",
    noReviews: "New · no verified reviews",
    style: "Style",
    selectStyle: "Select a style",
    quantity: "Quantity",
    addToCart: "Add to cart",
    viewCart: "View cart",
    viewProduct: "View",
    shippingCalculated: "Actual shipping is quoted for the full cart before payment.",
    unavailable: "Unavailable",
    outOfStock: "Out of stock",
    selectStyleHelp: "Choose a style to continue with your purchase.",
    lastUnits: "Low stock",
    categoryEyebrow: "Nexora selection",
    emptyCategory: "No verified products are currently available in this category.",
    breadcrumbs: "Breadcrumbs",
    home: "Home",
    availability: "Availability",
    units: "units",
    material: "Material",
    specifications: "Features and specifications",
    packageContents: "Package contents",
    warnings: "Use and warnings",
    related: "Related products",
    officialImages: "Official CJ Dropshipping images",
    commercialInfo: "Editorial information",
    exchangeUnavailable: "USD pricing is unavailable until the exchange rate is validated.",
    usCheckoutUnavailable: "Purchases in the United States are not enabled yet. You may browse the catalog, but Nexora will not charge in USD until an authorized processor is connected and validated.",
  },
} as const;

export function getDictionary(market: Market) {
  return dictionaries[markets[market].locale];
}
