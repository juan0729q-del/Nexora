# Google, Bing e IndexNow

Nexora genera `robots.txt`, `sitemap.xml`, canonicales, Open Graph, Twitter Cards, `hreflang` para contenido realmente traducido, `BreadcrumbList`, `Product`/`Offer` y un sitemap con imágenes oficiales de CJ.

El sitemap contiene `/co` y `/us`, categorías, páginas de confianza y fichas editoriales completas. Carrito, checkout, resultados, administración, APIs y feeds quedan fuera o marcados `noindex`. No existe `AggregateRating`.

## Search Console y Bing

1. Crear propiedades para el host canónico configurado en `NEXT_PUBLIC_SITE_URL`.
2. Guardar sólo el valor de verificación en `GOOGLE_SITE_VERIFICATION` o `BING_SITE_VERIFICATION`.
3. Redeploy, verificar el meta tag y completar la propiedad.
4. Enviar `https://HOST/sitemap.xml` en ambas herramientas.
5. Inspeccionar una URL de cada mercado y comprobar canonical/hreflang recíprocos.

IndexNow comunica diariamente URLs públicas localizadas a Bing mediante un cron protegido por `CRON_SECRET`. Google no ofrece una API general para forzar la indexación de fichas comerciales: rastreo, sitemap, Search Console y calidad del contenido siguen siendo los mecanismos correctos.

## Migración de dominio

Después de validar el dominio propio, actualizar `NEXT_PUBLIC_SITE_URL`, verificaciones, sitemap, IndexNow, Merchant Center, redes y webhooks. Revisar primero todas las URLs; sólo entonces crear redirecciones permanentes desde los hosts Vercel. Los canonicales nunca deben apuntar a un host no adquirido o no verificado.
