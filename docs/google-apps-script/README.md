# Registro privado de ventas Nexora

La versión actual de `Code.gs` añade de forma aditiva las hojas `Eventos IA` y `Decisiones IA`, y amplía el contrato a `2026-08-13.6`. Los pedidos guardan mercado, locale, moneda, tasa COP/USD, procesador, ID de transacción e importes nativos COP/USD. Después de pegar el código, ejecuta otra vez `setupNexoraWorkbook` y crea una nueva versión del Web App. No elimina pedidos ni eventos comerciales existentes.

Los eventos de inteligencia no contienen PII y se reciben en lotes pequeños firmados con el mismo HMAC. Las propuestas conservan evidencia, confianza, implicaciones, reversión, estado y nota de decisión. Si Apps Script está temporalmente ausente, la navegación y la compra continúan; sólo se suspende el aprendizaje.

Este archivo se implementa en una cuenta de Google de Nexora y no contiene claves ni datos de clientes.

1. Crea un proyecto de Apps Script bajo `nexoraventas1@gmail.com` y pega `Code.gs`.
2. En **Project Settings → Script properties**, agrega:
   - `NEXORA_SHEETS_SPREADSHEET_ID`: ID de `Nexora | Ventas y Postventa`.
   - `NEXORA_SALES_WEBHOOK_SECRET`: cadena aleatoria de al menos 32 caracteres, igual a la variable de Vercel `GOOGLE_SHEETS_WEBHOOK_SECRET`.
   - `NEXORA_ADMIN_EMAIL`: `nexoraventas1@gmail.com`.
3. Ejecuta `setupNexoraWorkbook` una vez, revisando que la autorización sea para la cuenta Nexora y que incluya Google Sheets y MailApp. Este paso agrega de forma aditiva las columnas de variante CJ, flete, dirección, plazo, rentabilidad y `Artículos JSON` para carritos con varias referencias, sin borrar pedidos existentes.
4. Despliega como **Web app**, ejecutando como la cuenta Nexora, con acceso **Anyone**. Si ya existía un despliegue, crea una **nueva versión** y selecciónala antes de copiar la URL. El endpoint no sirve datos sin la firma HMAC y sólo Vercel conserva el secreto. La respuesta pública de salud incluye `contractVersion` y `workbookReady`; Nexora exige ambos antes de escribir pedidos, sin exponer ventas ni clientes.
5. Copia la URL `/exec` a `GOOGLE_SHEETS_WEBHOOK_URL` en Vercel. Agrega también `GOOGLE_SHEETS_SYNC_ENABLED=true` y vuelve a desplegar.
6. Comprueba el health check firmado: debe devolver `contractVersion: 2026-08-13.6` y `workbookReady: true`. Un contrato anterior bloquea el checkout; no se degrada silenciosamente.

Estados Unidos sólo puede cobrar cuando PayPal está explícitamente habilitado y completo, el webhook pertenece a la misma aplicación/entorno y este contrato del libro responde correctamente. La presencia de columnas USD o credenciales aisladas no equivale a una integración operativa. El panel separa COP y USD; no estima la comisión PayPal mientras no exista un desglose conciliado y una tarifa contractual aprobada.

El contrato `2026-08-13.6` incorpora una lectura firmada `sales.order.read`, sin PII y sin escrituras. La orden PayPal debe existir en `Pedidos` antes de crearla en PayPal. La captura se solicita por `POST`; el `GET` posterior sólo consulta PayPal y el libro. El `eventId` financiero es `paypal:<CAPTURE_ID>:<ESTADO>`: retorno y webhook producen el mismo valor aunque difieran la fuente o la hora. `LockService` serializa ambas llegadas; un evento duplicado no vuelve a conciliar la orden y sólo reintenta un aviso previamente fallido. Un aviso marcado `ENVIADO` u `OMITIDO` nunca se repite.

## Actualización obligatoria antes del redeploy de Nexora

1. Reemplaza el contenido del proyecto de Apps Script por el `Code.gs` actual.
2. Guarda y ejecuta `setupNexoraWorkbook`; autoriza la migración aditiva de columnas.
3. En **Deploy → Manage deployments**, edita el Web App, selecciona **New version** y conserva ejecución como propietario y acceso **Anyone**.
4. Conserva la URL `/exec` actual si Google no la cambió. No cambies el secreto HMAC.
5. Verifica que el endpoint de salud informe `2026-08-13.6` y `workbookReady: true`.
6. Sólo entonces redepliega Vercel con las variables PayPal Live.

La cuenta Gmail personal tiene cuotas de Apps Script, incluyendo un límite diario de destinatarios de correo; Nexora sólo enviará correos de pago aprobado y cambios de envío, no de cada intento de checkout. El pedido a CJ se crea manualmente después de que el pago quede conciliado: el libro deja visibles cada referencia, cantidad, variante exacta, método de envío y costo para evitar despachar un artículo equivocado.
