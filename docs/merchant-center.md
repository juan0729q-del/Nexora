# Google Merchant Center

Nexora expone una arquitectura de feeds por mercado, pero ambos permanecen cerrados por defecto:

- `/feeds/google/co.xml`
- `/feeds/google/us.xml`

Un feed responde `503` hasta que `MERCHANT_CENTER_FEED_ENABLED=true`, `MERCHANT_CENTER_POLICIES_APPROVED=true`, el checkout del mercado está operativo y sus datos editoriales están completos. Estados Unidos exige además `MERCHANT_CENTER_US_APPROVED=true`; hoy su procesador USD no existe, por lo que ese feed no puede activarse.

## Datos incluidos

- ID estable derivado del SKU, sin exponer el identificador como dato privado.
- Título, descripción y URL localizados.
- Imagen principal y galería oficial de CJ.
- Precio, moneda, disponibilidad y condición.
- Sólo productos públicos, vendibles y con contenido editorial completo.

El feed declara `identifier_exists=no` porque el catálogo no acredita GTIN, MPN o marca de fabricante. No se inventan esos campos ni descuentos.

## Requisitos antes de activar Colombia

1. Dominio propio verificado y reclamado.
2. Identidad comercial real publicada.
3. Política de devolución con plazos, dirección y costos aprobados.
4. Configuración de envío de Merchant Center coherente con las cotizaciones dinámicas de CJ; no publicar una tarifa fija inventada.
5. Wompi de producción y checkout conciliado.
6. Comparar una muestra de feed contra ficha, carrito y total.
7. Configurar impuestos y destinos según las obligaciones reales del comercio.

Merchant Center puede requerir shipping y return policy mediante configuración de cuenta, atributos del feed o ambas. Nexora no genera esos atributos hasta que existan reglas aprobadas y verificables.

## Exclusiones automáticas

Se excluyen productos pausados, agotados, sin imagen oficial, sin traducción completa, sin precio válido o pertenecientes a un mercado cuyo checkout no esté habilitado. Una rotación conserva el ID derivado del SKU y los enlaces cortos `/co/p/SKU` o `/us/p/SKU`, pero el feed apunta siempre a la ficha canónica vigente.
