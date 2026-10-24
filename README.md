# Tienda Ramiro — Catálogo y pedidos por WhatsApp

Sitio estático (HTML + CSS + JavaScript, **sin build y sin dependencias en producción**) para
mostrar un catálogo y cerrar pedidos por WhatsApp. Pensado para emprendimientos y MiPymes,
con foco en redes lentas y en el flujo de venta cubano: el cliente elige, deja sus datos y el
pedido se envía al WhatsApp del negocio.

---

## 1. Empezar

Abrir `index.html` directamente en el navegador, o servirlo en la LAN para probar desde el móvil:

```bash
node scripts/serve.js
```

La consola muestra la URL local y las URLs de red (`http://192.168.x.x:8080/`).
Abre la URL de LAN desde el teléfono conectado al mismo Wi-Fi.

**Panel de administración:** `admin.html`

| Usuario | Contraseña | Rol |
| --- | --- | --- |
| `admin` | `admin123` | Acceso total (catálogo, usuarios, pedidos, auditoría) |
| `ventas` | `ventas123` | Catálogo y stock (sin borrar productos ni gestionar usuarios) |

Las credenciales demo se muestran en el login solo mientras `demoMode` sea `true`
en `js/config.js`. **Antes de entregar a un cliente real, cambia las contraseñas y pon
`demoMode: false`.**

---

## 2. Configurar la tienda (un solo archivo)

Todo lo específico del cliente vive en **`js/config.js`**:

| Opción | Qué hace |
| --- | --- |
| `whatsappPhone` | Número que recibe los pedidos. Formato internacional sin `+`. Cuba: `5358382989`. |
| `brand.name` | Nombre de la tienda (encabezado y pie). |
| `brand.tagline` | Eslogan bajo el nombre. |
| `brand.studio` / `brand.studioWhatsApp` | Crédito y enlace del desarrollador en el pie. |
| `currency` / `locale` | Moneda y formato de números/fechas. |
| `categories` | Categorías del catálogo. Agregar una la hace aparecer en la tienda, el filtro y el panel. |
| `checkout.minNameLength` / `minAddressLength` | Validación mínima de los datos de entrega. |
| `demoMode` | Muestra u oculta las credenciales de demostración. |

Cambiar el número de WhatsApp **no requiere tocar ningún otro archivo**. Después de editar,
recarga con `Ctrl+F5` (o borra la caché) para ver los cambios.

---

## 3. Cómo se cierra un pedido

1. El cliente abre el catálogo, filtra y añade productos (el carrito se guarda en su navegador).
2. Completa nombre, municipio/dirección y una nota opcional.
3. Pulsa **Completar Pedido en WhatsApp**:
   - se valida el stock contra el catálogo actual,
   - se registra el pedido en el historial local,
   - se descuenta el stock,
   - se abre WhatsApp con el mensaje ya redactado (productos, cantidades, variantes, total y datos del cliente).
4. El dueño confirma por WhatsApp y coordina pago/entrega.

> **Ojo:** el pedido se registra al pulsar el botón, aunque el cliente no llegue a enviar el
> mensaje de WhatsApp. Revisa la pestaña **Pedidos** y ajusta el stock si un pedido quedó sin
> confirmar. Es el precio de no tener backend.

---

## 4. Datos y copias de seguridad

Los datos viven en `localStorage` del navegador:

| Clave | Contenido |
| --- | --- |
| `rx_store_products` | Catálogo |
| `rx_store_cart` | Carrito del visitante |
| `rx_store_orders` | Pedidos registrados |
| `rx_store_audit_logs` | Auditoría (máximo 150 eventos) |
| `rx_store_admin_users` | Usuarios y hashes SHA-256 |
| `rx_store_admin_user` | Sesión (en `sessionStorage`, se borra al cerrar pestaña) |

**Backup:** panel → *Exportar JSON* (catálogo) y *Pedidos → Exportar pedidos*.
**Restaurar:** panel → *Importar JSON* (reemplaza el catálogo; valida el archivo y descarta imágenes no seguras).

Haz una copia antes de *Restablecer* o de limpiar la auditoría: esas acciones no se pueden deshacer.

---

## 5. Límites de esta versión (importante)

- **Los datos son del navegador, no del servidor.** El panel del dueño solo muestra los pedidos
  hechos *en ese mismo navegador*. Un cliente que compra desde su teléfono no aparece en el panel.
  La función de "pedidos" es útil como demo y para ventas presenciales (mostrador), no como
  sistema multiusuario.
- **La autenticación es del lado del cliente.** El SHA-256 evita guardar contraseñas en claro,
  pero no protege contra alguien con acceso al dispositivo. No es un control de acceso real.
- **No hay pagos, envíos ni facturación.** El cierre es por WhatsApp.
- **El stock puede desincronizarse** si un pedido no se confirma o si se vende por otro canal.
- **Las imágenes son externas (Unsplash).** Para producción conviene reemplazarlas por fotos
  propias optimizadas (ver punto 6).

Para multiusuario real hace falta un backend (ver punto 10).

---

## 6. Recomendaciones para Cuba

- **Número:** configura `whatsappPhone` con `53` + número, sin `+`, espacios ni guiones.
  Verifica que la cuenta sea WhatsApp Business y que pueda recibir mensajes de números nuevos.
- **Prueba el enlace en el móvil**, no solo en la computadora: abre la tienda desde Chrome,
  desde el navegador interno de Instagram/Facebook y desde el de WhatsApp. El código usa un
  enlace real (`<a>`) en lugar de `window.open` justamente para esos navegadores.
- **Datos móviles:** las imágenes usan `srcset` (320/640/800 px) y `loading="lazy"`, así el
  teléfono descarga la versión pequeña. Para mejorarlo aún más, reemplaza las URLs de Unsplash
  por fotos propias en WebP de ~600 px y guárdalas en una carpeta `img/`.
- **Compartir el catálogo:** publica el sitio (Netlify, GitHub Pages, hosting estático) y comparte
  el enlace o un QR por WhatsApp/Telegram. El pedido siempre llega al chat del negocio.
- **Backup semanal:** exporta el catálogo y los pedidos a un archivo y guárdalo fuera del teléfono.
- **Un solo dispositivo para administrar:** como los datos son locales, define qué teléfono o PC
  se usa para gestionar el catálogo y evita editar desde varios a la vez.

---

## 7. Despliegue

Es un sitio estático: no hay build ni variables de entorno.

1. Sube `index.html`, `admin.html`, `css/`, `js/` (y opcionalmente `img/`) al hosting.
2. `admin.html` incluye `noindex, nofollow`, y `robots.txt` + `_headers` refuerzan que no se
   indexe.
3. Recomendado: HTTPS. El login funciona igual sin él (hay un SHA-256 de respaldo en JS), pero
   HTTPS es lo correcto.
4. Si actualizas `js/config.js`, fuerza recarga en los dispositivos que ya visitaron la tienda.

### Cloudflare Pages

La página de producción está en Cloudflare. Configuración correcta del proyecto:

| Ajuste | Valor |
| --- | --- |
| Framework preset | **None** |
| Build command | **(vacío)** |
| Build output directory | **`/`** (raíz del repo) |
| Production branch | `main` |

Con el repo conectado, cada `git push` a `main` publica automáticamente. Si el proyecto se creó
como *Direct Upload*, hay que conectarlo al repositorio en **Settings → Build & deployments** o
subir los archivos a mano.

Archivos incluidos para producción:

- `_headers`: cabeceras de seguridad y `noindex` para el panel.
- `robots.txt`: bloquea `/admin.html` en buscadores.
- `docs/` y `tests/` también se publican como archivos estáticos; no contienen secretos.

### Proteger el panel (importante)

Hoy `admin.html` es accesible desde la URL pública y las credenciales demo están en el código
(la autenticación es del lado del cliente). Como los datos son de cada navegador, nadie puede
leer los pedidos del dueño, pero cualquiera puede abrir un panel que parece real.

Opciones, de mejor a peor:

1. **Cloudflare Access** (Zero Trust): política sobre `/admin.html` que solo deje pasar el correo
   del dueño. El plan gratuito cubre hasta 50 usuarios. Es la solución correcta mientras no haya
   backend.
2. **Quitar `admin.html` del despliegue** hasta tener Supabase Auth (el panel no es útil en
   producción si los datos son locales).
3. **Mínimo:** `demoMode: false` en `js/config.js` para no mostrar las contraseñas en pantalla.
   Ojo: la contraseña por defecto sigue funcionando en un navegador nuevo; esto no es seguridad.

### Supabase (si decides migrar)

El análisis completo está en [`docs/SUPABASE.md`](docs/SUPABASE.md): latencia esperada desde
Cuba, beneficios, límites del plan gratuito, esquema SQL con RLS y plan de migración.

Opciones gratuitas de hosting: Cloudflare Pages, Netlify, GitHub Pages.

---

## 8. Pruebas

```bash
npm install        # solo para desarrollo (jsdom)
npm test           # utilidades + integración
```

- `tests/utils.test.js`: SHA-256 (Web Crypto y respaldo JS), escape de HTML, dinero en centavos,
  almacenamiento tolerante a fallos y límite de auditoría.
- `tests/integration.test.js`: carga `index.html` y `admin.html` en jsdom y simula clics,
  formularios y login. Cubre XSS, stock, checkout único, roles, auditoría y edición de usuarios.

Estado actual: **21 + 27 comprobaciones en verde**.

---

## 9. Estructura

```
index.html            Tienda
admin.html            Panel de administración
css/store.css         Estilos de la tienda (tokens y componentes compartidos)
css/admin.css         Estilos del panel (carga store.css antes)
js/config.js          Configuración del cliente (editar solo esto)
js/utils.js           Escape HTML, storage seguro, dinero, hashing, foco, toasts
js/data.js            Productos semilla y normalización del catálogo
js/cart.js            Carrito, stock, checkout y WhatsApp
js/store.js           Catálogo, filtros, búsqueda y modal
js/admin.js           Login, roles, CRUD de catálogo, pedidos, usuarios y auditoría
scripts/serve.js      Servidor estático para probar en la LAN
tests/                Pruebas con Node + jsdom
```

---

## 10. Próximos pasos sugeridos

1. **Backend real** (Supabase es la opción más rápida y tiene plan gratuito): tabla de pedidos,
   auth con RLS y catálogo compartido. Esto resuelve el límite del punto 5.
2. **Estado de pedidos** (pendiente → contactado → entregado) y filtros por fecha.
3. **Fotos propias optimizadas** en `img/` con un script de conversión a WebP.
4. **Costo de envío** por municipio y total desglosado.
5. **Tests E2E** con Playwright sobre el navegador real (hoy jsdom no valida layout ni CSS).

---

## 11. Cambios de esta revisión

- **Seguridad:** todo el HTML dinámico se escapa (XSS almacenado eliminado), sin `onclick` inline,
  URLs de imagen validadas y `JSON.parse` protegido.
- **Login:** corregido el hash de `ventas` (antes correspondía a otra contraseña), eliminado el
  fallback en texto plano, manejo de errores visible y SHA-256 de respaldo para contextos sin
  Web Crypto o navegadores viejos (`TextEncoder` incluido).
- **Carrito:** valida stock real, no permite superarlo, revalida al cerrar el pedido, registra una
  sola vez, limpia el carrito y descuenta inventario de forma consistente.
- **Dinero:** cálculo en centavos enteros y formato con `Intl` (adiós a `$321.99999`).
- **Roles:** `staff` ya no ve ni puede ejecutar acciones de administrador; se valida dentro de cada
  función, no solo en la interfaz.
- **Auditoría:** registra creación, edición, borrado y restablecimiento de productos, además de
  accesos, usuarios y pedidos.
- **Usuarios:** se puede editar nombre/rol sin cambiar contraseña; no se puede borrar el último
  administrador ni la propia cuenta.
- **Accesibilidad:** catálogo navegable por teclado, diálogos con foco atrapado y retorno de foco,
  `aria-live` en avisos, contraste AA corregido y respeto a `prefers-reduced-motion`.
- **UI/UX:** scroll bloqueado con diálogos abiertos, toast que no tapa el carrito, validación con
  mensajes por campo, importación/exportación de respaldos y mensajes de estado claros.
- **Rendimiento/SEO:** imágenes con `srcset`, favicon, Open Graph, `noscript`, sin handlers inline.
- **Mantenimiento:** configuración centralizada, códigos de almacenamiento únicos, sin duplicación
  de tokens CSS, pruebas automatizadas y este README.
