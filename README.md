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

Define las variables de `.env.example` en Vercel. Para Wompi, `WOMPI_PRIVATE_KEY` debe ser una llave privada (`prv_test_...` o `prv_prod_...`) valida y del mismo ambiente que la API. Para Mercado Pago usa `MERCADOPAGO_ACCESS_TOKEN` y define `PAYMENT_PROVIDER=mercadopago`.

## Automatizacion

La ruta de automatizacion acepta `GET` (Vercel Cron) y `POST` (agente externo), ambos protegidos con `Authorization: Bearer CRON_SECRET`. En el plan Hobby de Vercel el cron esta configurado diariamente para que el despliegue sea valido. Para ejecutar cada 15 minutos tras actualizar a Vercel Pro, cambia el schedule de `vercel.json` a `*/15 * * * *` y despliega de nuevo.

`src/lib/automation/catalog-optimizer.ts` contiene la regla determinista para destacar, monitorear o retirar productos. Conecta alli tus metricas reales y guarda las decisiones en base de datos para persistirlas entre ejecuciones.
