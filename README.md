# Nexora

Tienda Next.js App Router + Tailwind CSS para un catálogo real de CJ Dropshipping. El catálogo publicado vive en `src/data/catalog.json`, se valida antes de compilar y se versiona en Git. No hay una base externa ni escrituras persistentes en el filesystem efímero de Vercel.

## Estado real por mercado

| Mercado | URL | Idioma | Moneda | Envío | Pago |
| --- | --- | --- | --- | --- | --- |
| Colombia | `/co` | `es-CO` | COP | Cotización CJ por destino, variante y cantidad | Wompi, únicamente si llaves, firma, webhook y libro privado están listos |
| Estados Unidos | `/us` | `en-US` | USD | Cotización CJ real por dirección estadounidense | Adaptador PayPal preparado; sólo se habilita con cinco variables coherentes, webhook Live y libro privado `2026-08-13.6` |

La cookie funcional `nexora_market` conserva la selección manual. Para la primera visita, Vercel puede sugerir Estados Unidos mediante `x-vercel-ip-country`; cualquier otro país usa Colombia como fallback. La URL elegida prevalece y el checkout nunca cambia de mercado silenciosamente.

## Superficies principales

- `/co`, `/us`: portadas localizadas.
- `/co/joyeria`, `/us/jewelry` y equivalentes: categorías indexables.
- `/co/productos/[slug]`, `/us/products/[slug]`: fichas editoriales con imágenes oficiales de CJ.
- `/co/p/[SKU]`, `/us/p/[SKU]`: enlaces cortos permanentes que redirigen a la ficha vigente tras una rotación.
- `/co/carrito`, `/us/cart`: carrito, cotización real y checkout condicionado a la disponibilidad del procesador de cada mercado.
- `/admin`, `/admin/ventas`, `/admin/inteligencia`: superficies privadas y no indexables.
- `/feeds/google/co.xml`, `/feeds/google/us.xml`: feeds bloqueados hasta cumplir todos los requisitos de Merchant Center.

## Reglas no negociables

- Sólo productos CJ reales con SKU, fuente directa, inventario y recursos gráficos oficiales.
- Los datos crudos del proveedor se conservan separados del copy editorial de `src/lib/product-presentation.ts`.
- Una ficha se publica en un mercado únicamente cuando su paquete editorial tipado está completo.
- No existen `AggregateRating`, reseñas, descuentos, GTIN, MPN, marca ni afirmaciones médicas inventadas.
- Toda cotización de envío es firmada, expira y se invalida al cambiar mercado, moneda, dirección, producto, estilo o cantidad.
- `purchase` se emite solamente después de consultar Wompi o capturar/consultar PayPal y persistir una conciliación aprobada en el libro privado.
- La automatización permanece supervisada (`INTELLIGENCE_MODE=shadow`) y no publica precios o catálogo sin autorización humana y validación CJ.

## Catálogo, checkout y postventa

`pnpm catalog:validate` impide compilar datos incompletos, duplicados o imágenes ajenas a los hosts oficiales permitidos. El importador autentica con `CJ_DROPSHIPPING_API_KEY`, respeta reservas de puntos y sólo prepara cambios versionables.

El carrito solicita dirección completa, cotiza cada referencia exacta y recomienda la alternativa real de menor costo. El comprador puede elegir otra opción devuelta por CJ. El token de cotización cifra los importes y la dirección, conserva mercado/locale/moneda/tasa y vence en minutos. El checkout vuelve a validar token e inventario antes de firmar un total COP para Wompi o USD para PayPal; nunca mezcla monedas.

El libro privado de Google Sheets registra el pedido antes de revelar la pasarela. Los webhooks verificados de Wompi y PayPal son idempotentes; una redirección del navegador jamás se interpreta como pago. La orden a CJ continúa siendo una acción administrativa explícita.

PayPal usa exclusivamente variables de servidor: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENVIRONMENT` y el gate `PAYPAL_CHECKOUT_ENABLED`. Para Live, el webhook debe pertenecer a la misma aplicación y apuntar a `/api/payments/paypal/webhook`. Un Client ID aislado nunca habilita el cobro. El retorno inicia la captura una sola vez con `POST`; las consultas posteriores usan `GET` y no capturan, concilian ni notifican. Retorno y webhook calculan el mismo `eventId` a partir de captura + estado, sin depender de la fuente ni de la hora de llegada.

Las políticas de devoluciones, privacidad y términos permanecen fuera del sitemap y con `noindex` mientras no exista aprobación legal/comercial completa. El contacto público se parametriza con `NEXT_PUBLIC_CONTACT_*`; los valores incluidos corresponden únicamente a canales previamente aprobados por el propietario.

### Contactos públicos confirmados por el propietario

- Correo: `nexoraventas1@gmail.com`
- WhatsApp: `+57 302 459 5220` — `https://wa.me/573024595220`
- Facebook: `https://www.facebook.com/profile.php?id=61592349341501`
- Instagram: `https://www.instagram.com/nexoraventas1/`
- TikTok: `https://www.tiktok.com/@nexora.diseo.con`

Estos son canales públicos comerciales; no constituyen por sí solos identidad legal, domicilio o razón social.

## Documentación operativa

- [Internacionalización y lanzamiento](docs/internationalization-and-launch.md)
- [Analítica y preparación SEM](docs/analytics-and-sem.md)
- [Merchant Center](docs/merchant-center.md)
- [Proceso editorial y guías](docs/editorial-guides.md)
- [Google, Bing e IndexNow](docs/search-indexing.md)
- [Libro privado de ventas](docs/google-apps-script/README.md)

## Desarrollo y verificación

```bash
pnpm install
pnpm catalog:validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Usa `.env.example` como inventario de configuración segura. No copies secretos al cliente ni a Git. Un identificador opcional vacío mantiene apagada su integración; una llave por sí sola nunca activa un procesador de pagos que no tenga adaptador, webhook e idempotencia implementados.
