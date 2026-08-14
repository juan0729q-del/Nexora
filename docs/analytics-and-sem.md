# Analítica, consentimiento y preparación SEM

## Plataformas opcionales

La capa cliente soporta GA4, Google Ads, Meta Pixel y TikTok Pixel. Cada script se carga únicamente si su ID supera validación y el visitante acepta analítica opcional. Sin ID, la plataforma queda explícitamente apagada. La analítica interna anónima continúa separada en el libro privado.

Variables:

- `NEXT_PUBLIC_GA4_MEASUREMENT_ID`
- `NEXT_PUBLIC_GOOGLE_ADS_ID`
- `NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL`
- `NEXT_PUBLIC_META_PIXEL_ID`
- `NEXT_PUBLIC_TIKTOK_PIXEL_ID`

El consentimiento se guarda localmente y en una cookie funcional. Antes de aceptar no se cargan etiquetas externas ni se capturan UTM. El control de privacidad del pie permite volver a elegir.

## Contrato de eventos

Se implementan `page_view`, `view_item_list`, `select_item`, `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase` y `checkout_error`.

Los eventos de comercio pueden incluir SKU, nombre editorial localizado, categoría, estilo, precio, moneda, cantidad, valor, mercado y método logístico. Nunca incluyen nombre de persona, correo, teléfono, dirección, tarjeta, credenciales, costo interno de CJ ni secretos.

Los UTM y click IDs se normalizan, limitan y guardan durante 30 días sólo tras consentimiento. Se transmiten como dimensiones de campaña, no como PII.

`purchase` tiene dos barreras:

1. El endpoint de estado consulta Wompi; para PayPal, un `POST` inicial solicita la captura y los `GET` posteriores son estrictamente de lectura.
2. El resultado sólo devuelve `APPROVED` cuando el evento quedó persistido como **PAGO CONFIRMADO** y sin revisión en el libro privado.

El ID estable del procesador se usa como `transaction_id` y clave de deduplicación local. Llegar a la página de resultado, cancelar PayPal o recibir un estado pendiente no dispara una compra.

La conciliación PayPal usa un `eventId` estable por captura y estado, independiente de si llegó por retorno o webhook. El libro privado serializa ambas rutas y envía como máximo un aviso exitoso a administración y uno al cliente por captura aprobada.

## Verificación manual

1. Mantener todos los IDs vacíos y confirmar que no aparecen solicitudes a sus dominios.
2. Configurar una plataforma de prueba/depuración a la vez.
3. Rechazar consentimiento y confirmar ausencia de etiquetas.
4. Aceptar, navegar y revisar `dataLayer`/herramienta oficial de diagnóstico.
5. Validar que cada acción produce un único evento con el mercado y moneda correctos.
6. Ejecutar un checkout de prueba; confirmar que PENDING/DECLINED no producen `purchase`.
7. Confirmar un pago firmado y conciliado; verificar un único `purchase`.
8. Inspeccionar payloads y rechazar cualquier PII.

Google Ads puede recibir `purchase` directamente cuando existen un ID `AW-…` y su etiqueta de conversión; alternativamente puede importarse desde GA4. Los IDs no crean campañas, objetivos ni audiencias por sí solos. Meta y TikTok también requieren dominio/cuenta y validación con sus herramientas oficiales. Ningún adaptador se carga antes del consentimiento ni recibe correo, nombre, teléfono, dirección o información de tarjeta.

## Preparación SEM honesta

- Separar campañas, landing pages y monedas de Colombia y EE. UU.
- No dirigir anuncios de compra a `/us` hasta completar una transacción PayPal Live conciliada y una cotización CJ real de extremo a extremo.
- No usar calificaciones, descuentos, urgencia, disponibilidad o beneficios médicos no verificados.
- Usar UTM consistentes (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`).
- Evaluar margen, flete, stock, tiempo de entrega, devoluciones y conversión reales antes de escalar.
- Mostrar cero actividad como “sin datos”, no como mal rendimiento.
