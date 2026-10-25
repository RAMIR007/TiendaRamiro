# Recuperación de contraseña

Cómo funciona el botón **“¿Olvidaste tu contraseña?”** y qué hay que configurar en Supabase.

---

## 1. Cómo funciona

1. En `/admin`, el usuario escribe su correo y pulsa **¿Olvidaste tu contraseña?**.
2. El panel llama a `POST /auth/v1/recover` con ese correo.
3. Supabase envía un correo con un enlace a `/reset-password`.
4. La página lee el token del enlace, pide la nueva contraseña y llama a
   `PUT /auth/v1/user`. Después redirige al panel.
5. El mensaje en pantalla es siempre el mismo, exista o no la cuenta, para no revelar
   qué correos están registrados.

Archivos:

| Archivo | Función |
| --- | --- |
| `public/admin.html` + `public/js/admin.js` | Botón y llamada a `recover` |
| `public/reset-password.html` | Página del formulario |
| `public/js/reset-password.js` | Lee el token, valida y actualiza la contraseña |

---

## 2. Configurar Supabase (obligatorio)

**Authentication → URL Configuration**:

| Campo | Valor |
| --- | --- |
| Site URL | `https://tiendaramiro.ramiroxavier07.workers.dev` |
| Redirect URLs | `https://tiendaramiro.ramiroxavier07.workers.dev/reset-password` |
| Redirect URLs (desarrollo) | `http://localhost:8080/reset-password` |

Sin esto, el enlace del correo vuelve a `localhost:3000` o a una URL no permitida.

**Authentication → Email Templates → Reset Password**: deja la plantilla por defecto
(`{{ .ConfirmationURL }}`). El enlace debe llegar con los tokens en el hash
(`#access_token=...&type=recovery`), que es lo que lee la página.

> Si tu proyecto usa **PKCE** y el enlace llega con `?code=`, esta página no puede
> completar el cambio porque el verificador vive en el navegador que solicitó el
> enlace. En ese caso, cambia el flujo a *implicit* en la configuración de Auth o usa
> una plantilla con `{{ .TokenHash }}` y el endpoint `/auth/v1/verify`.

---

## 3. Envío de correos

El servicio de correo integrado de Supabase es **solo para pruebas**: tiene límites muy
bajos (unos pocos correos por hora) y puede no entregar a destinatarios que no sean
miembros del proyecto.

Para producción configura **SMTP propio**:

- **Authentication → SMTP Settings**.
- Proveedores habituales: Resend, Brevo, Mailgun, Amazon SES.
- Verifica el dominio remitente (SPF/DKIM) para no caer en spam.

Sin SMTP propio, el botón puede responder correctamente y el correo no llegar.

---

## 4. Probar

1. Entra en `/admin` y escribe el correo del administrador.
2. Pulsa **¿Olvidaste tu contraseña?**.
3. Revisa la bandeja (y spam). El enlace debe abrir
   `.../reset-password#access_token=...`.
4. Define una contraseña de 8+ caracteres y vuelve a entrar.

Para probar sin depender del correo, usa **Supabase → Authentication → Users → tu
usuario → Reset password**. El panel de Supabase puede generar el enlace de recuperación
con permisos de administrador; la clave `publishable` del frontend **no** puede hacerlo.
