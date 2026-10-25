# Cloudflare Access para `/admin`

Capa extra de autenticación delante del panel. **No sustituye** el login de Supabase:
son dos barreras. La tienda (`/`) sigue siendo pública.

> Cloudflare permite Access por hostname o ruta, incluidos subdominios `workers.dev`.
> Referencia oficial: [Cloudflare Access para Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
> y [aplicaciones self-hosted](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/).

---

## 1. Activar Zero Trust

1. Entra en <https://one.dash.cloudflare.com>.
2. Si es la primera vez, crea el equipo (team name) y elige un método de login
   (One-time PIN por correo es suficiente).
3. Confirma que el plan gratuito está activo (cubre hasta 50 usuarios).

---

## 2. Crear la aplicación

**Zero Trust → Access → Applications → Add an application → Self-hosted.**

| Campo | Valor |
| --- | --- |
| Application name | `Tienda Ramiro — Admin` |
| Session duration | `24 hours` (o `8 hours` si es más estricto) |
| Public hostname | `tiendaramiro.ramiroxavier07.workers.dev` |
| Path | `admin*` |

`admin*` cubre `/admin`, `/admin.html` y cualquier subruta. Si la interfaz no acepta
el comodín, crea dos aplicaciones separadas: una con path `admin` y otra con
`admin.html`.

No pongas path `/` ni protejas todo el Worker: bloquearías la tienda pública.

---

## 3. Política de acceso

En **Policies → Add a policy**:

| Campo | Valor |
| --- | --- |
| Policy name | `Dueño` |
| Action | `Allow` |
| Include | `Emails` → `ramiroxavier07@gmail.com` |

Puedes agregar más correos si hay más administradores. Guarda la aplicación.

---

## 4. Probar

1. Abre una ventana de incógnito.
2. `https://tiendaramiro.ramiroxavier07.workers.dev/` → debe abrir la tienda sin login.
3. `https://tiendaramiro.ramiroxavier07.workers.dev/admin` → debe pedir el código de
   Cloudflare Access (One-time PIN).
4. Introduce el código del correo autorizado.
5. Después aparece el login de Supabase. Ahí entras con tu correo y contraseña.

Si `/admin` no pide Access:

- Revisa que el hostname coincida exactamente (sin `https://`).
- Revisa que el path sea `admin*` y no `/admin*`.
- Espera un minuto: los cambios de Access tardan en propagarse.

---

## 5. Qué protege y qué no

- **Protege:** `/admin` y `/admin.html` antes de que el navegador llegue al panel.
- **No protege:** `/reset-password` (debe quedar público para el enlace del correo).
- **No reemplaza:** Supabase Auth. Access autentica el dispositivo/identidad de
  Cloudflare; Supabase autoriza al usuario del panel y aplica RLS.
- **Sesión:** el cookie `CF_Authorization` dura lo configurado (24 h). Cerrar sesión en
  Supabase no cierra la sesión de Access; para eso usa el portal de Access o espera.

---

## 6. Alternativa con dominio propio

Si más adelante conectas un dominio (por ejemplo `tienda.tudominio.com` al Worker),
cambia el **Public hostname** de la aplicación por ese dominio. Es más cómodo de
gestionar y permite políticas por subdominio.

---

## 7. API (opcional)

Si prefieres configurarlo por API, necesitas un **API Token** con permiso
`Access: Apps and Policies — Edit` y el `account_id`. El cuerpo es una aplicación
`self_hosted` con `domain` igual al hostname y `destinations`/paths según la API.
La referencia completa está en
[Access applications API](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/applications/methods/create/).
No compartas ese token con el frontend ni lo guardes en el repositorio.
