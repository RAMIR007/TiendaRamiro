# Revisión de seguridad, cuentas de cliente y extracción pública — 24 de noviembre de 2026

## Checkout de invitados y cuenta de cliente

- El cliente puede comprar sin iniciar sesión ni crear una cuenta.
- El formulario permite indicar correo electrónico y ofrece una casilla opcional para solicitar la creación de cuenta.
- El correo se guarda en `orders.customer_email`; no se usa como prueba de identidad.
- Si el comprador marca la casilla, Supabase Auth envía un enlace de acceso sin contraseña. La cuenta se activa al verificar el enlace.
- Después de iniciar sesión con un correo verificado, `claim_my_orders()` vincula los pedidos no reclamados que coincidan con ese correo verificado.
- La cuenta de cliente muestra el historial asociado a su propio `customer_id`. RLS limita la lectura de pedidos y líneas a su propietario; administradores y vendedores conservan sus políticas existentes.
- Google y Facebook aparecen como métodos alternativos en `account.html`. Para que funcionen, hay que habilitar cada proveedor en Supabase Auth, registrar sus credenciales OAuth y añadir la URL de retorno del dominio desplegado. Esto no se puede completar con las herramientas de base de datos disponibles aquí.
- No se crea una cuenta si el comprador no marca la casilla. El checkout sigue siendo independiente de Auth.

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

## Hallazgos y avisos de seguridad restantes

- Supabase Advisors ya no reporta funciones `SECURITY DEFINER` expuestas en `public`. El único aviso actual es la protección de contraseñas filtradas desactivada.
- La RPC pública de checkout sigue aceptando pedidos de invitados por diseño; requiere protección antiabuso/rate limiting antes de campañas de alto tráfico.
- La protección de contraseñas filtradas sigue desactivada en Supabase Auth. Debe activarse desde Authentication → Security and Protection.
- Google/Facebook requieren configuración OAuth externa y URLs de retorno autorizadas. La interfaz está preparada, pero no se afirma que los proveedores estén activos.
- No se han creado pedidos reales para probar la vinculación. Las pruebas de checkout/cuenta se hacen con Supabase simulado.

## Extracción pública del catálogo

El build consulta los campos públicos de productos/categorías y genera:
- Tarjetas de producto y categorías dentro del HTML inicial.
- JSON-LD `ItemList`.
- `public/catalog.json` como feed público.
- Datos prerenderizados para hidratar la tienda y sincronizar luego con Supabase.

El build falla si no puede obtener productos/categorías activos, para evitar publicar una página con catálogo vacío.

## Validación automatizada

- GitHub Actions run #56: pruebas y build correctos; 47 comprobaciones, 0 fallos.
- El build generó 8 productos y 9 categorías prerenderizados.
- Las pruebas de cuenta usan Supabase simulado; no se enviaron correos reales ni se crearon pedidos reales.

## Despliegue y límites

- PR #5 permanece abierta y en borrador.
- No se ha fusionado la PR ni desplegado a producción.
- El preview de Cloudflare que se comprobó anteriormente todavía servía una versión anterior; el despliegue de los últimos cambios no está confirmado.
- Los proveedores OAuth, el SMTP de Auth y la URL de retorno deben revisarse antes de anunciar el registro a clientes.
- No se han cambiado productos, precios, pedidos existentes, inventario ni lógica de comisiones.
