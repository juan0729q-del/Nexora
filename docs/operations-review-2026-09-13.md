# Revisión de CJ, inventario y prioridad por mercado — 13 de septiembre de 2026

## Hallazgos comprobados

- El diagnóstico autenticado de Nexora obtuvo `remaining: 50000`, `total: 50000` y respuestas correctas de ajustes, categorías y una ficha de CJ. La primera comprobación pasó de 20 a 30 puntos usados; la comprobación posterior informó 630 y 640. No se deduce disponibilidad restando `usedToday` de `total`.
- La importación y parte de la cotización llamaban a una comprobación síncrona de la cuota guardada en memoria. Ese recorrido podía detenerse por un cero o saldo antiguo sin volver a consultar ajustes. El checkout ya tenía una renovación parcial que no cubría todos los recorridos.
- No se pudo reconstruir la respuesta original de CJ que informó cero en ejecuciones anteriores. La comprobación actual confirma que el acceso y los puntos están disponibles; no demuestra que CJ nunca haya respondido cero transitoriamente.
- La ejecución 34776179572 consultó un catálogo válido; la publicación se detuvo porque CJYDQTJM00256 todavía no tenía textos revisados. La ejecución 34776438966, con la corrección de cuota desplegada, también obtuvo 15 productos y conservó el candidato como artefacto para completar esa revisión.

## Correcciones y validación

- Todas las comprobaciones preventivas de importación, enriquecimiento y cotización renuevan una cuota baja mediante ajustes antes de detenerse. La información de puntos caduca al minuto y se conserva la reserva de 200 puntos. Una cuota confirmada insuficiente y los rechazos reales de CJ siguen bloqueando la llamada; no hay reintentos ilimitados.
- `null`, booleanos, cadenas vacías y valores negativos no se convierten en cero. Las pruebas reproducen recuperación desde cero, agotamiento confirmado, caducidad y lectura inválida.
- El panel tiene una comprobación explícita de acceso y puntos, protegida por sesión administrativa. Solo se ejecuta al pulsar el botón; no crea pedidos ni actualiza el catálogo. La ficha consultada cuesta 10 puntos.
- La versión 43 del catálogo proviene del artefacto verificado de 34776438966, obtenido a las 19:02 UTC. Se revisó la cuerda para saltar CJYDQTJM00256 contra su descripción oficial: longitud total 287 cm, mangos 17 cm, contador y batería no incluida. Las fichas con stock crítico fueron sustituidas por productos con inventario comprobado. Se mantienen cinco productos CJ por nicho.
- La preferencia geográfica existente redirige la raíz según el país comunicado por Vercel, respetando la selección manual de mercado. En Colombia, Dropi tiene prioridad estable dentro de cada listado; CJ continúa presente. En Estados Unidos, CJ tiene prioridad. Categorías, portada y relacionados comparten la regla, sin modificar el orden interno de las promociones por proveedor.
- Catálogo, 37 pruebas, lint y build pasaron con el candidato revisado. No se realizaron pagos ni pedidos de prueba.

## Dropi: bloqueo externo y solicitud enviada

La integración 398741 figura como DropPage en el panel autenticado. Las opciones disponibles son integraciones con socios; no aparece Nexora ni una opción genérica para desarrollo propio. La consulta API de productos devolvió HTTP 401, Access denied. La fundación multi-proveedor está implementada, pero no hay productos Dropi reales publicados ni contrato de pedidos o fletes confirmado.

Con autorización expresa del propietario, se envió este mensaje a soporte dentro del panel:

> Necesitamos conectar Nexora, desarrollo propio en https://nexora-amber-two.vercel.app. La integración 398741 figura como DropPage y devuelve 401 Access denied al consultar productos. ¿Pueden indicar o habilitar el tipo de integración correcto y facilitar la documentación oficial de catálogo, fletes y pedidos?

El asistente de Dropi confirmó la transferencia al equipo de Integraciones. Indicó atención de lunes a viernes, 8:00 a. m. a 5:00 p. m., y sábados/lunes festivos, 8:00 a. m. a 12:00 m. No se compartió el token ni se cambiaron permisos o credenciales.

La incorporación comercial de Dropi requiere la respuesta del proveedor, acceso de lectura válido y documentación oficial para completar importación, fletes, pedidos idempotentes y seguimiento. El orden local primero está preparado y probado con datos de prueba; su comprobación con productos Dropi reales sigue pendiente.

## Autonomía de la sincronización

Se separó la actualización del inventario existente de la búsqueda de novedades:

- Inventario cada seis horas; descubrimiento semanal y bajo solicitud manual con `discover`.
- Hasta tres intentos de lecturas idempotentes, con esperas de 60 y 120 segundos. Los errores de autorización no se reintentan. La recuperación combina lecturas válidas de la misma versión y rechaza cambios de versión durante una consulta.
- Una respuesta vacía, cantidad nula, negativa o bodega sin cantidad interpretable representa dato no confirmado, nunca stock cero. Un cero explícito válido sigue pausando la venta según la política existente.
- Publicación de lecturas parciales sin alterar los SKU no confirmados ni los productos Dropi. El panel identifica los SKU pendientes y la ejecución termina fallida si no se recuperó la lectura completa.
- Las novedades sin edición bilingüe se guardan en `catalog-candidates.json` y se señalan en el panel. No bloquean la actualización de inventario ni se publican con contenido improvisado.
- La fecha de verificación se renueva aunque las cantidades no cambien. La sincronización exige que la versión desplegada corresponda a la versión que se va a actualizar.
- Cada publicación valida el catálogo, ejecuta pruebas y compila. Los cambios concurrentes requieren rebase y nueva validación antes del push; no hay push forzado.

La primera comprobación del nuevo workflow detectó incompatibilidad de `await` al iniciar los scripts con tsx en formato CommonJS. Se corrigieron los tres puntos de entrada y se añadió una prueba de ejecución real de los scripts con archivos temporales, sin acceso al proveedor. Las 45 pruebas locales pasaron. Esto no permite garantizar ausencia de interrupciones externas: una suspensión de cuenta, cambio de contrato o caída sostenida del proveedor requiere intervención y no se oculta como una sincronización exitosa.

## Cierre de verificación: 14 de septiembre

La ejecución 34792258044 capturó por primera vez el caso concreto de telemetría CJ `usedToday=0, remaining=0, total=0` persistente tras tres consultas. El guard local lo interpretaba como agotamiento. Se corrigió en e4fde67: un total cero representa asignación indeterminada; se conserva la telemetría sin inventar saldo y CJ sigue autorizando o rechazando cada solicitud. Un saldo cero con total positivo conserva la protección de reserva; los rechazos reales HTTP 429 siguen deteniendo las llamadas.

La [ejecución 34792764824](https://github.com/juan0729q-del/Nexora/actions/runs/34792764824) terminó exitosa en ambos trabajos, inventario y novedades. Publicó automáticamente v44 y después v45, con 15 productos, importación 2026-09-14T00:30:45.140Z. El panel de producción confirmó v45, 4.676 unidades registradas y cero alertas críticas. Esto prueba una ejecución real completa; la programación periódica no garantiza puntualidad ni disponibilidad permanente de GitHub o CJ.

También se verificó una respuesta válida del contrato de Google en 23,99 segundos, frente al límite anterior de 10 segundos. Apps Script registraba ejecuciones completadas mientras Vercel registraba tiempos agotados. Se respetó el tiempo configurable del registro y se añadió un único reintento de lectura para fallos transitorios de `intelligence.read`. Los errores de contrato y autorización siguen siendo permanentes; no se repiten escrituras, decisiones ni pagos. No se habilitó un catálogo alternativo que omita pausas humanas.

La corrección 4410acb pasó 48 pruebas, tipos, lint y build, además del control de calidad y despliegue remoto. Las consultas nuevas a /co y /us devolvieron HTTP 200 en aproximadamente 10 segundos, con productos renderizados y sin errores del servidor incrustados en HTML. El administrador volvió a cargar con la versión actual. Se aisló la prueba de lenguaje clínico en una muestra estática para que retirar ese producto por rotación no rompa una prueba editorial ajena al inventario.

Dropi se revisó nuevamente el 14 de septiembre: la última respuesta sigue siendo la transferencia a Integraciones, sin documentación ni habilitación nueva. La integración comercial continúa bloqueada por el proveedor. No se crearon pedidos ni se efectuaron cobros durante estas verificaciones.

## Seguimiento Dropi: 20 de septiembre

Edward, asesor de Dropi, confirmó que Dropi no ofrece una API pública abierta para sistemas propios. Indicó solicitar una API privada evaluada por el equipo técnico mediante correo a `marcos.amado@dropi.co`, incluyendo la justificación, los endpoints requeridos y los datos de la cuenta.

Con confirmación expresa del propietario, se envió desde `nexoraventas1@gmail.com` una solicitud para la integración 398741. Se pidió acceso y documentación oficial para catálogo, detalle y variantes, inventario por SKU, bodegas colombianas, cotización de flete, modalidades contra entrega y prepago, pedidos idempotentes, estados, guías, cancelación previa al despacho y webhooks firmados. También se solicitaron ambientes, autenticación, límites, errores, reintentos y proceso de certificación. No se incluyó el token ni se creó ningún pedido.

Hasta recibir la autorización y el contrato técnico oficial, Nexora mantiene bloqueadas las llamadas operativas de Dropi que podrían cotizar o crear pedidos. La prioridad geográfica de Dropi para Colombia y la convivencia con CJ están implementadas, pero la publicación de productos locales reales sigue condicionada a esa respuesta.
