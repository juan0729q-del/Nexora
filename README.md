# Nexora

Tienda de alto rendimiento construida con Next.js App Router y Tailwind CSS, preparada para Vercel. El catálogo publicado es un JSON versionado en Git: no hay base de datos externa ni escritura efímera dentro de una Function.

## Rutas

- `/`: catálogo público por Joyería, Tecnología/Hogar y Bienestar.
- `/productos/[slug]`: ficha estática/ISR con Schema.org `Product`, Open Graph por artículo y la imagen original de CJ.
- `/admin/login` y `/admin`: acceso protegido, catálogo real, alertas operativas y recarga segura de la versión publicada.
- `/admin/ventas`: indicadores, pedidos, flete CJ, rentabilidad y postventa privada.
- `/api/shipping/quotes`: cotiza cada variante y destino directamente con CJ antes del cobro.
- `/api/payments/checkout`: valida la cotización firmada, el inventario de la variante y crea el checkout alojado.
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

## Envío CJ y checkout

Antes de abrir Wompi, Nexora solicita los datos mínimos de entrega, consulta las opciones reales de CJ para la variante elegida y propone la de menor costo. El comprador puede escoger cualquier método disponible, con su costo, origen de inventario, recargo remoto si aplica y plazo que informa CJ. El total firmado incluye producto + flete y la cotización vence en pocos minutos; cualquier cambio de dirección o variante obliga a cotizar de nuevo.

La hoja privada conserva la variante exacta, dirección, correo, opción logística, costo cobrado y costo CJ. Tras un pago aprobado y conciliado, el administrador crea el pedido en CJ y actualiza su guía desde `/admin/ventas`; Nexora no crea una orden de proveedor ni genera un cargo a CJ automáticamente.

Protege `POST /api/shipping/quotes` con una regla de Rate Limiting/WAF de Vercel. El límite local es una defensa complementaria y no sustituye una regla distribuida.

## Pagos

Nexora usa Wompi Checkout Web cuando existen `NEXT_PUBLIC_WOMPI_PUBLIC_KEY` y `WOMPI_INTEGRITY_SECRET`. Como alternativa puede crear Links de Pago con `WOMPI_PRIVATE_KEY`. La pasarela activa debe ser `PAYMENT_PROVIDER=wompi`: Mercado Pago conserva código de preparación, pero queda bloqueado hasta implementar una conciliación de postventa equivalente; así no se admiten ventas que el libro privado no pueda seguir.

El regreso del comprador nunca se toma como pago final. Configura en Wompi el webhook HTTPS `https://TU-DOMINIO/api/payments/wompi/webhook` y la variable privada `WOMPI_EVENT_SECRET`; sólo ese evento firmado cambia el estado de pago y habilita la postventa.

## Ventas y postventa privada

Consulta [docs/google-apps-script/README.md](docs/google-apps-script/README.md) para conectar el libro de Google Sheets. En producción se requieren `GOOGLE_SHEETS_SYNC_ENABLED=true`, `GOOGLE_SHEETS_WEBHOOK_URL`, `GOOGLE_SHEETS_WEBHOOK_SECRET` y `CHECKOUT_QUOTE_SECRET` para que el checkout registre la orden antes de revelar la pasarela.

## Google, Bing e IndexNow

Consulta [docs/search-indexing.md](docs/search-indexing.md) para verificar Google Search Console y Bing Webmaster Tools, publicar sus tokens de verificación en Vercel y enviar el sitemap. La verificación de propiedad requiere las cuentas de los buscadores y no puede completarse solo desde el repositorio.

## Variables de entorno

Consulta `.env.example`. Nunca subas credenciales reales ni publiques variables sin el prefijo `NEXT_PUBLIC_`.
