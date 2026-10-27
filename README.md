# Tienda Ramiro — Catálogo y pedidos por WhatsApp

Sitio estático (HTML + CSS + JavaScript, **sin build y sin dependencias en producción**) para
mostrar un catálogo y cerrar pedidos por WhatsApp. Pensado para emprendimientos y MiPymes,
con foco en redes lentas y en el flujo de venta cubano: el cliente elige, deja sus datos y el
pedido se envía al WhatsApp del negocio.

---

## 1. Empezar

Abrir `public/index.html` directamente en el navegador, o servirlo en la LAN para probar desde el móvil:

```bash
npm run serve
```

La consola muestra la URL local y las URLs de red (`http://192.168.x.x:8080/`).
Abre la URL de LAN desde el teléfono conectado al mismo Wi-Fi.

**Panel de administración:** `public/admin.html`

El acceso usa **Supabase Auth** con correo y contraseña. Las cuentas se crean en
Supabase → **Authentication → Users** (sin invitación por correo: se crean con contraseña
temporal creada por el administrador y nacen `pending` hasta que se les asigna rol).
**No se usa SMTP para recuperar contraseñas:** si un empleado se la olvida, el administrador
restablece desde Supabase (ver [`docs/PASSWORD-RESET.md`](docs/PASSWORD-RESET.md)). Cada
usuario puede cambiar su propia contraseña desde el panel (**Mi cuenta**) estando logueado.
La puesta en marcha está en [`docs/SUPABASE-SETUP.md`](docs/SUPABASE-SETUP.md).

---

## 2. Configurar la tienda (un solo archivo)

Todo lo específico del cliente vive en **`public/js/config.js`**:

| Opción | Qué hace |
| --- | --- |
| `whatsappPhone` | Número que recibe los pedidos. Formato internacional sin `+`. Cuba: `5358382989`. |
| `brand.name` | Nombre de la tienda (encabezado y pie). |
| `brand.tagline` | Eslogan bajo el nombre. |
| `brand.studio` / `brand.studioWhatsApp` | Crédito y enlace del desarrollador en el pie. |
| `currency` / `locale` | Moneda y formato de números/fechas. |
| `categories` | Categorías del catálogo. Agregar una la hace aparecer en la tienda, el filtro y el panel. |
| `checkout.minNameLength` / `minAddressLength` | Validación mínima de nombre y dirección de entrega. |
| `checkout.minPhoneDigits` / `maxPhoneDigits` | Validación del teléfono (obligatorio; confirman los pedidos por llamada). |

Cambiar el número de WhatsApp **no requiere tocar ningún otro archivo**. Después de editar,
recarga con `Ctrl+F5` (o borra la caché) para ver los cambios.

La conexión a Supabase vive en **`public/js/supabase-config.js`** (URL del proyecto y clave
`publishable`). Esa clave es pública por diseño: la seguridad la dan las políticas RLS.

---

## 3. Cómo se cierra un pedido (Vale de pedido)

1. El cliente abre el catálogo, filtra y añade productos (el carrito se guarda en su navegador).
2. Al abrir el carrito llena el **Vale de pedido**: nombre completo, **teléfono (obligatorio)**,
   método de entrega (🛵 a domicilio por el mensajero / 🏬 recogida en tienda), dirección
   (solo si es domicilio), código de vendedor si lo tiene y una nota opcional.
3. Pulsa **Completar Pedido en WhatsApp**:
   - el servidor valida precio, stock, teléfono y dirección con `create_order()`,
   - se guarda el pedido en Supabase, se descuenta el inventario y se registra el vendedor
     responsable y sus comisiones en una transacción,
   - se abre WhatsApp con el **vale ya redactado** (Nº de pedido tipo `TR-AAMMDD-NNN`,
     productos, total, teléfono, entrega y vendedor).
4. La tienda llama al teléfono del cliente para confirmar disponibilidad y entrega, envía el
   mensajero (o prepara la recogida) y cobra **en efectivo al recibir la mercancía**.

> **Sin conexión:** si el pedido no se puede guardar, la tienda ofrece enviarlo igual por
> WhatsApp para no perder la venta y avisa que quedó sin registrar. Si la recogida ya fue
> confirmada, actualiza el estado en la pestaña **Pedidos** (pendiente → contactado → entregado).

### Precios con proveedores y comisiones

Los **administradores** gestionan los números de negocio de cada producto desde el panel:

| Campo | Para qué sirve |
| --- | --- |
| **Costo del proveedor** | Lo que pagas al proveedor local por unidad. Se guarda en `product_costs` (oculto para el público y para vendedores). |
| **Precio de venta** | Lo que ve el cliente y paga en efectivo. |
| **Comisión del vendedor (%)** | Porcentaje del precio de venta que gana quien vende (rondas entre 0 y 100%). |
| **Proveedor** | Nombre del proveedor local; alimenta un autocompletado en el formulario. |

El formulario muestra en vivo el **margen** (precio − costo) y la **comisión en $**.
En cada pedido se **congelan** costo, comisión, proveedor y precio por línea, para que
cambios posteriores no alteren ventas ya registradas.

### Vendedores y referidos

Todo usuario del panel (`admin` o `staff`) recibe automáticamente un **código de referido**
único (p. ej. `a1b2c3d4e5f6`) al crearse su perfil. Desde **Mi cuenta** copia su enlace
personal `${origin}/?ref=CODIGO` y su **comisión acumulada** de las ventas que le atribuyó
el sistema.

Cuando un cliente entra con ese enlace (o escribe el código a mano en el vale), el pedido
queda asociado a ese vendedor: la comisión de cada línea se calcula al precio de venta
vigente y se suma a su liquidación. **Admin y vendedores comparten el mismo sistema de
referidos**: un administrador que vende también gana comisión.

### Contraseñas y creación de usuarios (sin SMTP)

- **Crear cuenta:** Supabase → Authentication → Users → *Add user* con contraseña temporal
  (Auto Confirm). El perfil nace en `pending` con su código de referido; se le asigna rol
  `admin` o `staff` con SQL (ver "Crear un usuario" más abajo).
- **Restablecer contraseña de un empleado:** el administrador lo hace desde Supabase
  (Authentication → Users → … → *Send password recovery*, o actualizándola a mano), o el
  propio usuario la cambia desde **Mi cuenta** si aún tiene sesión.
- **No hay correos automáticos** para no depender de servicios de SMTP limitados desde Cuba.

---

## 4. Datos y copias de seguridad

El catálogo, los pedidos, los perfiles y la auditoría viven en **Supabase** (Postgres).
En el navegador solo quedan dos claves de caché:

| Clave | Contenido |
| --- | --- |
| `rx_store_products` | Última copia del catálogo (para pintar sin esperar a la red) |
| `rx_store_cart` | Carrito del visitante |
| `rx_sb_session` | Sesión del panel en `sessionStorage` (se borra al cerrar la pestaña) |

**Backup:** panel → *Exportar JSON* (catálogo) y *Pedidos → Exportar pedidos*.
**Restaurar:** panel → *Importar JSON* (agrega los productos del archivo al catálogo actual).

Para un respaldo completo de la base (incluidos pedidos y auditoría) usa el panel de Supabase
o `pg_dump` con la cadena de conexión del proyecto.

---

## 5. Límites de esta versión (importante)

- **Depende de Supabase.** El catálogo se cachea, pero el panel, el checkout y la sincronización
  necesitan conexión. Si el proyecto está pausado (plan gratuito inactivo ~1 semana), hay que
  reactivarlo desde el panel de Supabase.
- **Las cuentas se gestionan en Supabase.** Crear empleados, cambiar roles o recuperar contraseñas
  se hace en **Authentication → Users**; el panel solo permite cambiar la propia contraseña.
- **No hay pagos, envíos ni facturación.** El cierre es por WhatsApp.
- **Descripción de productos:** el panel admite hasta **3.000 caracteres** al crear o editar
  un producto (cinco veces el límite anterior).
- **El stock puede desincronizarse** si se vende por otro canal; ajústalo desde el panel.
- **Las imágenes de demo son locales** (`public/img/`, WebP de 800/400 px). Reemplázalas por
  fotos reales del negocio cuando las tengas.

### Roles y permisos

| Acción | `admin` | `staff` |
| --- | :---: | :---: |
| Ver catálogo y pedidos | ✅ | Solo los suyos (con enlace de referido) |
| Editar producto (precio, stock, nombre, fotos) | ✅ | ✅ |
| Ver costo / comisión / proveedor | ✅ | ❌ |
| Crear producto | ✅ | ❌ |
| Eliminar producto | ✅ | ❌ |
| Importar catálogo JSON | ✅ | ❌ |
| Exportar catálogo y pedidos | ✅ | ✅ |
| Cambiar estado de un pedido | ✅ | ❌ |
| Eliminar un pedido | ✅ | ❌ |
| Ver auditoría | ✅ | ✅ |
| Vaciar auditoría | ✅ | ❌ |
| Ver productos inactivos | ✅ | ❌ |
| Cambiar su propia contraseña | ✅ | ✅ |
| Crear usuarios / asignar roles | Supabase | ❌ |

`admin` y `staff` **no** se diferencian solo por los usuarios: el staff puede vender y ajustar
stock, pero no puede crear/borrar productos, gestionar pedidos ni vaciar la auditoría. La
creación de usuarios no está en el panel para ninguno de los dos: se hace en Supabase.

> RLS es seguridad **por fila**, no por columna: `staff` puede editar toda la ficha del producto.
> Si quieres limitarlo a precio y stock, se hace con un RPC o con permisos por columna.

#### Crear un usuario

1. **Authentication → Users → Add user → Create new user**.
2. Correo, contraseña y **Auto Confirm User**.
3. Asignar el rol en `profiles` (SQL Editor o Table Editor):

```sql
insert into public.profiles (id, name, role)
select id, split_part(email, '@', 1), 'staff'
from auth.users
where email = 'empleado@tudominio.com'
on conflict (id) do update set role = 'staff';
```

4. El empleado entra en `/admin` con ese correo. Los cambios de rol se aplican al recargar o
   volver a iniciar sesión.

---

## 6. Recomendaciones para Cuba

- **Número:** configura `whatsappPhone` con `53` + número, sin `+`, espacios ni guiones.
  Verifica que la cuenta sea WhatsApp Business y que pueda recibir mensajes de números nuevos.
- **Prueba el enlace en el móvil**, no solo en la computadora: abre la tienda desde Chrome,
  desde el navegador interno de Instagram/Facebook y desde el de WhatsApp. El código usa un
  enlace real (`<a>`) en lugar de `window.open` justamente para esos navegadores.
- **Datos móviles:** las imágenes son WebP locales de 800 y 400 px, con `srcset` y
  `loading="lazy"`. El teléfono descarga la versión de 400 px en las tarjetas y la de 800 px
  solo al abrir el detalle.
- **Compartir el catálogo:** publica el sitio (Netlify, GitHub Pages, hosting estático) y comparte
  el enlace o un QR por WhatsApp/Telegram. El pedido siempre llega al chat del negocio.
- **Backup semanal:** exporta el catálogo y los pedidos a un archivo y guárdalo fuera del teléfono.

---

## 7. Despliegue

Es un sitio estático: no hay compilación ni variables de entorno. Los archivos publicables
viven en **`public/`**; el resto (`tests/`, `scripts/`, `docs/`, `package.json`) es tooling y
no se publica.

1. `public/` contiene `index.html`, `admin.html`, `css/`, `js/`, `_headers` y `robots.txt`.
2. `wrangler.jsonc` declara `assets.directory: "./public"`.
3. `public/admin.html` incluye `noindex, nofollow`; `robots.txt` y `_headers` lo refuerzan.
4. Recomendado: HTTPS. Es obligatorio para que el navegador envíe las peticiones a Supabase sin
   advertencias de contenido mixto.
5. Si actualizas `public/js/config.js`, fuerza recarga en los dispositivos que ya visitaron la tienda.

### Cloudflare Workers (producción actual)

El sitio se despliega como **Worker con static assets**, no como Pages.

| Ajuste | Valor |
| --- | --- |
| Worker name | `tiendaramiro` |
| Build command | `npm run build` (opcional, solo valida que existan los archivos) |
| Deploy command | `npx wrangler deploy` |
| Assets directory | `public` (lo define `wrangler.jsonc`) |
| Production branch | `main` |

Con el repo conectado, cada `git push` a `main` dispara el build y el deploy.

**Por qué falló el build anterior:** sin `wrangler.jsonc`, Wrangler tomaba la raíz del repo
(`assets.directory: "."`), leía 3.611 archivos e intentaba subir
`node_modules/workerd/bin/workerd` (134 MiB), por encima del límite de 25 MiB por archivo.
Ahora el deploy solo mira `public/`, así que `node_modules`, tests y documentación quedan fuera.

Nota: Cloudflare ejecuta `bun install` porque hay `package.json`; instala `jsdom` (devDependency)
en el entorno de build, pero **no se publica** porque está fuera de `public/`.

Archivos incluidos para producción:

- `public/_headers`: cabeceras de seguridad y `noindex` para el panel.
- `public/robots.txt`: bloquea `/admin.html` en buscadores.

Si en el dashboard aparece un campo de *output directory*, ponlo en `public` (o déjalo vacío:
manda `wrangler.jsonc`).

### Proteger el panel

El panel ya no guarda credenciales en el código: el login lo valida **Supabase Auth** y las
políticas RLS limitan qué puede leer y escribir cada rol. Aun así, conviene:

1. **Cloudflare Access** (Zero Trust): política sobre `/admin` y `/admin.html` para que solo pase
   el correo del dueño. El plan gratuito cubre hasta 50 usuarios. Es una capa extra, no un
   sustituto del login. Guía: [`docs/CLOUDFLARE-ACCESS.md`](docs/CLOUDFLARE-ACCESS.md).
2. **Registro público cerrado** en Supabase (Authentication → Providers → Email). Ya está
   documentado en la guía.
3. **Cerrar sesión** en equipos compartidos: la sesión vive en `sessionStorage` y se borra al
   cerrar la pestaña.

### Supabase

El proyecto ya está integrado. El análisis de rendimiento y límites está en
[`docs/SUPABASE.md`](docs/SUPABASE.md); la puesta en marcha y el esquema, en
[`docs/SUPABASE-SETUP.md`](docs/SUPABASE-SETUP.md) y
[`supabase/migrations/20261024120000_init.sql`](supabase/migrations/20261024120000_init.sql).

Opciones gratuitas de hosting: Cloudflare Workers, Netlify, GitHub Pages.

---

## 8. Pruebas

```bash
npm install        # solo para desarrollo (jsdom)
npm test           # utilidades + integración
```

- `tests/utils.test.js`: escape de HTML, dinero en centavos, almacenamiento tolerante a fallos,
  normalización de productos y caché del catálogo.
- `tests/integration.test.js`: carga `public/index.html`, `public/admin.html` y
  `public/reset-password.html` en jsdom con un **Supabase simulado** (fetch interceptado).
  Cubre catálogo, stock, checkout RPC con vale (teléfono, entrega y vendedor), XSS, login,
  usuario pendiente, roles, CRUD con costos y comisiones, pedidos, auditoría y cambio de contraseña.

Estado actual: **18 + 26 comprobaciones en verde**.

---

## 9. Estructura

```
public/index.html         Tienda (archivo publicable)
public/admin.html         Panel de administración (archivo publicable)
public/reset-password.html  Restablecer contraseña desde el correo
public/css/store.css      Estilos de la tienda (tokens y componentes compartidos)
public/css/admin.css      Estilos del panel y del login
public/img/               Imágenes WebP locales (800 y 400 px)
public/js/config.js       Configuración del cliente (editar solo esto)
public/js/supabase-config.js  URL y clave publishable de Supabase
public/js/supabase.js     Cliente Auth + REST y acceso a datos
public/js/utils.js        Escape HTML, storage seguro, dinero, foco, toasts
public/js/data.js         Normalización de productos y caché del catálogo
public/js/cart.js         Carrito, stock, checkout y WhatsApp
public/js/store.js        Catálogo, filtros, búsqueda y modal
public/js/admin.js        Login, roles, CRUD de catálogo, pedidos y auditoría
public/js/reset-password.js  Formulario de nueva contraseña
public/_headers           Cabeceras de Cloudflare (incluye caché de /img)
public/robots.txt         Bloqueo de /admin en buscadores
wrangler.jsonc            Configuración del Worker (assets: ./public)
scripts/serve.js          Servidor estático para probar en la LAN
scripts/build.js          Verificación previa al deploy
supabase/migrations/      Esquema SQL, RLS y función create_order()
supabase/seed.sql         Productos de demostración (solo base nueva)
tests/                    Pruebas con Node + jsdom
docs/SUPABASE.md          Análisis de la migración a Supabase
docs/SUPABASE-SETUP.md    Guía de puesta en marcha
docs/PASSWORD-RESET.md    Configurar recuperación de contraseña
docs/SMTP.md              Configurar SMTP (Gmail, SMTP2GO, Brevo)
docs/CLOUDFLARE-ACCESS.md Proteger /admin con Cloudflare Access
```

---

## 10. Próximos pasos sugeridos

1. **Cloudflare Access** sobre `/admin` (ver [`docs/CLOUDFLARE-ACCESS.md`](docs/CLOUDFLARE-ACCESS.md)).
2. **Reemplazar las fotos de demo** por fotos reales del negocio en `public/img/products/`.
3. **Costo de envío** por municipio y total desglosado.
4. **Filtros y paginación** de pedidos por fecha/estado (hoy se listan los últimos 100).
5. **Protección anti-spam** en `create_order()`: Cloudflare Turnstile o límite por IP.
6. **WhatsApp Cloud API** en una Edge Function para enviar la confirmación automática.
7. **Tests E2E** con Playwright sobre el navegador real (jsdom no valida layout ni CSS).

---

## 11. Cambios de esta revisión

- **Vale de pedido:** el checkout captura teléfono obligatorio, método de entrega
  (domicilio/recogida), dirección, código de vendedor y pago en efectivo al recibir.
  El WhatsApp incluye el Nº de vale (`TR-AAMMDD-NNN`); `create_order()` exige teléfono.
- **Negocio:** costos de proveedor, precio de venta y comisión del vendedor configurable
  como **% del precio o $ fijo por unidad**, con vista previa de margen en el panel y
  comisiones congeladas por línea en cada pedido.
- **Referidos:** todo usuario del panel tiene código y enlace `?ref=` propio; el vale
  atribuye la venta y "Mi cuenta" muestra la comisión acumulada.
- **Reportes (admin):** pestaña 📊 con KPIs (facturación, pedidos, artículos, comisiones,
  ticket promedio), gráfico de ventas por día, ranking por vendedor y productos más vendidos,
  filtrable a 7/30 días o todo el historial.
- **Compartir producto:** botón de WhatsApp en cada tarjeta y en el modal para mandarle
  el producto (nombre, precio y enlace) directamente a un cliente.
- **Imagen comercial:** marca y textos reales (Tienda Ramiro), hero orientado al cliente
  (entrega por mensajero, pago en efectivo).
- **Sin SMTP:** se retiró la recuperación de contraseña por correo del login; los
  restablecimientos se hacen desde Supabase o desde "Mi cuenta".
- **Backend:** migración a Supabase. Catálogo, pedidos, perfiles y auditoría en Postgres con RLS.
  `create_order()` valida precio/stock y descuenta inventario en una transacción.
- **Autenticación:** Supabase Auth con correo y contraseña. Se eliminaron los usuarios locales,
  los hashes SHA-256, `sessionStorage` casero y las credenciales demo del código.
- **Roles:** `admin`/`staff` desde la tabla `profiles`; las cuentas nuevas nacen `pending` y no
  ven nada hasta que un administrador las aprueba. RLS aplica los permisos en el servidor.
- **Pedidos:** visibles desde cualquier dispositivo, con estado (pendiente/contactado/entregado/
  cancelado), exportación y eliminación.
- **Seguridad:** todo el HTML dinámico se escapa, sin `onclick` inline, URLs de imagen validadas
  y `JSON.parse` protegido. La clave `publishable` es pública; la `service_role` no se usa.
- **Carrito:** valida stock real, no permite superarlo, revalida al cerrar el pedido y contempla
  el envío por WhatsApp si no hay conexión.
- **Dinero:** cálculo en centavos enteros y formato con `Intl`.
- **Accesibilidad:** catálogo navegable por teclado, diálogos con foco atrapado, `aria-live`,
  contraste AA y `prefers-reduced-motion`.
- **Rendimiento/SEO:** caché del catálogo, `srcset`, favicon, Open Graph, `noscript`.
- **Mantenimiento:** configuración centralizada, pruebas automatizadas, guía de Supabase y README.
