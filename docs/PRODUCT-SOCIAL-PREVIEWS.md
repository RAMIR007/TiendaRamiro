# Vistas previas sociales de productos

## Flujo

- La tienda comparte `/share/<product-uuid>` en WhatsApp, Facebook, Telegram y el menú nativo.
- Cloudflare ejecuta el Worker solo para `/share/*`; el resto de los archivos estáticos sigue usando la entrega de Assets.
- El Worker consulta exclusivamente `id,name,description,images` de un producto activo mediante la clave publishable de Supabase.
- La página de vista previa incluye Open Graph y Twitter Card; los navegadores pasan automáticamente a `/?product=<uuid>`, que abre el modal del producto en la tienda.
- Si el producto no existe o está inactivo, la ruta responde 404. Si el catálogo no responde, responde 503 sin guardar el error en caché.

## Frescura y privacidad

- La respuesta puede permanecer en caché hasta 10 minutos en la caché de Cloudflare; el navegador recibe un máximo de 5 minutos.
- Solo se cachean metadatos descriptivos e imagen. No se solicitan ni publican precio, stock, variantes, proveedor, pedidos o datos de clientes.
- La caché es temporal: tras editar una imagen o descripción, una tarjeta social ya cacheada puede tardar hasta 10 minutos en actualizarse.
- No hay escrituras en Supabase, autenticación de usuarios, nuevos secretos ni servicios externos de pago.

## Coste y alcance

- Las rutas normales de archivos estáticos no ejecutan el Worker: `run_worker_first` está limitado a `/share/*`.
- Cada visita a una URL de vista previa puede consumir una invocación Worker; una caché local del centro de datos evita consultas repetidas a Supabase mientras siga vigente.
- El plan Workers Free publica un límite de 100.000 solicitudes por día y 10 ms de CPU por invocación. Debe monitorizarse el uso real antes de activar cualquier función adicional.
- No se incluye ninguna migración ni cambio de esquema.

## Pruebas

`npm test` incluye pruebas unitarias del Worker con Supabase simulado. Las pruebas de navegador comprueban los enlaces compartidos y el enlace profundo de la tienda, usando fixtures sintéticas y sin escrituras.
