# Revisión de seguridad, cuentas de cliente y extracción pública — 24 de noviembre de 2026

## Checkout de invitados y cuenta de cliente

- El cliente puede completar la compra como invitado; no necesita iniciar sesión ni crear una cuenta.
- El checkout permite introducir un correo opcional y lo envía como `p_client_email` a la RPC de ocho argumentos. El correo se guarda en `orders.customer_email`, pero **no demuestra identidad** ni inicia una sesión.
- No existe una casilla de alta de cuenta dentro del checkout ni se envían enlaces mágicos de acceso por correo.
- Después de comprar, el cliente puede abrir «Mi cuenta» e iniciar sesión con **Google OAuth**, usando exactamente el mismo correo que indicó en el pedido.
- El frontend de cuenta solo permite Google. Facebook, registro de clientes con contraseña y acceso por enlace de correo están aplazados.
- Tras el retorno OAuth, `claim_my_orders()` exige un usuario autenticado con correo confirmado y vincula solo pedidos no reclamados que coincidan con ese correo.
- La cuenta muestra los pedidos asociados a su propio `customer_id`. RLS limita la lectura de pedidos y líneas a su propietario; administradores y vendedores conservan sus políticas existentes.
- Google OAuth todavía requiere configuración externa en Supabase Auth y Google Cloud. No se considera operativo hasta completar esa configuración y probar el callback en Preview. El flujo Google no necesita SMTP.

## Migraciones aplicadas en Supabase

Proyecto: `RamiroTienda` (`zpttucawhdmhgqeuzaup`).

### `20261124110711_security_min_privilege`

- Revoca los permisos amplios actuales de `anon` y `authenticated` sobre las ocho tablas públicas y las secuencias.
- `anon` conserva lectura únicamente de productos/categorías y la RPC pública de checkout de siete argumentos.
- La firma antigua de cuatro argumentos queda sin ejecución pública.
- El panel conserva los permisos de tabla necesarios, siempre sujetos a RLS.
- Las funciones sensibles usan `search_path = pg_catalog`; `is_admin()` e `is_staff()` califican explícitamente `auth.uid()`.
- Las funciones de trigger dejan de estar expuestas como RPC.
- Se restringieron las ACL por defecto de objetos creados por el rol `postgres`.
- No fue posible modificar las ACL por defecto de `supabase_admin`: la sesión de migración no tiene membresía para cambiar los defaults de ese rol. Los grants de los objetos existentes sí fueron revocados. Los objetos futuros creados por `supabase_admin` requieren una revisión/ajuste separado ejecutado con ese rol.

### `20261124110804_customer_accounts`

- Añade `orders.customer_email` y `orders.customer_id`, sin modificar pedidos existentes.
- Añade una RPC de ocho argumentos que delega en la RPC actual de siete argumentos y guarda el correo opcional. No replica ni modifica la lógica de inventario ni las comisiones.
- Añade `claim_my_orders()`, que solo permite reclamar pedidos después de que Auth confirme el correo del usuario autenticado.
- Añade políticas RLS de solo lectura para que cada cliente consulte únicamente sus pedidos y líneas.
- Las dos migraciones aparecen registradas en el historial de Supabase y se verificaron columnas, funciones, privilegios y políticas.

### `20261124111358_private_security_functions`

- Crea el esquema no expuesto `private`.
- Mueve allí las funciones `SECURITY DEFINER` de checkout, reclamación de pedidos y comprobación de roles.
- Mantiene las rutas públicas `create_order` y `claim_my_orders` como wrappers `SECURITY INVOKER`.
- Actualiza las políticas RLS para usar `private.is_admin()` y `private.is_staff()`.
- Se verificó que las funciones privilegiadas ya no están en el esquema público y que el asesor de Supabase dejó de reportarlas.

### `20261124111630_customer_profile_contact`

- Añade `profiles.phone` y `profiles.address`.
- Cuando el cliente verifica su correo y reclama pedidos, copia al perfil el teléfono y la dirección de su compra más reciente vinculada.
- La operación ocurre dentro de `private.claim_my_orders()`; no confía en metadata editable para autorizar la vinculación.
- La página de cuenta muestra los datos de contacto guardados.

## Hallazgos y avisos de seguridad restantes

- Supabase Advisors ya no reporta funciones `SECURITY DEFINER` expuestas en `public`. El único aviso actual es la protección de contraseñas filtradas desactivada.
- La RPC pública de checkout sigue aceptando pedidos de invitados por diseño; requiere protección antiabuso/rate limiting antes de campañas de alto tráfico.
- La protección de contraseñas filtradas sigue desactivada en Supabase Auth. Debe activarse desde Authentication → Security and Protection.
- La configuración externa de Google OAuth y sus URLs de retorno autorizadas está pendiente; no se afirma que el proveedor esté activo.
- No se han creado pedidos reales para probar la vinculación. Las pruebas de checkout/cuenta se hacen con Supabase simulado.

## Extracción pública del catálogo

El build consulta los campos públicos de productos/categorías y genera:
- Tarjetas de producto y categorías dentro del HTML inicial.
- JSON-LD `ItemList`.
- `public/catalog.json` como feed público.
- Datos prerenderizados para hidratar la tienda y sincronizar luego con Supabase.

El build falla si no puede obtener productos/categorías activos, para evitar publicar una página con catálogo vacío.

## Validación automatizada

- GitHub Actions run #73: pruebas y build correctos; 47 comprobaciones, 0 fallos.
- El build generó 8 productos y 9 categorías prerenderizados.
- Las pruebas de cuenta usan Supabase simulado; no se enviaron correos reales ni se crearon pedidos reales.

## Despliegue y límites

- PR #5 permanece abierta y en borrador.
- No se ha fusionado la PR ni desplegado a producción.
- El preview de Cloudflare que se comprobó anteriormente todavía servía una versión anterior; el despliegue de los últimos cambios no está confirmado.
- Google OAuth y la URL de retorno deben revisarse antes de anunciar el acceso de clientes.
- No se han cambiado productos, precios, pedidos existentes, inventario ni lógica de comisiones.

## Bloqueo P1 confirmado en la base viva — 24 de noviembre de 2026

Esta sección se basa en consultas `SELECT` de solo lectura al proyecto Supabase activo. No se ejecutaron migraciones ni operaciones de escritura durante esta revisión.

- El historial vivo registra las cuatro migraciones `20261124110711`, `20261124110804`, `20261124111358` y `20261124111630`.
- El historial **no** registra `20261117120000_fix_order_commissions_and_legacy_rpc`.
- La definición activa de `private.create_order(..., p_items jsonb)` consulta `commission_percent`, pero no lee `commission_type` ni `commission_fixed_cents`; tampoco guarda esos campos en `order_items`.
- La función activa de ocho argumentos delega en esa función de siete argumentos. El cliente de checkout envía siempre `p_client_email` (como texto o `null`), por lo que el recorrido actual usa la firma de ocho argumentos.
- Una consulta agregada encontró **6 productos activos con comisión fija positiva** y **0 productos activos con comisión porcentual positiva**. La función activa no aplica esas seis comisiones fijas; para esos productos la comisión registrada puede quedar en cero.

**Conclusión:** el hito A de integridad de comisiones sigue bloqueado. El checkout sí calcula el precio del producto y valida stock/variantes desde el servidor, pero la comisión fija no está aplicada en la RPC activa.

### Riesgo de orden de migraciones

El archivo `20261117120000_fix_order_commissions_and_legacy_rpc.sql` de esta rama, tal como está escrito, reemplaza `public.create_order` de siete argumentos por una función `SECURITY DEFINER` con `search_path = public`. El estado vivo actual, después de `20261124111358_private_security_functions`, usa una función pública `SECURITY INVOKER` que delega en `private.create_order`.

Aplicar ese archivo después del estado actual sobrescribiría el wrapper público con una implementación privilegiada en `public`, deshaciendo parte del aislamiento de seguridad. Además, no actualiza la función privada de siete argumentos que usa la RPC actual de ocho argumentos. **No aplicar ese archivo tal como está.**

Una futura propuesta debe ser una migración nueva y posterior al último número aplicado, actualizar directamente la implementación privada de siete argumentos para calcular y guardar comisión fija/porcentual, y conservar los wrappers públicos `SECURITY INVOKER`, sus permisos y las políticas RLS. Este orquestador no puede ejecutar ni aplicar esa migración.

### Riesgo residual de privilegios por defecto

La consulta de ACL confirmó que los privilegios actuales de tablas públicas están restringidos para `anon`, y que la firma antigua de cuatro argumentos no es ejecutable por `anon` ni `authenticated`. Sin embargo, los privilegios por defecto de objetos futuros creados por `supabase_admin` en `public` todavía incluyen permisos para `anon` y `authenticated`. Los objetos existentes no muestran esos grants amplios; el riesgo afecta a futuros objetos creados con ese rol y requiere una revisión separada con el rol propietario adecuado.

No se modificó ningún permiso, función, tabla, producto, precio, pedido, usuario ni inventario durante esta auditoría.
