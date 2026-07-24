export type RawProductSpecs = { name: string; category: string; material?: string; features: string[]; audience: string };
export function buildSeoContentPrompt(specs: RawProductSpecs) {
  // Envía este prompt a tu proveedor de IA desde un Route Handler, nunca desde el navegador.
  return `Redacta en español una ficha comercial para ecommerce. Incluye un H1 con "${specs.name}", un H2 enfocado en ${specs.category}, beneficios verificables, tono persuasivo sin promesas médicas y palabras clave naturales. Público: ${specs.audience}. Material: ${specs.material || "no especificado"}. Características: ${specs.features.join(", ")}. Devuelve título SEO (máx. 60 caracteres), meta descripción (máx. 155) y HTML semántico.`;
}
