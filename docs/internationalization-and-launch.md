# Internacionalización y lanzamiento

## Decisión de arquitectura

Nexora usa prefijos estables: `/co` para Colombia y `/us` para Estados Unidos. Así, buscadores, caché, metadatos y personas reciben un documento inequívoco; no se sirve contenido variable por IP bajo una sola URL.

La selección inicial sigue este orden:

1. Preferencia funcional `nexora_market`, creada por el selector visible.
2. Encabezado `x-vercel-ip-country` sólo en la entrada `/`.
3. Colombia como fallback.

El selector escribe una cookie `HttpOnly`, `Secure`, `SameSite=Lax` y navega a la URL equivalente. La URL de mercado manda durante la sesión. El país de la dirección debe coincidir con el mercado; cambiar mercado, dirección o carrito elimina la cotización anterior.

## Monedas y tasa de cambio

El catálogo canónico conserva precios comerciales en COP y costos CJ en USD. `USD_TO_COP_RATE` significa COP por 1 USD. `USD_TO_COP_RATE_UPDATED_AT` debe ser una fecha ISO UTC aprobada por el propietario. La aplicación rechaza tasas fuera de 1.000–10.000 COP/USD, fechas futuras y registros con más de siete días.

No hay consulta externa en cada render ni tasa de respaldo. Sin una tasa válida se bloquean precios USD, márgenes, feeds y automatizaciones que dependen de conversión.

Procedimiento semanal:

1. Consultar una fuente financiera aprobada por el propietario.
2. Registrar la tasa y su hora UTC, sin añadir un margen oculto.
3. Actualizar ambas variables en Vercel para Production y Preview.
4. Redeploy y revisar `/admin/ventas`.
5. Documentar internamente fuente, responsable y fecha. La orden conserva la tasa usada.

COP se redondea a pesos enteros; USD a centavos. El envío y el total se calculan en la moneda de la orden y nunca se mezclan.

## Estado operativo

### Colombia

- Catálogo, idioma, direcciones y cotización CJ: implementados.
- Pago: adaptador Wompi COP implementado. Requiere llaves de un mismo entorno, secreto de integridad, secreto de eventos, webhook HTTPS y Google Sheets conectado.
- Confirmación: consulta oficial + registro conciliado; no depende del redirect.

### Estados Unidos

- Catálogo inglés, USD, estados/ciudad/ZIP y cotización CJ: implementados.
- Pago USD: adaptador PayPal Orders v2 implementado en servidor, con creación/captura alojada, verificación de webhook, idempotencia y conciliación multimoneda. Permanece bloqueado si falta una sola variable, si el libro no expone el contrato `2026-08-13.6` o si `PAYPAL_CHECKOUT_ENABLED` no es `true`.
- Variables: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_ENVIRONMENT=sandbox|live` y `PAYPAL_CHECKOUT_ENABLED=true`. Todas son de servidor.
- La rentabilidad USD no estima comisión PayPal: permanece pendiente hasta obtener el desglose real conciliado o una tarifa contractual aprobada.

No se debe anunciar Estados Unidos como mercado de compra hasta actualizar Apps Script, redeplegar Vercel y completar una transacción Live controlada con webhook, libro, correo y postventa verificados.

## Dominio propio

1. Adquirir y verificar el dominio; añadirlo al proyecto Vercel.
2. Configurar `NEXT_PUBLIC_SITE_URL=https://dominio` y redeploy.
3. Elegir ese host como Production Domain.
4. Registrar los nuevos webhooks Wompi y PayPal con el dominio final.
5. Crear propiedades del dominio en Search Console y Bing; actualizar Merchant Center, redes e IndexNow.
6. Enviar el nuevo `/sitemap.xml`.
7. Mantener el host Vercel como fallback y añadir redirecciones 308 desde los hosts anteriores al dominio canónico después de verificar que todos los consumidores externos fueron migrados.

No se deben habilitar redirecciones permanentes antes de adquirir y validar el dominio.

## Checklist Colombia

- [ ] Identidad legal y política de devoluciones aprobadas.
- [ ] Tasa COP/USD vigente.
- [ ] Credenciales Wompi de producción coherentes.
- [ ] Webhook Wompi de producción responde y concilia en Sheets.
- [ ] Cotización real de una dirección de prueba y variante exacta.
- [ ] Compra real controlada, correo, libro, conciliación y postventa revisados.
- [ ] Search Console, Bing, sitemap e IndexNow con el dominio final.
- [ ] Consentimiento y plataformas de analítica probados sin PII.
- [ ] Merchant Center sólo después de aprobar políticas y envío.

## Checklist Estados Unidos

- [ ] Elegibilidad legal/comercial del vendedor para operar en EE. UU.
- [ ] Identidad, privacidad, términos y devolución aprobados para ese mercado.
- [x] Adaptador servidor PayPal USD implementado con verificación criptográfica e idempotencia.
- [ ] Webhook PayPal Live apunta a `/api/payments/paypal/webhook`, está suscrito a `PAYMENT.CAPTURE.COMPLETED` y su ID coincide con Vercel.
- [ ] Contrato Apps Script `2026-08-13.6` publicado y confirmado.
- [ ] Libro privado acepta importes USD y reembolsos sin confundir COP.
- [ ] Cotizaciones CJ reales para varios estados, ZIP y variantes.
- [ ] Prueba completa de cobro, webhook, devolución y postventa.
- [ ] Feed Merchant US con shipping/returns configurados en Merchant Center.
- [ ] Search Console, Bing y analítica del dominio final.

Mientras esas casillas no estén completas y no exista una compra Live controlada aprobada, `/us` debe tratarse como catálogo y cotización, no como mercado comercial confirmado.
