# Nexora

Tienda de alto rendimiento construida con Next.js App Router y Tailwind CSS, preparada para Vercel. El catálogo publicado es un JSON versionado en Git: no hay base de datos externa ni escritura efímera dentro de una Function.

## Rutas

- `/`: catálogo público por Joyería, Tecnología/Hogar y Bienestar.
- `/productos/[slug]`: ficha SEO con Schema.org Product y la imagen original de CJ.
- `/admin/login` y `/admin`: acceso protegido, catálogo real y alertas operativas.
- `/api/payments/checkout`: crea un checkout alojado sin exponer secretos.
- `/api/payments/wompi/webhook`: valida eventos firmados de Wompi.
- `/api/payments/mercadopago/webhook`: verifica el pago contra la API de Mercado Pago.
- `/api/automation/catalog-import`: obtiene candidatos CJ validados; no escribe el filesystem de Vercel.
- `/api/automation/catalog-optimization`: genera propuestas de sincronización y rotación protegidas con `CRON_SECRET`.

## Catálogo CJ persistente

`src/data/catalog.json` es la única fuente publicada. Solo admite productos con:

- Imagen HTTPS nativa recibida del proveedor y `source: "provider"`.
- Proveedor `CJ Dropshipping`, URL de origen directa, SKU único, costo en USD y stock vendible.
- Entre 5 y 10 productos por nicho.

La importación necesita `CJ_DROPSHIPPING_TOP_SELLING_URL`: el endpoint de CJ que entregue el ranking real de ventas por nicho. Product List V2 por sí solo no acredita que un producto sea top-selling, así que Nexora se niega a etiquetar sus resultados como tales.

Tras obtener una respuesta autorizada de `/api/automation/catalog-import`, aplica y valida el documento con:

```bash
npm run catalog:apply-import -- .catalog-import.json
git add src/data/catalog.json
git commit -m "Sync verified CJ catalog"
git push origin main
```

La automatización versionada está en `.github/workflows/sync-cj-catalog.yml`. Para habilitarla, configura en GitHub:

- Variable `NEXORA_CATALOG_IMPORT_URL` con `https://TU-DOMINIO/api/automation/catalog-import?perNiche=5`.
- Secret `NEXORA_CRON_SECRET` con el mismo valor que `CRON_SECRET` de Vercel.

Se programa cada 15 minutos, aunque GitHub puede demorar ejecuciones programadas. En Vercel Hobby, el cron nativo permanece diario; en Vercel Pro puede cambiarse a `*/15 * * * *`.

## Pagos

Nexora usa Wompi Checkout Web cuando existen `NEXT_PUBLIC_WOMPI_PUBLIC_KEY` y `WOMPI_INTEGRITY_SECRET`. Como alternativa puede crear Links de Pago con `WOMPI_PRIVATE_KEY`. Mercado Pago se activa con `PAYMENT_PROVIDER=mercadopago` y `MERCADOPAGO_ACCESS_TOKEN`.

El regreso del comprador nunca se toma como pago final. Configura en Wompi el webhook HTTPS `https://TU-DOMINIO/api/payments/wompi/webhook` y la variable privada `WOMPI_EVENT_SECRET`. Mercado Pago recibe `notification_url` automáticamente al crear cada preferencia y el handler consulta su API con el token de servidor.

## Variables de entorno

Consulta `.env.example`. Nunca subas credenciales reales ni publiques variables sin el prefijo `NEXT_PUBLIC_`.
