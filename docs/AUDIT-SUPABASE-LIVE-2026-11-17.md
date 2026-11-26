# Plan de corrección — RPC de pedidos y seguridad

## Hallazgos confirmados en Supabase activo (2026-11-17)

- La migración `20261031120000_supplier_availability` está aplicada.
- La RPC activa de siete argumentos omite `commission_type` y `commission_fixed_cents`: en consecuencia, las seis filas de producto actualmente configuradas con comisión fija pueden generar nuevas líneas con comisión cero. No se han encontrado pedidos existentes (conteo consultado: 0).
- La RPC antigua de cuatro argumentos está activa y tiene EXECUTE para `anon` y `authenticated`. Permite omitir teléfono, método de entrega y atribución del vendedor.
- `handle_new_user()` también es SECURITY DEFINER y tiene EXECUTE para anon/authenticated, pero está conectada al trigger `on_auth_user_created` de auth.users. No se ha demostrado una ruta práctica de invocación directa que permita crear perfiles arbitrarios; revisar/restringir su ACL sigue siendo recomendable.
- `is_admin()` e `is_staff()` son SECURITY DEFINER de lectura que evalúan auth.uid(); su exposición no equivale por sí misma a una escalada de privilegios.
- `anon` y `authenticated` no tienen CREATE en el esquema public. Por tanto, search_path=public no es aquí una prueba de escalada por objetos creados por esos roles.
- La función trigger `set_updated_at()` carece de search_path fijo (aviso de linter).
- El linter identifica índices ausentes en FK, initplans de RLS y políticas permissive solapadas; son oportunidades de rendimiento/revisión, no vulnerabilidades demostradas.

## Corrección propuesta

El archivo `20261117120000_fix_order_commissions_and_legacy_rpc.sql` restituye el cálculo de comisión fija/porcentual en la función actual, conserva validaciones de stock de proveedor, precios desde servidor y snapshot de los campos de comisión, y revoca EXECUTE de la firma antigua de cuatro argumentos.

## Límites

El SQL de corrección se incluye como propuesta para revisión en GitHub. No se ha ejecutado en Supabase, no se han alterado tablas, funciones, permisos ni registros reales.

## Pendiente de verificación en entorno de pruebas

- Probar cálculo fijo y porcentual, varias cantidades y acumulación de comisión.
- Probar que la firma antigua deja de ser invocable por anon/authenticated tras aplicar la migración.
- Probar disponibilidad de proveedor, stock local, variantes, teléfono y recogida.
- Revisar el ciclo real de Auth para confirmar que el trigger crea perfiles correctamente si se ajusta la ACL de handle_new_user().
