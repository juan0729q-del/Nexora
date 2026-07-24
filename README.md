# Nexora

Tienda de alto rendimiento construida con Next.js App Router, Tailwind CSS y preparada para desplegar en Vercel.

## Rutas

- `/`: catálogo público, semántico y responsive.
- `/productos/[slug]`: ficha SEO de cada producto con Schema.org Product y generación estática.
- `/admin/login`: acceso de sesión protegida.
- `/admin`: KPIs, alertas y control operacional del catálogo.

## Puesta en marcha

1. Copia `.env.example` a `.env.local` y define `ADMIN_PASSWORD` y `ADMIN_SESSION_SECRET`.
2. Instala dependencias con tu gestor preferido y ejecuta `pnpm dev`.
3. En Vercel, añade las mismas variables de entorno antes de desplegar.

## Integraciones previstas

- `src/lib/providers/payment-provider.ts`: adaptador asíncrono para Wompi o Mercado Pago. La creación de órdenes ocurre en `src/app/api/payments/checkout/route.ts` para proteger las claves privadas.
- `src/lib/automation/supplier-sync.ts`: sincronización de proveedor para un cron de Vercel.
- `src/lib/automation/seo-content.ts`: prompt seguro de backend para una IA que genere la ficha SEO.
- `src/lib/automation/pricing.ts`: regla de margen y anti-anomalías para pausar productos afectados.

La tabla de administración está preparada para persistir los cambios en un endpoint o base de datos; en esta primera versión sus cambios son locales a la sesión del navegador.
