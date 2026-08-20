import { isStoreProductAvailable, type Product } from "@/lib/products";
import type { Market } from "@/lib/i18n/config";
import type { ExchangeRateSnapshot } from "@/lib/market-pricing";
import { salePriceCopForVariant, startingSalePriceCop } from "@/lib/pricing-policy";
import type { ProviderImage } from "@/lib/provider-product-details";

export type ProductPresentation = {
  title: string;
  seoTitle: string;
  metaDescription: string;
  cardDescription: string;
  detailDescription: string;
  imageAlt: string;
  benefits: string[];
  features: string[];
  warnings: string[];
};

type LocalizedEditorialCopy = Omit<ProductPresentation, "imageAlt">;
type ProductEditorial = Record<Market, LocalizedEditorialCopy>;

/** Datos públicos mínimos que pueden cruzar al componente de compra cliente. */
export type StorefrontProduct = Pick<
  Product,
  "slug" | "name" | "category" | "niche" | "sku" | "image" | "compareAtPrice" | "rating" | "reviewCount" | "stock"
> & {
  available: boolean;
  market: Market;
  price: number | null;
  sourcePriceCop: number;
  currency: "COP" | "USD";
  exchangeRateCopPerUsd: number | null;
  variants: Array<{
    sku: string;
    label: string;
    options?: string;
    image?: ProviderImage;
    price: number | null;
    sourcePriceCop: number | null;
  }>;
};

const editorialBySku: Record<string, ProductEditorial> = {
  CJLX1237838: {
    co: {
      title: "Collar Árbol de la Vida con Cristal",
      seoTitle: "Collar Árbol de la Vida con cristal natural",
      metaDescription: "Descubre un collar con columna de cristal, cadena tipo O y estilos oficiales de CJ. Consulta disponibilidad y envío real antes de pagar.",
      cardDescription: "Una columna de cristal y el símbolo del árbol de la vida en una pieza de carácter natural.",
      detailDescription: "El motivo del árbol de la vida acompaña una columna de cristal en una pieza pensada para sumar color y significado visual a un look cotidiano. La ficha de CJ informa cadena tipo O, extensión de hasta 10 cm y circunferencia entre 51 y 80 cm.",
      benefits: ["Aporta un punto de color al vestuario", "Permite elegir entre acabados y cantidades reportados por CJ"],
      features: ["Columna de cristal", "Cadena tipo O", "Extensión de cadena de hasta 10 cm"],
      warnings: ["El color y el patrón de la piedra pueden variar entre unidades", "Revisa el estilo y la cantidad incluida antes de agregarlo al carrito"],
    },
    us: {
      title: "Crystal Tree of Life Necklace",
      seoTitle: "Crystal Tree of Life necklace with O-chain",
      metaDescription: "Explore a crystal-column Tree of Life necklace with official CJ styles. Check live availability and actual shipping before checkout.",
      cardDescription: "A crystal column and Tree of Life motif designed to add color and visual meaning to an everyday look.",
      detailDescription: "A Tree of Life motif frames a crystal column in a colorful necklace. CJ lists an O-chain, an extension of up to 10 cm, and a circumference ranging from 51 to 80 cm.",
      benefits: ["Adds a distinct color accent", "Offers multiple CJ-reported finishes and pack sizes"],
      features: ["Crystal column", "O-chain", "Chain extension up to 10 cm"],
      warnings: ["Stone color and pattern may vary between units", "Review the selected style and included quantity before adding it to your cart"],
    },
  },
  CJLX1372072: {
    co: {
      title: "Collar Sobre con Colgante",
      seoTitle: "Collar sobre en acero titanio para regalo",
      metaDescription: "Collar con colgante en forma de sobre, acero titanio y acabados plata, oro o rosa. Envío CJ calculado según destino.",
      cardDescription: "Un pequeño sobre en acero titanio para llevar un mensaje simbólico cerca de ti.",
      detailDescription: "Este collar convierte la silueta de un sobre en un detalle discreto para regalar o usar a diario. CJ informa un colgante de aproximadamente 1,4 × 1,1 cm, cadena de 41 cm y extensión cercana a 3 cm.",
      benefits: ["Formato compacto para uso cotidiano", "Disponible en varios acabados y presentaciones"],
      features: ["Acero titanio", "Cadena aproximada de 41 cm", "Extensión aproximada de 3 cm"],
      warnings: ["El producto no incluye grabado", "Algunos estilos incluyen caja y otros corresponden sólo a la presentación; verifica la selección"],
    },
    us: {
      title: "Envelope Pendant Necklace",
      seoTitle: "Titanium steel envelope pendant necklace",
      metaDescription: "Shop an envelope pendant necklace in titanium steel with silver, gold, and rose finishes. CJ shipping is quoted by destination.",
      cardDescription: "A small titanium-steel envelope designed as a symbolic everyday detail or thoughtful gift.",
      detailDescription: "This necklace turns an envelope silhouette into a subtle gift-ready detail. CJ reports an approximately 1.4 × 1.1 cm pendant, a 41 cm chain, and an extension of about 3 cm.",
      benefits: ["Compact design for everyday wear", "Multiple finishes and presentation options"],
      features: ["Titanium steel", "Approximately 41 cm chain", "Approximately 3 cm extension"],
      warnings: ["The product is not engraved", "Some styles include a box while others refer only to presentation options; review your selection"],
    },
  },
  CJZBLXLX02753: {
    co: {
      title: "Choker de Cristales",
      seoTitle: "Choker de cristales en acabado blanco o multicolor",
      metaDescription: "Choker de cristales y aleación con anchos y colores oficiales de CJ. Consulta stock, estilo y envío antes del pago.",
      cardDescription: "Una línea de cristales para dar brillo definido a celebraciones y looks de noche.",
      detailDescription: "Un choker de cristales y aleación disponible en blanco o multicolor. CJ informa una longitud aproximada de 29 cm más 10 cm de extensión y diferentes anchos según el estilo elegido.",
      benefits: ["Añade brillo visible a un look", "Permite elegir color y ancho"],
      features: ["Cristal y aleación", "Extensión aproximada de 10 cm", "Opciones de ancho reportadas por CJ"],
      warnings: ["Las medidas dependen del estilo seleccionado", "Evita el contacto prolongado con humedad y cosméticos"],
    },
    us: {
      title: "Crystal Rhinestone Choker",
      seoTitle: "Crystal rhinestone choker in white or multicolor",
      metaDescription: "Crystal and alloy choker in CJ-reported widths and colors. Check stock, style, and actual shipping before payment.",
      cardDescription: "A defined line of crystals made to add visible shine to celebrations and evening looks.",
      detailDescription: "A crystal-and-alloy choker available in white or multicolor. CJ reports an approximate 29 cm length plus a 10 cm extension, with width varying by selected style.",
      benefits: ["Adds a bright focal point", "Choice of color and width"],
      features: ["Crystal and alloy", "Approximately 10 cm extension", "CJ-reported width options"],
      warnings: ["Measurements vary by selected style", "Avoid prolonged contact with moisture and cosmetics"],
    },
  },
  CJLX1206870: {
    co: {
      title: "Collar de Piedra Natural 7 Colores",
      seoTitle: "Collar de piedra natural de siete colores",
      metaDescription: "Collar unisex de piedra natural con cuatro estilos oficiales de CJ. Sin promesas terapéuticas; envío calculado antes del pago.",
      cardDescription: "Piedras de siete colores en un collar unisex para sumar una referencia visual a tu rutina.",
      detailDescription: "Una pieza de piedra natural disponible en cuatro estilos, con presentación individual. Nexora la describe por sus materiales y diseño; no atribuye propiedades curativas ni resultados de salud.",
      benefits: ["Diseño unisex", "Cuatro estilos de piedra reportados por CJ"],
      features: ["Piedra natural", "Presentación individual", "Estilos con medidas aproximadas de 55 × 16 mm o 60 × 10 mm según referencia"],
      warnings: ["No es un producto médico ni terapéutico", "El tono y patrón de cada piedra pueden variar"],
    },
    us: {
      title: "Seven-Color Natural Stone Necklace",
      seoTitle: "Seven-color natural stone pendant necklace",
      metaDescription: "Unisex natural stone necklace in four official CJ styles. No therapeutic claims; actual shipping is calculated before payment.",
      cardDescription: "Seven-color natural stones in a unisex necklace designed as a visual accent for daily wear.",
      detailDescription: "A natural-stone necklace available in four CJ-reported styles and individually packed. Nexora describes its material and design without claiming healing or health outcomes.",
      benefits: ["Unisex design", "Four CJ-reported stone styles"],
      features: ["Natural stone", "Individual packaging", "Approximate 55 × 16 mm or 60 × 10 mm styles depending on reference"],
      warnings: ["This is not a medical or therapeutic product", "Stone color and pattern may vary"],
    },
  },
  CJZBLXLX06494: {
    co: {
      title: "Colgante Árbol de la Vida en Piedra Natural",
      seoTitle: "Colgante árbol de la vida en piedra y cobre",
      metaDescription: "Colgante de 5 cm con alambre de cobre, piedra natural y cordón o cadena según estilo. Consulta el envío real de CJ.",
      cardDescription: "Piedra natural y alambre de cobre en una silueta de árbol de la vida de gran presencia visual.",
      detailDescription: "El alambre de cobre dibuja un árbol sobre piedra natural en un colgante de aproximadamente 5 cm de diámetro. CJ informa un peso cercano a 18 g y estilos con cordón o cadena.",
      benefits: ["Combina textura mineral y detalle metálico", "Amplia selección de colores y tipos de cadena"],
      features: ["Piedra natural", "Alambre de cobre", "Diámetro aproximado de 5 cm"],
      warnings: ["La piedra natural presenta variaciones de color y veta", "Verifica si el estilo incluye cordón, cadena o sólo colgante"],
    },
    us: {
      title: "Natural Stone Tree of Life Pendant",
      seoTitle: "Natural stone and copper Tree of Life pendant",
      metaDescription: "Approximate 5 cm pendant made with copper wire and natural stone, with cord or chain by style. Check actual CJ shipping.",
      cardDescription: "Natural stone and copper wire shaped into a visually distinctive Tree of Life pendant.",
      detailDescription: "Copper wire forms a tree over natural stone in an approximately 5 cm pendant. CJ reports a weight near 18 g and styles supplied with a cord or chain.",
      benefits: ["Combines mineral texture and metal detail", "Wide selection of colors and chain types"],
      features: ["Natural stone", "Copper wire", "Approximately 5 cm diameter"],
      warnings: ["Natural stone varies in color and veining", "Check whether the selected style includes a cord, chain, or pendant only"],
    },
  },
  CJXFLPCD00002: {
    co: {
      title: "Repetidor de Señal Wi‑Fi",
      seoTitle: "Repetidor Wi-Fi compacto con enchufe seleccionable",
      metaDescription: "Repetidor Wi-Fi compacto de 75 × 90 mm con enchufe US, EU, UK o AU según estilo. Verifica compatibilidad antes de comprar.",
      cardDescription: "Un repetidor compacto para ampliar cobertura inalámbrica en zonas con señal débil.",
      detailDescription: "Este repetidor de 75 × 90 mm está disponible con distintos tipos de enchufe. Su desempeño final depende del router, la distancia, los obstáculos y la configuración de la red.",
      benefits: ["Formato compacto", "Opciones de enchufe para distintos mercados"],
      features: ["Tamaño aproximado de 75 × 90 mm", "Acabado blanco o negro", "Enchufe US, EU, UK o AU según estilo"],
      warnings: ["Elige un enchufe compatible con tu país", "La mejora de cobertura depende de la red y del lugar de instalación"],
    },
    us: {
      title: "Compact Wi‑Fi Range Extender",
      seoTitle: "Compact Wi-Fi range extender with plug options",
      metaDescription: "Compact 75 × 90 mm Wi-Fi range extender with US, EU, UK, or AU plug by style. Verify compatibility before ordering.",
      cardDescription: "A compact extender intended to improve wireless coverage in areas with a weak signal.",
      detailDescription: "This 75 × 90 mm Wi-Fi extender is available with several plug types. Actual performance depends on the router, distance, obstacles, and network configuration.",
      benefits: ["Compact format", "Plug options for multiple markets"],
      features: ["Approximately 75 × 90 mm", "White or black finish", "US, EU, UK, or AU plug by style"],
      warnings: ["Choose a plug compatible with your country", "Coverage improvement depends on the network and installation location"],
    },
  },
  CJXFZNZN00544: {
    co: {
      title: "Cepillo Eléctrico Desenredante",
      seoTitle: "Cepillo eléctrico desenredante portátil",
      metaDescription: "Cepillo eléctrico de ABS en color morado, 27 × 6 × 4 cm y batería integrada. Consulta stock y envío CJ.",
      cardDescription: "Un cepillo eléctrico de formato alargado para acompañar la rutina diaria de peinado.",
      detailDescription: "Cepillo eléctrico en ABS y color morado. CJ informa un tamaño aproximado de 27 × 6 × 4 cm, peso de producto de 186 g y envío sujeto a restricciones por batería.",
      benefits: ["Formato portátil", "Un único estilo facilita la selección"],
      features: ["Cuerpo de ABS", "Tamaño aproximado de 27 × 6 × 4 cm", "Peso aproximado de 186 g"],
      warnings: ["Producto con batería: las rutas logísticas disponibles pueden ser limitadas", "Sigue las instrucciones del fabricante y evita usarlo cerca del agua"],
    },
    us: {
      title: "Electric Detangling Brush",
      seoTitle: "Portable electric detangling hair brush",
      metaDescription: "Purple ABS electric brush measuring approximately 27 × 6 × 4 cm with an integrated battery. Check CJ stock and shipping.",
      cardDescription: "A long-form electric brush designed to support an everyday hair-care routine.",
      detailDescription: "A purple ABS electric brush. CJ reports an approximate 27 × 6 × 4 cm size, a product weight of 186 g, and battery-related shipping restrictions.",
      benefits: ["Portable format", "Single style for straightforward selection"],
      features: ["ABS body", "Approximately 27 × 6 × 4 cm", "Approximately 186 g"],
      warnings: ["Battery product: available shipping routes may be limited", "Follow manufacturer instructions and keep away from water"],
    },
  },
  CJXFZNZN00072: {
    co: {
      title: "Banda Musical Inalámbrica",
      seoTitle: "Banda de tela con audio Bluetooth",
      metaDescription: "Banda de tela con Bluetooth 4.0, batería de 180 mAh y reproducción indicada de 3 a 6 horas. Consulta envío CJ.",
      cardDescription: "Una banda de tela con audio Bluetooth para escuchar contenido con un formato suave y portátil.",
      detailDescription: "Banda musical inalámbrica con Bluetooth 4.0 + EDR y alcance indicado de hasta 10 m. CJ informa batería de 180 mAh, carga aproximada de 2 horas y reproducción de 3 a 6 horas.",
      benefits: ["Formato de tela fácil de transportar", "Cinco colores reportados por CJ"],
      features: ["Bluetooth 4.0 + EDR", "Batería de 180 mAh", "Cable de carga y manual incluidos"],
      warnings: ["La autonomía real depende del volumen y del uso", "Producto con batería sujeto a disponibilidad logística"],
    },
    us: {
      title: "Wireless Music Headband",
      seoTitle: "Bluetooth fabric music headband",
      metaDescription: "Fabric headband with Bluetooth 4.0, 180 mAh battery, and CJ-reported 3–6 hour playback. Check actual shipping.",
      cardDescription: "A fabric headband with Bluetooth audio in a soft, portable format.",
      detailDescription: "Wireless music headband with Bluetooth 4.0 + EDR and a reported range of up to 10 m. CJ lists a 180 mAh battery, approximately 2-hour charging, and 3–6 hours of playback.",
      benefits: ["Portable fabric format", "Five CJ-reported colors"],
      features: ["Bluetooth 4.0 + EDR", "180 mAh battery", "Charging cable and manual included"],
      warnings: ["Actual battery life varies with volume and use", "Battery product subject to shipping-route availability"],
    },
  },
  CJXFLPCD00009: {
    co: {
      title: "Soporte Cargador Inalámbrico para Auto",
      seoTitle: "Soporte de auto con carga inalámbrica Qi",
      metaDescription: "Soporte para rejilla de ventilación con carga inalámbrica Qi, salida 5V/2A o 9V/1,7A y estilos CJ.",
      cardDescription: "Un soporte de rejilla que combina sujeción por gravedad y carga inalámbrica compatible.",
      detailDescription: "Soporte para la rejilla del auto con función de carga inalámbrica Qi. CJ indica compatibilidad física con teléfonos de 4 a 6,5 pulgadas que admitan carga inalámbrica.",
      benefits: ["Integra soporte y carga en un solo accesorio", "Opciones de color y brazo según estilo"],
      features: ["Montaje en rejilla de ventilación", "Salida indicada de 5V/2A o 9V/1,7A", "Cable USB incluido"],
      warnings: ["El teléfono debe ser compatible con carga inalámbrica Qi", "Confirma que la rejilla y el tamaño del teléfono sean compatibles"],
    },
    us: {
      title: "Wireless Car Charging Mount",
      seoTitle: "Qi wireless car charging vent mount",
      metaDescription: "Air-vent mount with Qi wireless charging, reported 5V/2A or 9V/1.7A output, and official CJ styles.",
      cardDescription: "An air-vent mount that combines gravity grip with compatible wireless charging.",
      detailDescription: "A car air-vent mount with Qi wireless charging. CJ reports physical compatibility with 4 to 6.5-inch phones that support wireless charging.",
      benefits: ["Combines mounting and charging", "Color and arm options by style"],
      features: ["Air-vent installation", "Reported 5V/2A or 9V/1.7A output", "USB cable included"],
      warnings: ["Your phone must support Qi wireless charging", "Confirm vent shape and phone dimensions before ordering"],
    },
  },
  CJXFLPCD00017: {
    co: {
      title: "Cable de Carga Magnético 360°",
      seoTitle: "Cable magnético giratorio para carga USB",
      metaDescription: "Cable magnético giratorio de 1 o 2 m con conectores Micro USB, USB-C o compatible con iPhone según estilo.",
      cardDescription: "Conexión magnética giratoria para simplificar la carga cotidiana de dispositivos compatibles.",
      detailDescription: "Cable de carga magnético con cabeza giratoria, longitudes de 1 o 2 metros y salida máxima reportada de 5V/2,4A. El conector y las piezas incluidas dependen del estilo.",
      benefits: ["Conexión magnética giratoria", "Múltiples longitudes, colores y conectores"],
      features: ["Longitud de 1 o 2 m", "Salida máxima reportada de 5V/2,4A", "Micro USB, USB‑C o conector compatible con iPhone según estilo"],
      warnings: ["Verifica el conector exacto antes de comprar", "Algunos estilos corresponden sólo a la cabeza magnética o a paquetes de cabezas"],
    },
    us: {
      title: "360° Magnetic Charging Cable",
      seoTitle: "Rotating magnetic USB charging cable",
      metaDescription: "One- or two-meter rotating magnetic cable with Micro USB, USB-C, or iPhone-compatible connector by style.",
      cardDescription: "A rotating magnetic connection designed to simplify everyday charging for compatible devices.",
      detailDescription: "Magnetic charging cable with a rotating head, one- or two-meter lengths, and a reported maximum 5V/2.4A output. Connector and included pieces vary by style.",
      benefits: ["Rotating magnetic connection", "Multiple lengths, colors, and connectors"],
      features: ["One- or two-meter length", "Reported maximum 5V/2.4A output", "Micro USB, USB‑C, or iPhone-compatible connector by style"],
      warnings: ["Confirm the exact connector before ordering", "Some styles include only magnetic heads or multi-head packs"],
    },
  },
  CJBJMRJF00208: {
    co: {
      title: "Rizador Automático Recargable",
      seoTitle: "Rizador automático portátil con pantalla LCD",
      metaDescription: "Rizador automático recargable con pantalla LCD, control de temperatura y estilos USB. Actualmente no disponible por stock.",
      cardDescription: "Rizador portátil con rotación automática y pantalla para ajustar la temperatura.",
      detailDescription: "Rizador recargable para cabello seco con pantalla digital, control de temperatura y conductor de turmalina. La ficha de CJ informa potencia entre 25 y 39 W.",
      benefits: ["Formato portátil", "Control visual de temperatura"],
      features: ["Pantalla LCD", "Alimentación por batería", "Conductor de calor de 21 a 30 mm"],
      warnings: ["No está disponible mientras el stock permanezca en nivel crítico", "Producto caliente y con batería: sigue las instrucciones y mantenlo fuera del alcance de niños"],
    },
    us: {
      title: "Rechargeable Automatic Hair Curler",
      seoTitle: "Portable automatic hair curler with LCD",
      metaDescription: "Rechargeable automatic curler with LCD, temperature controls, and USB styles. Currently unavailable due to stock.",
      cardDescription: "A portable rotating curler with a display for temperature adjustment.",
      detailDescription: "Rechargeable curler for dry hair with a digital display, temperature controls, and tourmaline heat conductor. CJ reports 25–39 W power.",
      benefits: ["Portable format", "Visible temperature control"],
      features: ["LCD display", "Battery powered", "21–30 mm heat conductor"],
      warnings: ["Unavailable while stock remains critically low", "Hot and battery-powered product: follow instructions and keep away from children"],
    },
  },
  CJAM1228953: {
    co: {
      title: "Arco de Estiramiento para Espalda",
      seoTitle: "Arco ajustable de estiramiento lumbar en ABS",
      metaDescription: "Arco de estiramiento en ABS con niveles y estilos oficiales de CJ. Producto de uso general, sin promesas médicas.",
      cardDescription: "Un apoyo ajustable para incorporar estiramientos suaves a una pausa o rutina de movilidad.",
      detailDescription: "Arco de estiramiento fabricado en ABS y disponible en configuraciones reportadas por CJ. Nexora no lo presenta como tratamiento ni atribuye alivio de enfermedades o resultados clínicos.",
      benefits: ["Diseño ajustable", "Puede integrarse a rutinas generales de movilidad"],
      features: ["ABS", "Configuraciones de tres o cuatro niveles según estilo", "Opciones con manual en inglés o chino"],
      warnings: ["No es un dispositivo médico", "Suspende el uso ante dolor y consulta a un profesional si tienes una lesión o condición previa"],
    },
    us: {
      title: "Adjustable Back Stretching Arch",
      seoTitle: "Adjustable ABS back stretching arch",
      metaDescription: "ABS stretching arch in CJ-reported levels and styles. General-use product with no medical claims.",
      cardDescription: "An adjustable support for adding gentle stretching to a break or mobility routine.",
      detailDescription: "An ABS stretching arch available in CJ-reported configurations. Nexora does not present it as a treatment or claim relief from diseases or clinical outcomes.",
      benefits: ["Adjustable design", "Can support a general mobility routine"],
      features: ["ABS", "Three- or four-level configurations by style", "English or Chinese manual options"],
      warnings: ["This is not a medical device", "Stop if you feel pain and consult a professional if you have an injury or pre-existing condition"],
    },
  },
  CJYDQTJM00184: {
    co: {
      title: "Set de Bandas Elásticas de Resistencia",
      seoTitle: "Set de cinco bandas elásticas de resistencia",
      metaDescription: "Set de cinco bandas de látex de 600 × 50 mm con grosores y resistencias diferenciadas por color.",
      cardDescription: "Cinco bandas de distintos grosores para variar ejercicios de movilidad y resistencia.",
      detailDescription: "Set de cinco bandas de látex de 600 × 50 mm. CJ distingue grosores por color: verde 0,35 mm, azul 0,5 mm, amarillo 0,7 mm, rojo 0,9 mm y negro 1,1 mm.",
      benefits: ["Cinco niveles identificados por color", "Formato compacto para entrenamiento"],
      features: ["Látex", "600 × 50 mm por banda", "Cinco bandas incluidas"],
      warnings: ["Contiene látex", "Revisa cada banda antes de usarla y reemplázala si presenta cortes o desgaste"],
    },
    us: {
      title: "Five-Piece Resistance Band Set",
      seoTitle: "Set of five latex resistance bands",
      metaDescription: "Five 600 × 50 mm latex bands with color-coded thicknesses and resistance levels.",
      cardDescription: "Five bands in different thicknesses for varied mobility and resistance exercises.",
      detailDescription: "A set of five 600 × 50 mm latex bands. CJ identifies thickness by color: green 0.35 mm, blue 0.5 mm, yellow 0.7 mm, red 0.9 mm, and black 1.1 mm.",
      benefits: ["Five color-coded levels", "Compact training format"],
      features: ["Latex", "600 × 50 mm per band", "Five bands included"],
      warnings: ["Contains latex", "Inspect each band before use and replace it if cut or worn"],
    },
  },
  CJPF1211212: {
    co: {
      title: "Máscara Facial Eléctrica de Silicona",
      seoTitle: "Máscara facial eléctrica recargable por USB",
      metaDescription: "Máscara facial de silicona con control remoto, modos eléctricos y carga USB. Accesorio cosmético sin promesas médicas.",
      cardDescription: "Una máscara flexible con control remoto para acompañar una rutina cosmética en casa.",
      detailDescription: "Máscara facial de silicona con control remoto, modos eléctricos de baja frecuencia y carga USB según la ficha de CJ. Nexora no afirma que elimine arrugas ni que produzca resultados clínicos.",
      benefits: ["Formato flexible", "Control remoto para ajustar modos e intensidad"],
      features: ["Silicona", "Carga USB", "Acabados blanco o negro y tamaños de empaque según estilo"],
      warnings: ["Accesorio cosmético; no es un dispositivo médico", "No usar sobre piel lesionada y suspender ante irritación; sigue el manual del fabricante"],
    },
    us: {
      title: "Electric Silicone Facial Mask",
      seoTitle: "USB rechargeable electric silicone facial mask",
      metaDescription: "Silicone facial mask with remote control, electric modes, and USB charging. Cosmetic accessory with no medical claims.",
      cardDescription: "A flexible mask with remote control designed to accompany an at-home cosmetic routine.",
      detailDescription: "A silicone facial mask with remote control, low-frequency electric modes, and USB charging as reported by CJ. Nexora does not claim wrinkle removal or clinical results.",
      benefits: ["Flexible format", "Remote control for modes and intensity"],
      features: ["Silicone", "USB charging", "White or black finishes and package sizes by style"],
      warnings: ["Cosmetic accessory; not a medical device", "Do not use on broken skin; stop if irritation occurs and follow the manufacturer manual"],
    },
  },
  CJJM1232812: {
    co: {
      title: "Cinta de Estiramiento para Puerta",
      seoTitle: "Cinta ajustable de estiramiento para puerta",
      metaDescription: "Cinta de tela ajustable para ejercicios de estiramiento, con anclajes de espuma y bolsa. Verifica instalación y uso seguro.",
      cardDescription: "Una cinta ajustable con anclaje de puerta para acompañar ejercicios de movilidad y flexibilidad.",
      detailDescription: "Cinta de tela con dos anclajes de espuma para puerta y longitud ajustable. CJ informa empaque de 28 × 30 × 15 cm y peso aproximado de envío de 720 g.",
      benefits: ["Longitud ajustable", "Se desmonta para guardar o transportar"],
      features: ["Tela", "Anclajes de espuma para puerta", "Bolsa de tela incluida"],
      warnings: ["Verifica que la puerta cierre firmemente y soporte el uso antes de cada sesión", "No realizar inversiones sin instrucción y supervisión adecuadas"],
    },
    us: {
      title: "Doorway Stretching Strap",
      seoTitle: "Adjustable doorway stretching strap",
      metaDescription: "Adjustable fabric stretching strap with foam door anchors and storage bag. Verify installation and safe use.",
      cardDescription: "An adjustable door-anchored strap designed to support mobility and flexibility exercises.",
      detailDescription: "A fabric strap with two foam door anchors and adjustable length. CJ reports 28 × 30 × 15 cm packaging and an approximate 720 g shipping weight.",
      benefits: ["Adjustable length", "Removable for storage or travel"],
      features: ["Fabric", "Foam door anchors", "Fabric bag included"],
      warnings: ["Confirm the door closes securely and can support use before every session", "Do not perform inversions without appropriate instruction and supervision"],
    },
  },
};

function cleanProviderText(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/&[a-z0-9#]+;/gi, " ").replace(/\s+/g, " ").trim();
}

export function hasCompleteEditorial(product: Pick<Product, "sku">, market: Market) {
  const copy = editorialBySku[product.sku]?.[market];
  return Boolean(copy?.title && copy.seoTitle && copy.metaDescription && copy.cardDescription && copy.detailDescription
    && copy.benefits.length && copy.features.length && copy.warnings.length);
}

export function getProductPresentation(product: Pick<Product, "sku" | "name" | "category">, market: Market = "co"): ProductPresentation {
  const copy = editorialBySku[product.sku]?.[market];
  if (copy) return { ...copy, imageAlt: market === "co" ? `${copy.title}. Imagen oficial de CJ Dropshipping.` : `${copy.title}. Official CJ Dropshipping image.` };

  const title = cleanProviderText(product.name) || "Nexora selection";
  const unavailable = market === "co"
    ? "Este producto conserva su ficha original para trazabilidad, pero no se publica hasta completar su edición en español."
    : "This product keeps its original supplier record for traceability, but is not published until its English editorial review is complete.";
  return {
    title,
    seoTitle: title,
    metaDescription: unavailable,
    cardDescription: unavailable,
    detailDescription: unavailable,
    benefits: [],
    features: [],
    warnings: [],
    imageAlt: market === "co" ? `${title}. Imagen oficial de CJ Dropshipping.` : `${title}. Official CJ Dropshipping image.`,
  };
}

const spanishOptionTerms: Record<string, string> = {
  White: "Blanco", Colorful: "Multicolor", Silver: "Plata", Sliver: "Plata", Gold: "Oro", Golden: "Dorado",
  "Rose Gold": "Oro rosa", Black: "Negro", Red: "Rojo", Blue: "Azul", Green: "Verde", Yellow: "Amarillo",
  Purple: "Morado", Pink: "Rosa", Gray: "Gris", "Light Blue": "Azul claro", "Light Gray": "Gris claro",
  "Dark grey": "Gris oscuro", Rope: "Cordón", Chain: "Cadena", Pendant: "Colgante", "Gift box": "Caja de regalo",
  "with box": "con caja", "Five packs": "Set de cinco", "Only head": "Sólo conector", "Two pieces head": "Dos conectores",
  "Acupuncture magnetic therapy": "Superficie texturizada con piezas magnéticas",
  Acupuncture: "Superficie texturizada",
  "Cervical stretcher": "Soporte de estiramiento",
  "Lumbar massage board": "Soporte ajustable para estiramiento",
  "health massage": "actividad física general",
  "fitness body": "entrenamiento corporal",
  "dance movement": "movimiento y danza",
  "Fitness equipment": "Equipo de acondicionamiento",
  "sports protective gear accessories": "accesorios deportivos",
  "sports trends": "actividad deportiva",
  Ordinary: "Estándar",
  English: "Manual en inglés",
  Chinese: "Manual en chino",
};

const englishOptionTerms: Record<string, string> = {
  "Acupuncture magnetic therapy": "Textured surface with magnetic inserts",
  Acupuncture: "Textured surface",
  "Cervical stretcher": "Stretching support",
  "Lumbar massage board": "Adjustable stretching support",
  "health massage": "general fitness use",
  Ordinary: "Standard",
  English: "English manual",
  Chinese: "Chinese manual",
};

export function localizeVariantOption(value: string | undefined, market: Market) {
  if (!value) return value;
  const terms = market === "co" ? spanishOptionTerms : englishOptionTerms;
  let translated = value;
  for (const [source, target] of Object.entries(terms).sort(([left], [right]) => right.length - left.length)) {
    const escapedSource = source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    translated = translated.replace(new RegExp(`(?<![A-Za-z])${escapedSource}(?![A-Za-z])`, "gi"), target);
  }
  return translated;
}

const spanishSpecificationTerms: Record<string, string> = {
  Style: "Estilo", Material: "Material", Type: "Tipo", Modeling: "Forma", "Chain style": "Tipo de cadena",
  "Extension chain": "Cadena de extensión", Circumference: "Circunferencia", "Popular elements": "Detalle visual",
  Kind: "Tipo", "Whether multi-layer": "Multicapa", "Whether to bring a pendant": "Incluye colgante",
  "Pendant material": "Material del colgante", "Necklace length": "Longitud del collar", "Necklace Width": "Ancho del collar",
  Color: "Color", Size: "Tamaño", "Plug Type": "Tipo de enchufe", "Product name": "Producto",
  "Product material": "Material", "Product Color": "Color", "Product size": "Tamaño del producto", "Packing size": "Tamaño del empaque",
  "Bluetooth version": "Versión Bluetooth", Frequency: "Frecuencia", "Transmission distance": "Distancia de transmisión",
  "Lithium-ion battery": "Batería de ion de litio", "Charging time": "Tiempo de carga", "Continuous talk time": "Tiempo continuo de llamada",
  "Music playback time Bluetooth": "Reproducción de música", "Standby time": "Tiempo en espera", Sensitivity: "Sensibilidad",
  Impedance: "Impedancia", "Speaker size": "Tamaño del altavoz", "Output Interface": "Interfaz de salida", Output: "Salida",
  "Quality Certification": "Certificaciones indicadas por CJ", Input: "Entrada", "Power Source": "Fuente de alimentación",
  "Support Quick Charge Technology": "Carga rápida compatible", Installation: "Instalación", Length: "Longitud",
  Function: "Función", "Power supply mode": "Alimentación", "Applicable scene": "Uso indicado", Category: "Categoría",
  Weight: "Peso", Thickness: "Espesor", Origin: "Origen", Packing: "Empaque",
};

function cleanDisplayValue(value: string) {
  return value.replace(/Â±/g, "±").replace(/ï¼Œ/g, ",").replace(/\s+/g, " ").trim();
}

export function getLocalizedSpecifications(product: Pick<Product, "providerDetails">, market: Market) {
  return product.providerDetails.specifications
    .filter((entry) => !/^price$/i.test(entry.label))
    .slice(0, 18)
    .map((entry) => ({
      label: market === "co" ? (spanishSpecificationTerms[entry.label] || entry.label) : entry.label,
      value: localizeVariantOption(cleanDisplayValue(entry.value), market) || cleanDisplayValue(entry.value),
    }));
}

export function getLocalizedPackageContents(product: Pick<Product, "providerDetails">, market: Market) {
  return product.providerDetails.packageContents
    .filter((item) => !/^(product (?:image|picture)|please allow|as you know)/i.test(item))
    .slice(0, 12)
    .map((item) => {
      const cleaned = cleanDisplayValue(item);
      if (market === "us") return cleaned.replace(/\bback massager\b/gi, "back stretching accessory");
      return cleaned
        .replace(/\bnecklace\b/gi, "collar")
        .replace(/\bcharging cable\b/gi, "cable de carga")
        .replace(/\bmanual\b/gi, "manual")
        .replace(/\bcharger\b/gi, "cargador")
        .replace(/\bmagnetic USB cable\b/gi, "cable USB magnético")
        .replace(/\bback massager\b/gi, "accesorio para espalda")
        .replace(/\bbeauty instrument\b/gi, "dispositivo cosmético")
        .replace(/\byoga rope\b/gi, "cinta de yoga")
        .replace(/\bvariant\b/gi, "unidad");
    });
}

export function getLocalizedMaterial(material: string, market: Market) {
  if (market === "us") return material;
  return material
    .replace(/Metal/gi, "Metal")
    .replace(/Stone/gi, "Piedra")
    .replace(/Plastic/gi, "Plástico")
    .replace(/Cloth/gi, "Tela");
}

export function toStorefrontProduct(
  product: Product,
  market: Market = "co",
  exchangeRate?: ExchangeRateSnapshot,
): StorefrontProduct {
  const presentation = getProductPresentation(product, market);
  const copPerUsd = exchangeRate?.valid ? exchangeRate.copPerUsd : null;
  const canonicalStartingPriceCop = copPerUsd ? startingSalePriceCop(product, copPerUsd) : null;
  const localizedAmount = (priceCop: number) => market === "co"
    ? priceCop
    : copPerUsd
      ? Math.round((priceCop / copPerUsd) * 100) / 100
      : null;
  const marketPrice = canonicalStartingPriceCop === null ? null : localizedAmount(canonicalStartingPriceCop);
  return {
    slug: product.slug,
    name: presentation.title,
    category: product.category,
    niche: product.niche,
    sku: product.sku,
    image: { ...product.image, alt: presentation.imageAlt },
    price: marketPrice,
    sourcePriceCop: canonicalStartingPriceCop ?? product.price,
    currency: market === "co" ? "COP" : "USD",
    exchangeRateCopPerUsd: copPerUsd,
    compareAtPrice: undefined,
    rating: product.rating,
    reviewCount: product.reviewCount,
    stock: product.stock,
    available: isStoreProductAvailable(product) && hasCompleteEditorial(product, market),
    market,
    variants: product.variants.map((variant) => {
      const sourcePriceCop = copPerUsd ? salePriceCopForVariant(product, variant.sku, copPerUsd) : null;
      return {
        sku: variant.sku,
        label: localizeVariantOption(variant.options || variant.label, market) || variant.sku,
        options: localizeVariantOption(variant.options, market),
        image: variant.image
          ? { ...variant.image, alt: `${presentation.title} — ${localizeVariantOption(variant.options || variant.label, market) || variant.sku}. ${market === "co" ? "Imagen oficial de CJ." : "Official CJ image."}` }
          : product.variants.length === 1
            ? { ...product.image, alt: presentation.imageAlt }
            : undefined,
        sourcePriceCop,
        price: sourcePriceCop === null ? null : localizedAmount(sourcePriceCop),
      };
    }),
  };
}
