# Nexora

Tienda de alto rendimiento construida con Next.js App Router y Tailwind CSS, preparada para Vercel. El catálogo publicado es un JSON versionado en Git: no hay base de datos externa ni escritura efímera dentro de una Function.

## Rutas

- `/`: catálogo público por Joyería, Tecnología/Hogar y Bienestar.
- `/productos/[slug]`: ficha estática/ISR con Schema.org `Product`, Open Graph por artículo y la imagen original de CJ.
- `/admin/login` y `/admin`: acceso protegido, catálogo real, alertas operativas y recarga segura de la versión publicada.
- `/api/payments/checkout`: crea un checkout alojado y vuelve a validar inventario CJ para artículos críticos.
- `/api/automation/catalog-import`: obtiene candidatos CJ validados; no escribe el filesystem de Vercel.
- `/api/automation/indexnow`: cron protegido que comunica URLs públicas a IndexNow para Bing.

## Catálogo CJ persistente

`src/data/catalog.json` es la única fuente publicada. Solo admite productos CJ con imagen HTTPS nativa de hosts oficiales permitidos, URL de origen directa, SKU único, costo en USD y stock vendible. No se admiten placeholders, mock-ups ni recursos de terceros.

Cada ejecución autentica con `CJ_DROPSHIPPING_API_KEY`, obtiene un access token efímero y lo renueva si expira. El cliente conserva el ritmo conservador de 1.1 segundos por solicitud, registra `pointsInfo` cuando CJ lo entrega, reserva cuota preventiva y no reintenta una cuota agotada. Product List v2 se consulta por categoría, con inventario verificado y pool/detalles acotados para proteger tiempo de función y puntos.

La automatización que persiste cambios está en `.github/workflows/sync-cj-catalog.yml`. Se ejecuta diariamente y también puede lanzarse manualmente con **Run workflow**. El script compara el catálogo canónico y no genera commit, despliegue ni nueva versión si CJ no devolvió cambios materiales. Vercel queda reservado para la notificación diaria de IndexNow; así no se solapan dos importadores CJ.

Para habilitar la importación, configura en GitHub la variable `NEXORA_CATALOG_IMPORT_URL` con:

```text
https://TU-DOMINIO/api/automation/catalog-import?perNiche=5
```

El workflow usa OIDC limitado al repositorio, rama `main` y archivo de workflow; no copia `CRON_SECRET` a GitHub.

## Pagos

Nexora usa Wompi Checkout Web cuando existen `NEXT_PUBLIC_WOMPI_PUBLIC_KEY` y `WOMPI_INTEGRITY_SECRET`. Como alternativa puede crear Links de Pago con `WOMPI_PRIVATE_KEY`. Mercado Pago se activa con `PAYMENT_PROVIDER=mercadopago` y `MERCADOPAGO_ACCESS_TOKEN`.

El regreso del comprador nunca se toma como pago final. Configura en Wompi el webhook HTTPS `https://TU-DOMINIO/api/payments/wompi/webhook` y la variable privada `WOMPI_EVENT_SECRET`. Mercado Pago recibe `notification_url` automáticamente al crear cada preferencia y el handler consulta su API con el token de servidor.

## Google, Bing e IndexNow

Consulta [docs/search-indexing.md](docs/search-indexing.md) para verificar Google Search Console y Bing Webmaster Tools, publicar sus tokens de verificación en Vercel y enviar el sitemap. La verificación de propiedad requiere las cuentas de los buscadores y no puede completarse solo desde el repositorio.

## Variables de entorno

Consulta `.env.example`. Nunca subas credenciales reales ni publiques variables sin el prefijo `NEXT_PUBLIC_`.
