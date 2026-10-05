# Integración local con Rocketfy

## Decisión

Rocketfy es el candidato técnico para Colombia porque reúne proveedores locales y logística nacional, y su API pública documenta autenticación, cotización de transportadoras y consulta de envíos. CJ permanece para productos internacionales. La ubicación/mercado de Nexora ordena Rocketfy primero en Colombia y CJ primero en Estados Unidos sin ocultar el otro catálogo.

Amazon y Mercado Libre no se usan como proveedores de compra: sus APIs oficiales automatizan cuentas de vendedores, publicaciones y órdenes creadas dentro de sus propios marketplaces. AliExpress no resuelve la prioridad de inventario local colombiano. Dropi confirmó que su API para software propio es privada y no respondió la solicitud posterior.

## Protección del pago

La ruta de cotización local usa `POST /api/public/calculateShipping` y conserva sólo transportadoras habilitadas. El costo `shipping_value` de la alternativa elegida se incluye en el token firmado de Nexora. Wompi recibe el total exacto de productos más flete y una fecha de vencimiento; cambiar dirección, mercado, variante, cantidad, método o precio invalida el token.

El checkout local exige simultáneamente:

- `ROCKETFY_LOCAL_COMMERCE_ENABLED=true`;
- credenciales contractuales `partnerID` y `api_key`;
- `customerID` y origen colombiano configurados;
- peso y dimensiones verificadas por variante;
- inventario verificado dentro de `ROCKETFY_INVENTORY_MAX_AGE_SECONDS`;
- costo COP positivo, ficha oficial e imágenes servidas por Rocketfy.

Si falta una condición, la compra se detiene antes de abrir Wompi. No se usan tarifas promedio, stock supuesto ni pedidos de prueba como datos reales.

## Bloqueo contractual pendiente

La documentación pública de Rocketfy disponible describe logística para inventario propio. No documenta la lectura del marketplace de proveedores, la reserva de su inventario ni la creación de una orden dropshipping pagada por Nexora. Por ese motivo Nexora no llama `createOrder` para productos de terceros: hacerlo podría generar una guía desde la dirección de Nexora sin reservar el producto del proveedor.

Para activar ventas se necesita de Rocketfy un contrato que defina y habilite:

1. catálogo y variantes del proveedor local;
2. inventario disponible y webhooks de cambios;
3. reserva idempotente antes o inmediatamente después del pago;
4. creación de la orden al proveedor y selección inequívoca de la tarifa cotizada;
5. cancelación, novedades, devoluciones y estados de guía;
6. sandbox, límites, reintentos y claves de idempotencia.

Una vez recibidos esos datos se importan productos reales, se prueba una orden sandbox completa y sólo entonces se cambia el gate a `true` en Vercel. No hacen falta cambios en el cálculo del checkout: el costo de transporte ya está incorporado en el contrato firmado de pago.
