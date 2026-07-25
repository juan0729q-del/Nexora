# Nexora

Tienda de alto rendimiento construida con Next.js App Router, Tailwind CSS y preparada para Vercel.

## Rutas

- `/`: catalogo publico, semantico y responsive. Solo muestra productos activos cuyo rendimiento permite destacarlos.
- `/productos/[slug]`: ficha SEO de cada producto con Schema.org Product.
- `/admin/login`: acceso de sesion protegida.
- `/admin`: KPIs, alertas, proveedor de origen, referencia y control operacional.
- `/api/payments/checkout`: crea un checkout alojado de Wompi o Mercado Pago sin exponer secretos.
- `/api/automation/catalog-optimization`: proceso protegido para stock, costos y decisiones de catalogo.

## Variables de entorno

Define las variables de `.env.example` en Vercel. Nexora soporta Wompi Checkout Web con `NEXT_PUBLIC_WOMPI_PUBLIC_KEY` (`pub_test_...` o `pub_prod_...`) y `WOMPI_INTEGRITY_SECRET` (`test_integrity_...` o `prod_integrity_...`), que firma cada compra desde el servidor. Como alternativa, `WOMPI_PRIVATE_KEY` (`prv_test_...` o `prv_prod_...`) crea Links de Pago por API. Para Mercado Pago usa `MERCADOPAGO_ACCESS_TOKEN` y define `PAYMENT_PROVIDER=mercadopago`.

## Automatizacion

La ruta de automatizacion acepta `GET` (Vercel Cron) y `POST` (agente externo), ambos protegidos con `Authorization: Bearer CRON_SECRET`. En el plan Hobby de Vercel el cron esta configurado diariamente para que el despliegue sea valido. Para ejecutar cada 15 minutos tras actualizar a Vercel Pro, cambia el schedule de `vercel.json` a `*/15 * * * *` y despliega de nuevo.

`src/lib/automation/catalog-optimizer.ts` contiene la regla determinista para destacar, monitorear o retirar productos. `src/lib/automation/niche-rotation.ts` consulta top-selling de CJ por Joyería, Tecnología/Hogar y Bienestar, manteniendo cada reemplazo en su nicho. Configura `CATALOG_STORE_API_URL` y `CATALOG_STORE_API_TOKEN` para persistir la sustitución en tu base de datos; las imágenes HTTPS del proveedor se priorizan antes del fallback local.
