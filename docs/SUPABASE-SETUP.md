# Puesta en marcha de Supabase

Guía para dejar la tienda con autenticación real y datos compartidos. Son unos 10 minutos.
No necesitas tarjeta: el plan gratuito alcanza para esta tienda.

---

## 1. Crear el proyecto

1. Entra en <https://supabase.com> y crea una cuenta (con GitHub o correo).
2. **New project**:
   - Nombre: `tiendaramiro`
   - Contraseña de base de datos: genera una y guárdala en un lugar seguro.
   - Región: **East US (North Virginia)** — es la de menor latencia desde Cuba.
3. Espera 2–3 minutos a que termine de aprovisionar.

> El plan gratuito pausa el proyecto tras ~1 semana sin actividad. Para una tienda con
> movimiento alcanza; si se pausa, se reactiva desde el panel.

---

## 2. Crear las tablas y políticas

1. En el proyecto, abre **SQL Editor → New query**.
2. Copia **todo** el contenido de
   [`supabase/migrations/20261024120000_init.sql`](../supabase/migrations/20261024120000_init.sql).
3. Pega y pulsa **Run** (`Ctrl+Enter`). Debe terminar sin errores.
4. En **Table Editor** deberías ver: `profiles`, `products` (8 filas), `orders`,
   `order_items` y `audit_logs`.

El script crea las tablas, activa RLS, define los roles y agrega la función
`create_order()`, que valida stock y precios en el servidor y descuenta inventario
en una sola transacción.

---

## 3. Crear el usuario administrador

1. Ve a **Authentication → Users → Add user → Create new user**.
2. Correo: el que uses para administrar (ej. `ramiro@tudominio.com`).
3. Contraseña: una fuerte. Deja activado **Auto Confirm User**.
4. Copia el correo y ejecuta en el SQL Editor, cambiando el correo:

```sql
update public.profiles
set role = 'admin', name = 'Administrador'
where id = (select id from auth.users where email = 'ramiro@tudominio.com');
```

5. Verifica en **Table Editor → profiles** que tu fila tenga `role = admin`.

Para un empleado de ventas, repite el paso 1 y ejecuta también el `update`, pero con
`role = 'staff'`:

```sql
update public.profiles
set role = 'staff', name = 'Ventas'
where id = (select id from auth.users where email = 'ventas@tudominio.com');
```

> Toda cuenta nueva nace como **`pending`**: puede iniciar sesión, pero no ve pedidos ni
> toca el catálogo hasta que un administrador la ascienda a `staff` o `admin`. Es una
> segunda barrera además de cerrar el registro público.

### Cerrar el registro público

**Authentication → Providers → Email**: desactiva **Allow new users to sign up**.
Así nadie puede crearse una cuenta desde la API pública; los usuarios se crean solo
desde el panel de Supabase.

#### ¿Qué hace exactamente ese interruptor?

- Controla el endpoint público `POST /auth/v1/signup`. La `anon key` viaja en el
  navegador, así que sin este paso cualquier persona podría crear cuentas en tu proyecto.
- **No** afecta a los usuarios que creas desde **Authentication → Users** (esos usan la
  API de administración).
- **No** afecta al login de cuentas que ya existen, ni a la recuperación de contraseña.
- En este esquema, una cuenta creada por la puerta pública quedaría en `pending` y no
  podría leer pedidos, pero igual conviene cerrarlo para no acumular cuentas basura.

---

## 4. Obtener las claves

**Project Settings → API**:

| Dato | Dónde está | ¿Es secreto? |
| --- | --- | --- |
| `Project URL` | arriba, `https://xxxx.supabase.co` | No |
| `anon public` | en API Keys | **No** (está pensada para el navegador) |
| `service_role` | en API Keys (oculta) | **SÍ — nunca va al frontend** |

Pásame **solo** la URL y la clave `anon`, junto con el correo del administrador.
No me envíes la contraseña de la base ni la `service_role`.

---

## 5. Cómo queda la integración

Esta versión ya está migrada. Los archivos que intervienen son:

| Archivo | Función |
| --- | --- |
| `public/js/supabase-config.js` | URL del proyecto y clave `publishable` |
| `public/js/supabase.js` | Cliente de Auth y REST (sin SDK) |
| `public/js/admin.js` | Login con Supabase Auth, perfiles/roles, CRUD y pedidos |
| `public/js/cart.js` | Checkout con la RPC `create_order()` |
| `public/js/store.js` | Catálogo desde Supabase con caché local |
| `supabase/migrations/…_init.sql` | Tablas, RLS, trigger de perfiles y `create_order()` |

La gestión de usuarios (crear empleados, cambiar roles) se hace desde **Authentication → Users**
y **Table Editor → profiles**. El panel solo permite cambiar la propia contraseña; así la
`service_role` nunca toca el navegador.

---

## 6. Notas de seguridad

- La clave `publishable` es pública. Lo que protege los datos son las **políticas RLS**, no
  esconder la clave.
- `service_role` salta RLS: solo puede vivir en una Edge Function o en tu máquina.
- RLS ya limita: el público solo ve productos activos, no puede leer pedidos ajenos,
  no puede escribir precios y solo crea pedidos mediante `create_order()`.
- Los pedidos anónimos pueden ser spam. Si aparece, se agrega Cloudflare Turnstile o
  un límite por IP en una Edge Function.
- Guarda la contraseña de la base en un gestor de contraseñas. No se usa en el frontend.

---

## 7. Si algo falla

| Síntoma | Causa probable |
| --- | --- |
| `relation "public.products" does not exist` | El SQL no se ejecutó completo |
| Login responde `Invalid login credentials` | Usuario mal creado o contraseña incorrecta |
| El panel carga pero no ve pedidos | Falta la política RLS o el perfil no tiene rol |
| `new row violates row-level security policy` | El usuario no es `admin` en `profiles` |
| Error `permission denied for function create_order` | Falta el `grant execute` (lo incluye el script) |
