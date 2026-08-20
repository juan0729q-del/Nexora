# Internacionalización y lanzamiento

## Decisión de arquitectura

Nexora usa prefijos estables: `/co` para Colombia y `/us` para Estados Unidos. Así, buscadores, caché, metadatos y personas reciben un documento inequívoco; no se sirve contenido variable por IP bajo una sola URL.

La selección inicial sigue este orden:

1. Preferencia funcional `nexora_market`, creada por el selector visible.
2. Encabezado `x-vercel-ip-country` sólo en la entrada `/`.
3. Colombia como fallback.

El selector escribe una cookie `HttpOnly`, `Secure`, `SameSite=Lax` y navega a la URL equivalente. La URL de mercado manda durante la sesión. El país de la dirección debe coincidir con el mercado; cambiar mercado, dirección o carrito elimina la cotización anterior.

## Monedas y tasa de cambio

El catálogo canónico conserva el costo real de cada estilo CJ en USD. El precio comercial se calcula para el estilo exacto con una política única: costo CJ convertido a COP + reserva operativa configurada + la estructura de comisión más costosa entre Wompi y PayPal, manteniendo `CATALOG_TARGET_CONTRIBUTION_MARGIN`. Para PayPal Colombia se documenta 5,40 % + USD 0,30; puede actualizarse con `PAYPAL_FEE_PERCENTAGE` y `PAYPAL_FEE_FIXED_USD` si el contrato del comercio cambia. COP se redondea hacia arriba a centenas y USD se deriva del mismo precio canónico a centavos; no existen listas de precios independientes por país.

La TRM oficial vive versionada en `src/data/exchange-rate.json` y se obtiene de la Superintendencia Financiera de Colombia a través de Datos Abiertos Colombia. El workflow `update-exchange-rate.yml` la consulta una vez cada día hábil, ejecuta validaciones y pruebas y sólo publica el JSON si cambió. No hay consulta externa en cada render. Si el registro supera siete días, se bloquean precios, cotizaciones y cobros.

`USD_TO_COP_RATE` y `USD_TO_COP_RATE_UPDATED_AT` son una anulación manual opcional: sólo tienen prioridad si ambos valores son válidos, no futuros y vigentes. Si no, Nexora usa el registro oficial versionado.

Procedimiento de contingencia:

1. Ejecutar manualmente `Update official COP USD rate` en GitHub Actions o `pnpm exchange-rate:update` localmente.
2. Validar `src/data/exchange-rate.json`, origen, vigencia y diff.
3. Si la fuente oficial no responde, no introducir una tasa estimada. Una anulación manual requiere documentar fuente, responsable y fecha.
4. Revisar `/admin/ventas`; cada orden conserva tasa, fecha, mercado, moneda y precio del estilo exacto.

El envío real de CJ se suma después de elegir dirección y método. El margen objetivo se aplica al producto, no se oculta dentro de la conversión ni se inventa sobre el flete.

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
