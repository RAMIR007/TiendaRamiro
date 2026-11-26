# Auditoría estática de Supabase — 17 de noviembre de 2026

## Alcance y límites

Revisión de lectura de los archivos SQL, el cliente web y las pruebas presentes en `main`. No se consultó el estado vivo de Supabase, no se ejecutó SQL y no se modificaron tablas, funciones, permisos, RLS ni datos. Los hallazgos siguientes describen el código versionado, no certifican que esas migraciones estén aplicadas en producción.

## Hallazgos

### P1 — La migración de disponibilidad sobrescribe la lógica de comisión fija

**Evidencia comprobada**

- `20261026120000_commission_amount.sql` amplía `product_costs` y `order_items` con `commission_type` y `commission_fixed_cents`. Su versión de `create_order(text, text, text, text, text, text, jsonb)` lee ambos campos, calcula la comisión como importe fijo o porcentaje y guarda una copia de esos valores en cada línea del pedido.
- La migración posterior `20261031120000_supplier_availability.sql` reemplaza esa misma firma de siete argumentos, pero solo lee `cost_cents`, `commission_percent` y `supplier`. Calcula siempre la comisión como porcentaje y no incluye `commission_type` ni `commission_fixed_cents` al insertar `order_items`.
- El cliente actual sí guarda una comisión fija: en `public/js/supabase.js`, `productToCostRow()` establece `commission_percent = 0` y almacena el importe en `commission_fixed_cents` cuando el tipo es `amount`.

**Impacto**

Para productos configurados con comisión fija, la versión más reciente de la RPC calcula la comisión como porcentaje de cero: el pedido nuevo puede registrar comisión cero y la línea pierde la instantánea del tipo e importe fijo. El precio y el total pagado por el cliente se calculan por separado y no son el problema detectado; el impacto está en las comisiones de vendedores y sus reportes/liquidaciones.

**Propuesta — requiere revisión y cambio explícito de la RPC en una migración futura**

1. En la versión vigente de la RPC de siete argumentos, volver a leer `commission_type`, `commission_percent` y `commission_fixed_cents`.
2. Calcular el importe unitario según el tipo configurado y multiplicarlo por la cantidad.
3. Guardar los tres campos de configuración junto con `commission_cents` en `order_items`, manteniendo la lógica de disponibilidad del proveedor y bloqueo de stock.
4. Añadir regresiones para comisión porcentual y fija, incluyendo varias líneas del mismo producto y el total consolidado del pedido.

No se aplicó ni se preparó una migración ejecutable en este PR.

### P2 — La firma antigua de cuatro argumentos sigue expuesta a clientes anónimos

**Evidencia comprobada**

La migración `20261031120000_supplier_availability.sql` conserva y concede `EXECUTE` a `anon` y `authenticated` para `create_order(text, text, text, jsonb)`. Esa versión acepta nombre, dirección, notas y artículos, pero no recibe ni valida teléfono, código de vendedor, método de entrega o comisión. La firma nueva de siete argumentos sí valida el teléfono y gestiona atribución y comisiones.

**Impacto**

Cualquier cliente que invoque directamente la firma antigua puede crear pedidos sin el teléfono obligatorio documentado para el flujo actual y sin atribución/comisión. La conservación puede responder a compatibilidad con clientes antiguos; no se ha comprobado qué versión está desplegada en cada cliente.

**Propuesta — cambio de permisos/RPC, no incluido**

Confirmar primero que no quedan clientes desplegados que dependan de la firma antigua. Después, en una migración revisada, retirar su ejecución a `anon` y `authenticated` o sustituirla por una ruta de compatibilidad que no permita eludir los requisitos actuales. Añadir una prueba que demuestre que la firma antigua no puede crear pedidos incompletos.

### Revisión de endurecimiento pendiente — `SECURITY DEFINER` y `search_path`

Las funciones de privilegios elevados revisadas usan `SET search_path = public`. Los objetos de aplicación observados están referenciados con esquema explícito en las funciones de pedido, pero no se dispone de una lectura de los privilegios efectivos del esquema `public` en la instancia activa. Por tanto, esto es una comprobación de endurecimiento pendiente, no una vulnerabilidad confirmada.

**Propuesta:** auditar en modo lectura los privilegios `CREATE` del esquema `public` para `PUBLIC`, `anon` y `authenticated`. Si un rol no confiable puede crear objetos allí, endurecer las funciones `SECURITY DEFINER` con un `search_path` que no incluya esquemas modificables y referencias totalmente cualificadas.

## RLS revisada en los archivos

- `products`: lectura pública solo de productos activos; personal aprobado puede actualizar; administración tiene política completa.
- `product_costs` y `product_locations`: políticas de administración.
- `orders`: administración puede leer; personal aprobado solo ve pedidos asociados a su `auth.uid()`.
- `order_items`: administración o personal asociado al pedido.
- `audit_logs`: personal aprobado puede leer e insertar; administración puede borrar. Conviene confirmar que la visibilidad de todos los registros de auditoría para cualquier usuario `staff` sea la política comercial deseada.

Esta lectura de archivos no sustituye una comprobación de políticas efectivas en la base activa.

## Verificaciones que faltan

- Confirmar qué migraciones están realmente aplicadas en Supabase.
- Consultar definiciones, firmas y ACL efectivas de las funciones activas.
- Verificar privilegios efectivos de `CREATE` en `public`.
- Confirmar que ningún cliente desplegado depende de la firma antigua de cuatro argumentos.
- Ejecutar pruebas SQL/RPC en un entorno de prueba, no sobre datos de producción.

## Referencias del repositorio

- [Migración de comisiones fijas](https://github.com/RAMIR007/TiendaRamiro/blob/main/supabase/migrations/20261026120000_commission_amount.sql)
- [Migración de disponibilidad de proveedor](https://github.com/RAMIR007/TiendaRamiro/blob/main/supabase/migrations/20261031120000_supplier_availability.sql)
- [Cliente Supabase y serialización de comisiones](https://github.com/RAMIR007/TiendaRamiro/blob/main/public/js/supabase.js)
- [Pruebas de integración y comprobaciones de migraciones](https://github.com/RAMIR007/TiendaRamiro/blob/main/tests/integration.test.js)

## Estado

Auditoría estática documentada. No se modificó ni ejecutó SQL, no se alteró la base de datos y no se cambiaron datos comerciales.
