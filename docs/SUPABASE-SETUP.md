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

Para un empleado de ventas, repite el paso 1 y **no** ejecutes el `update`: queda como
`staff` automáticamente (el trigger le crea el perfil).

### Cerrar el registro público

**Authentication → Providers → Email**: desactiva **Allow new users to sign up**.
Así nadie puede crearse una cuenta desde la API pública; los usuarios se crean solo
desde el panel de Supabase.

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

## 5. Qué haré con eso

1. Crear `public/js/supabase-config.js` con la URL y la clave pública.
2. Reescribir el login del panel para usar Supabase Auth (correo + contraseña,
   sesión con refresh token, cierre de sesión real).
3. Eliminar del frontend los usuarios, hashes y la sesión en `sessionStorage`.
4. Leer el catálogo desde Supabase con caché local (la tienda sigue siendo rápida).
5. Enviar los pedidos con `create_order()` y mostrarlos en el panel para cualquier
   dispositivo.
6. Dejar la gestión de usuarios en el panel de Supabase (o una Edge Function con
   `service_role`, nunca en el navegador).
7. Probar todo contra tu proyecto real y desplegar en Cloudflare.

---

## 6. Notas de seguridad

- La clave `anon` es pública. Lo que protege los datos son las **políticas RLS**, no
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
