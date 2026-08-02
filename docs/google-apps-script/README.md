# Registro privado de ventas Nexora

Este archivo se implementa en una cuenta de Google de Nexora y no contiene claves ni datos de clientes.

1. Crea un proyecto de Apps Script bajo `nexoraventas1@gmail.com` y pega `Code.gs`.
2. En **Project Settings → Script properties**, agrega:
   - `NEXORA_SHEETS_SPREADSHEET_ID`: ID de `Nexora | Ventas y Postventa`.
   - `NEXORA_SALES_WEBHOOK_SECRET`: cadena aleatoria de al menos 32 caracteres, igual a la variable de Vercel `GOOGLE_SHEETS_WEBHOOK_SECRET`.
   - `NEXORA_ADMIN_EMAIL`: `nexoraventas1@gmail.com`.
3. Ejecuta `setupNexoraWorkbook` una vez, revisando que la autorización sea para la cuenta Nexora y que incluya Google Sheets y MailApp. Este paso agrega de forma aditiva las columnas de variante CJ, flete, dirección, plazo, rentabilidad y `Artículos JSON` para carritos con varias referencias, sin borrar pedidos existentes.
4. Despliega como **Web app**, ejecutando como la cuenta Nexora, con acceso **Anyone**. Si ya existía un despliegue, crea una **nueva versión** y selecciónala antes de copiar la URL. El endpoint no sirve datos sin la firma HMAC y sólo Vercel conserva el secreto. La respuesta pública de salud incluye `contractVersion` y `workbookReady`; Nexora exige ambos antes de escribir pedidos, sin exponer ventas ni clientes.
5. Copia la URL `/exec` a `GOOGLE_SHEETS_WEBHOOK_URL` en Vercel. Agrega también `GOOGLE_SHEETS_SYNC_ENABLED=true` y vuelve a desplegar.

La cuenta Gmail personal tiene cuotas de Apps Script, incluyendo un límite diario de destinatarios de correo; Nexora sólo enviará correos de pago aprobado y cambios de envío, no de cada intento de checkout. El pedido a CJ se crea manualmente después de que el pago quede conciliado: el libro deja visibles cada referencia, cantidad, variante exacta, método de envío y costo para evitar despachar un artículo equivocado.
