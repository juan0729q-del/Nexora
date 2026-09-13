# Revisión operativa — 12 de septiembre de 2026

## Correcciones

- TRM: selección por fecha de Colombia y vigencia oficial, actualización diaria también en fines de semana. Valor verificado: 3072,27 COP/USD para el 12 de septiembre. El workflow manual 34703908218 terminó correctamente.
- Catálogo: seis referencias carecían de contenido editorial completo y bloqueaban las pruebas del actualizador. Se completó contenido basado en las fichas reales.
- Inventario: nuevas candidaturas requieren stock superior a dos; las referencias reutilizadas consultan disponibilidad oficial. Las importaciones CJ preservan productos locales y métricas propias de referencias existentes. La publicación automática valida catálogo, pruebas y build antes del commit.
- Administración: inventario identificado como última importación; alerta si supera 48 horas y diagnóstico de vigencia de TRM.
- Inteligencia: conserva decisiones históricas, aplica la última decisión ejecutada por SKU, refleja vigilancia y pausa operativas, rechaza autorizaciones vencidas y elimina marcadores de ejecución introducidos en notas. Una falla del registro privado no reactiva silenciosamente productos pausados.
- Apps Script: historial completo en lugar de últimas 60 propuestas. Publicado en versión 14 conservando el despliegue existente.
- Dependencias: Next.js 16.3.4 y dependencias transitivas corregidas; auditoría sin vulnerabilidades conocidas.
- Despliegue: se corrigió la generación estática del sitemap, que consultaba Google durante el build. El commit 15e9237 pasó GitHub y Vercel; el sitemap productivo respondió HTTP 200 y XML en 4,87 segundos.
- Carga: las secciones comparten una única lectura concurrente del catálogo operativo; una autorización invalida también las lecturas anteriores. La tienda respondió HTTP 200; Google sigue siendo una dependencia durante las lecturas sin caché.

## Estado de proveedores

CJ fue reactivado. La ejecución 34703909652 omitió la importación porque el proveedor reportó cero puntos disponibles (reserva operativa: 200). El catálogo sigue siendo la versión 42 del 21 de agosto: no debe interpretarse como inventario actualizado hoy. No se forzó el consumo de cuota ni se inventaron reemplazos.

Dropi muestra la integración 398741 de tipo DropPage. La consulta de solo lectura a `https://api.dropi.co/integrations/products/index` respondió HTTP 401, Access denied. No se crearon pedidos ni se modificaron permisos del proveedor.

## Plan Dropi y condiciones de continuación

1. Estabilización: completada; el commit antiguo señalado ya no era el pendiente actual.
2. Fundación y catálogo: origen CJ retrocompatible, validación separada de imágenes/hosts, configuración estricta de ambientes y costos COP implementados. Los métodos de catálogo/pedidos requieren el contrato oficial accesible.
3. Importación: pendiente acceso válido y respuesta real de catálogo para mapear productos y variantes sin inventar campos.
4. Envíos: pendiente contrato de cotización local, cobertura, inventario y pruebas de firma/TTL. Se eliminó el flete fijo ficticio de 13.500 COP.
5. Pedidos/admin/libro: pendiente confirmar si la API permite crear sin cobrar ni despachar, idempotencia y reconciliación ante timeout. La ruta actual devuelve 503 sin reservar ni enviar pedidos. No se reutiliza cjOrderId para Dropi.
6. Configuración y documentación: variables de ejemplo y diagnóstico seguro disponibles. El token permanece exclusivamente del lado del servidor.
7. Verificación: 31 pruebas, lint, tipos, catálogo y build pasan localmente. Estas pruebas validan las protecciones actuales; no acreditan una integración Dropi operativa.

Para resolver el bloqueo externo, se necesita que Dropi habilite una integración compatible con Nexora y entregue su documentación oficial: permisos del token, dominios/IP aplicables, catálogo, variantes, fletes, creación de pedidos y consulta/reconciliación. No se envió ninguna comunicación a soporte ni se compartieron credenciales.

No se realizaron compras de prueba, cobros ni despachos. Las verificaciones de pagos existentes son pruebas automatizadas, no transacciones reales.

## Comprobación productiva del 13 de septiembre

- La versión 94efa6c pasó GitHub y Vercel. Se desactivaron precargas especulativas de fichas y navegación administrativa para reducir consultas a Google.
- Se observaron timeouts intermitentes del registro privado; Apps Script completaba sus ejecuciones, mientras algunas respuestas agotaban el tiempo de Nexora. No se restauró el comportamiento que ignoraba pausas cuando Google fallaba. La dependencia externa todavía puede afectar una lectura sin caché.
- El panel volvió a leer 508 eventos y el historial completo. Se autorizó la pausa del SKU CJBJMRJF00208, ya protegido por stock crítico: el resultado quedó ejecutado, persistió después de recargar y su enlace público devolvió HTTP 404. No se solicitaron candidatos ni se consumió cuota CJ en esta prueba.
- La ejecución diaria CJ 34754698265 volvió a reportar cero puntos; el inventario no se renovó. La TRM de 3072,27 tiene vigencia oficial del 12 al 14 de septiembre.
- La tabla administrativa calcula ahora el precio inicial con la misma política y TRM de la tienda, en vez del precio histórico importado. Un error de lectura de Inteligencia ya no indica incorrectamente que deba desplegarse Apps Script.

La integración comercial completa de Dropi continúa pendiente de habilitación y documentación oficial del proveedor; la protección de sus rutas no equivale a un servicio de fulfillment implementado.
