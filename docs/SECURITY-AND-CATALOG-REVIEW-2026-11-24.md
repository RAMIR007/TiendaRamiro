# Revisión de seguridad y extracción pública — 24 de noviembre de 2026

## Modelo de compra de invitado

- El cliente no necesita iniciar sesión ni crear una cuenta de Auth antes de comprar.
- El formulario recoge nombre, teléfono y datos de entrega.
- La RPC pública create_order (firma de siete argumentos) valida los datos y crea el pedido y sus líneas desde el servidor.
- El pedido conserva los datos de contacto del cliente en public.orders; esto constituye el registro comercial del cliente y del pedido.
- No se crea una cuenta de inicio de sesión ni se asigna un perfil de personal. Para crear una cuenta de cliente con acceso futuro haría falta añadir correo/identidad verificada y un flujo de autenticación separado.

## Hallazgos confirmados en Supabase

- RLS está habilitado en las ocho tablas del esquema public.
- anon y authenticated tenían permisos amplios de tabla y secuencia, incluidos perfiles, pedidos, líneas, auditoría y costes. Las políticas RLS restringían filas, pero los grants no aplicaban mínimo privilegio.
- Las ACL por defecto de postgres y supabase_admin también concedían privilegios amplios a anon y authenticated para futuras tablas, secuencias y funciones.
- Cinco funciones SECURITY DEFINER eran ejecutables desde el rol anónimo/autenticado: las dos firmas de create_order, handle_new_user, is_admin e is_staff.
- set_updated_at() no tenía search_path fijo.
- El bucket product-images es público para lectura (necesario para imágenes del catálogo), limita cargas a WebP/JPEG/PNG y 8 MB, y sus políticas de escritura están restringidas a administradores.
- Supabase Advisors informa que la protección de contraseñas filtradas está desactivada.

## Corrección propuesta en la migración

La migración 20261124120000_security_min_privilege.sql:

- Revoca permisos amplios existentes y futuros para anon y authenticated.
- Concede a anon únicamente lectura de products/categories y ejecución de la RPC de pedidos de siete argumentos.
- Mantiene para authenticated los permisos mínimos usados por el panel, siempre sujetos a RLS.
- Retira la ejecución pública de la firma antigua de cuatro argumentos y de las funciones de trigger.
- Restringe is_admin()/is_staff() a sesiones autenticadas.
- Fija search_path a pg_catalog en las funciones sensibles.

La única función SECURITY DEFINER que seguirá siendo ejecutable por anon es create_order de siete argumentos. Es intencional para el checkout de invitados; no concede escritura directa sobre tablas.

## Extracción pública del catálogo

La API REST pública de Supabase sí devuelve los productos y categorías activos. El problema observado está en el HTML inicial: el contenedor del catálogo está vacío y los productos aparecen solo después de ejecutar JavaScript. Los extractores que leen HTML sin ejecutar scripts solo ven «Cargando catálogo…».

El build ahora consulta los campos públicos de productos/categorías y genera:

- Tarjetas de producto dentro del HTML inicial.
- Botones/categorías iniciales.
- JSON-LD ItemList para motores de búsqueda.
- public/catalog.json como feed público.
- Datos prerenderizados que la tienda usa para pintar el catálogo inmediatamente y luego sincronizarlo con Supabase.

El build falla si no puede obtener productos/categorías activos, para evitar publicar una página con un catálogo vacío.

## Límites pendientes

- La migración SQL está en GitHub para revisión; no se ha ejecutado en la base de datos real.
- La protección de contraseñas filtradas es un ajuste de Supabase Auth y no se puede cambiar con las herramientas de base de datos disponibles en este flujo. Activarla en Authentication → Security and Protection.
- La RPC pública de pedidos puede recibir tráfico automatizado; antes de una campaña de alto tráfico conviene añadir Turnstile o rate limiting en el borde. No se ha añadido un servicio externo ni secretos nuevos.
- No se han creado pedidos de prueba en producción, cambiado productos, ni desplegado a producción.
