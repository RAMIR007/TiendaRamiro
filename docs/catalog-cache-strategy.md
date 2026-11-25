# Estrategia de caché del catálogo — RamiroX Market

**Estado:** propuesta técnica; no implementada ni activada en producción.  
**Objetivo:** mejorar el tiempo de primera visualización sin presentar precios ni existencias antiguas como datos actuales.  
**Restricciones:** presupuesto adicional cero; no alterar pedidos, productos, precios, stock, cuentas ni base de datos durante esta fase.

## 1. Diagnóstico comprobado del código actual

- `wrangler.jsonc` publica `./public` como Static Assets y no declara un entrypoint `main` para lógica Worker propia.
- `public/js/data.js` persiste el catálogo completo en `localStorage`, incluyendo precio, stock y disponibilidad de proveedor.
- `public/js/store.js` dibuja primero `getCachedProducts()` y después consulta Supabase. Por tanto, una copia local puede mostrarse antes de que termine la actualización.
- `public/js/cart.js` reconcilia el carrito contra esa copia local. Cuando hay conexión, `create_order` delega la validación de pedido al servidor. Si la conexión falla, la aplicación ofrece enviar igualmente un mensaje de WhatsApp sin registrar el pedido; ese camino no equivale a una confirmación de stock o precio.
- Las imágenes del catálogo ya usan carga diferida, `srcset` para variantes de 400/800 px y `Cache-Control: public, max-age=31536000, immutable` en `public/_headers`.

**Conclusión:** el primer riesgo que debemos corregir no es añadir otra caché, sino distinguir claramente datos descriptivos guardados de datos comerciales confirmados. La caché local actual puede servir para pintar una vista previa, pero no debe ser la autoridad para disponibilidad, precio ni permiso de compra.

## 2. Principios obligatorios

1. Supabase y la validación del servidor siguen siendo la fuente de verdad para precio y stock.
2. Nunca se cachean cantidades de stock, disponibilidad de proveedor ni precios con TTL de borde.
3. Nunca se permite crear un pedido basándose únicamente en datos cacheados.
4. El camino sin conexión debe quedar claramente identificado como solicitud pendiente de confirmación, no como pedido registrado ni disponibilidad confirmada.
5. La caché pública solo contiene campos de presentación que no sean privados ni específicos de un usuario.
6. Las peticiones de checkout y cualquier operación autenticada o de escritura quedan fuera de la caché.
7. Mantener una ruta funcional sin Worker dinámico como alternativa si el beneficio medido no justifica complejidad o consumo de cuota.

## 3. Arquitectura propuesta por fases

### Fase A — seguridad de la caché local (primera prioridad)

- Añadir metadatos de frescura a la copia local: versión de esquema, fecha de última sincronización y estado de validación de la sesión actual.
- La copia local puede mostrar nombre, descripción, categoría e imágenes mientras se sincroniza.
- Hasta recibir una respuesta correcta de Supabase en la sesión actual, mostrar precio y disponibilidad como «Comprobando…» o «No verificados» y desactivar añadir al carrito para esos productos.
- Tras una respuesta correcta, reemplazar el estado comercial por precio/stock actuales, guardar la copia y habilitar las acciones permitidas.
- Si Supabase falla, conservar la vista descriptiva, marcar el catálogo como no verificado y ofrecer reintentar o consultar por WhatsApp. No presentar el stock guardado como real.
- Invalidar las copias antiguas incompatibles mediante una versión de esquema; no borrar el carrito ni otros datos de usuario.
- El servidor debe seguir comprobando precio, disponibilidad y cantidades al registrar cualquier pedido. Un error de red no debe convertirse en una confirmación de pedido.

**Aceptación:** una visita con caché antigua no muestra stock/precio como confirmados ni permite completar un pedido registrado hasta que el servidor valide los datos.

### Fase B — entrega rápida de metadatos públicos en Cloudflare (solo tras medir)

Si la primera fase sigue dejando lenta la primera visita, evaluar un endpoint público dedicado, por ejemplo `GET /api/catalog/content`, que entregue exclusivamente:

- ID y nombre del producto.
- Categoría, descripción e imágenes.
- Variantes y distintivos visuales.
- Campos de presentación necesarios, sin precio, stock, disponibilidad, coste, comisión, datos de proveedor ni información de clientes.

El endpoint consultaría el origen autorizado y podría aplicar un TTL corto (propuesta inicial: 60 segundos) a esos metadatos. Precio y stock seguirían llegando por una consulta fresca no cacheada. El checkout seguiría llamando al RPC actual directamente.

La configuración actual es de Static Assets sin handler propio. Para ejecutar un endpoint `/api/*` habría que añadir un Worker entrypoint y enrutar selectivamente esa ruta con `assets.run_worker_first`; no activar `run_worker_first: true` para todo el sitio.

**Condiciones antes de implementarlo:**

- Confirmar que la lectura pública respeta RLS y que la clave utilizada es solo la publishable/anon, nunca una service-role.
- Revisar CORS, límites, errores, timeout, tamaño de respuesta y comportamiento de caché.
- Verificar que las respuestas no incluyan campos internos o información de usuario.
- Medir hit/miss y latencia; incluir una forma segura de invalidar o dejar expirar los metadatos.
- No cachear respuestas con Authorization, cookies, sesiones ni datos privados.
- No cambiar rutas, configuración de producción ni desplegar sin autorización específica.

## 4. Coste y límites Cloudflare

La documentación oficial indica que los Static Assets se sirven sin coste por solicitud y que las solicitudes que ejecutan el Worker se contabilizan bajo los límites de Workers. El plan Free documenta 100.000 solicitudes Worker por día; si se excede, las invocaciones Worker pueden responder 429. Por eso, el endpoint dinámico debe limitarse a `/api/catalog/*`, nunca interceptar todas las rutas.

La Cache API tiene particularidades: `cache.match/put` son locales al centro de datos y no ofrecen por sí mismas una caché global compartida; además, `stale-while-revalidate` y `stale-if-error` no son compatibles con `cache.put/match`. No debemos diseñar la solución suponiendo una caché global instantánea ni invalidación global automática.

Referencias oficiales consultadas:
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/workers/cache/
- https://developers.cloudflare.com/workers/runtime-apis/cache/
- https://developers.cloudflare.com/workers/platform/limits/

No se ha verificado el plan ni el consumo actual de la cuenta Cloudflare; estos límites son la documentación pública del plan, no una lectura de la cuenta.

## 5. Matriz de pruebas obligatoria

| Escenario | Resultado esperado |
|---|---|
| Primera visita, sin caché | Contenido descriptivo visible; precio/stock se habilitan solo tras respuesta fresca |
| Caché antigua, Supabase responde | Vista se actualiza y solo entonces se habilita compra |
| Caché antigua, Supabase no responde | Estado no verificado; no se presenta stock/precio como actuales |
| Stock cambió a cero | La UI actualizada bloquea compra; RPC también rechaza |
| Stock aumentó | Se habilita solo tras lectura fresca |
| Precio cambió | Se muestra el precio del servidor; no se usa el guardado |
| Cache hit de metadatos | Solo campos descriptivos; no incluye inventario ni precios |
| Cache miss/origen lento | Timeout y recuperación comprensibles; no carga infinita |
| Checkout sin red | Nunca se afirma que el pedido quedó registrado o que hay stock confirmado |
| Pedidos concurrentes | La validación transaccional del servidor evita sobreventa |

Todas las pruebas deben usar fixtures sintéticos y mocks. No se crean pedidos reales ni se escriben datos en Supabase.

## 6. Decisión recomendada

1. Resolver primero la frescura de la caché local y la etiqueta de disponibilidad/precio.
2. Medir el tiempo hasta el primer contenido y hasta la disponibilidad validada.
3. Solo si la medición demuestra una mejora necesaria, implementar el endpoint de metadatos en Cloudflare con una ruta Worker-first limitada.
4. Mantener fuera de caché el precio, stock, disponibilidad de proveedor, sesiones y checkout.

Esta propuesta no autoriza cambios de esquema, escritura en Supabase, cambios de producción, despliegues, ni contratación de servicios.
