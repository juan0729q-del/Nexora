# Indexación de Nexora: Google y Bing

Nexora publica automáticamente `robots.txt`, `sitemap.xml`, canonicales, Open Graph, JSON-LD de `Organization` y `Product`, y un sitemap de imágenes con las URLs nativas de CJ. El mapa vigente está en:

```text
https://nexora-amber-two.vercel.app/sitemap.xml
```

## Verificar Google Search Console

1. Crea una propiedad de prefijo de URL para `https://nexora-amber-two.vercel.app/` en Google Search Console.
2. Selecciona la verificación por meta tag y copia únicamente el valor de `content`.
3. En Vercel, agrega `GOOGLE_SITE_VERIFICATION` con ese valor para Production.
4. Haz un redeploy, confirma que la etiqueta aparece en el `<head>` y completa la verificación.
5. Envía el sitemap anterior en **Sitemaps**.

## Verificar Bing Webmaster Tools

1. Agrega el mismo host en Bing Webmaster Tools o impórtalo desde una propiedad ya verificada de Google Search Console.
2. Si Bing entrega un meta tag, guarda únicamente su valor `content` como `BING_SITE_VERIFICATION` en Vercel Production.
3. Haz un redeploy y termina la verificación.
4. Envía el mismo sitemap en **Sitemaps**.

## Descubrimiento rápido en Bing

La clave pública de IndexNow está en `/<clave>.txt` y Vercel notifica diariamente las URLs indexables a IndexNow con el cron protegido por `CRON_SECRET`. No se expone ninguna credencial de proveedor ni de pagos. Google no dispone de una API general para forzar la indexación de fichas comerciales; para Google, el sitemap, Search Console y páginas rastreables son el mecanismo correcto.

## Al cambiar a dominio propio

Actualiza `NEXT_PUBLIC_SITE_URL` con el dominio HTTPS final, vuelve a desplegar y crea/valida propiedades nuevas de Google y Bing para ese host. No declares `hreflang="en-US"` hasta publicar una versión en inglés real con condiciones y moneda coherentes.
