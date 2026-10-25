# Configurar SMTP en Supabase (guía para Cuba)

Sin SMTP propio, Supabase solo envía correos a los miembros del equipo del proyecto y
limita a **2 correos por hora**. Para que “¿Olvidaste tu contraseña?” funcione con
cualquier cliente, hay que configurar un servidor SMTP.

> El SMTP lo usa **Supabase desde sus servidores**, no el visitante cubano. La ubicación
> del negocio no afecta el envío; lo que importa es que el correo llegue a la bandeja del
> destinatario (Gmail, Outlook, nauta.cu, etc.).

---

## 1. Qué proveedor usar en Cuba

| Proveedor | Costo | ¿Dominio propio? | Límite gratis | Recomendación |
| --- | --- | --- | --- | --- |
| **Gmail SMTP** | Gratis | No | ~500 destinatarios/día | **Empezar hoy**, sin tarjeta ni dominio |
| **SMTP2GO** | Gratis | No (verificas un correo) | 1.000/mes, 200/día | Alternativa sin dominio, más “de negocio” |
| **Brevo** | Gratis | Sí, recomendable | 300/día | Mejor a mediano plazo si consigues dominio |
| Resend | Gratis | Sí, obligatorio | 3.000/mes | Solo si tienes dominio |
| Mailgun / SES | Tarjeta | Sí | Prueba / pago | Evitar por ahora |

**Mi recomendación para tu caso (sin dominio):**

1. **Gmail SMTP** para dejar el flujo funcionando esta misma tarde.
2. Si Google te da problemas o quieres separar la tienda de tu cuenta personal:
   **SMTP2GO** gratis.
3. Cuando tengas un dominio propio: **Brevo**, que además da 300 correos/día y buenos
   registros de entrega.

> Los límites son de correos de autenticación (recuperar contraseña, invitaciones). Para
> una tienda pequeña sobran. No los uses para marketing.

---

## 2. Opción A — Gmail SMTP (la más rápida)

### 2.1 Crear una cuenta dedicada

No uses tu Gmail personal. Crea una cuenta solo para la tienda, por ejemplo
`tiendaramiro@gmail.com`.

### 2.2 Activar 2 pasos y contraseña de aplicación

1. Entra en la cuenta → **Seguridad** → activa **Verificación en 2 pasos**.
2. Busca **Contraseñas de aplicaciones** (App passwords).
3. Crea una con el nombre `Supabase`.
4. Copia la contraseña de **16 caracteres** (sin espacios). Esa es la que va en Supabase,
   no la contraseña normal de Gmail.

Guía oficial: <https://support.google.com/accounts/answer/185833>

### 2.3 Configurar en Supabase

**Authentication → Emails → SMTP Settings** (según la versión de la interfaz también
aparece como **Authentication → Settings → SMTP**).

Activa **Enable Custom SMTP** y llena:

| Campo | Valor |
| --- | --- |
| Sender email | `tiendaramiro@gmail.com` |
| Sender name | `Tienda Ramiro` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | `tiendaramiro@gmail.com` |
| Password | la contraseña de aplicación de 16 caracteres |

- Si el puerto 465 falla, prueba `587`.
- El **Sender email debe ser exactamente la cuenta autenticada**. Gmail reescribe el
  remitente si pones otro.
- Guarda con **Save**.

### 2.4 Ajustar el límite de envío

Supabase impone un límite bajo (30 correos/hora) al activar SMTP propio.
Ve a **Authentication → Rate Limits → Rate limit for sending emails** y súbelo si lo
necesitas (por ejemplo 60/hora). Para recuperar contraseñas es más que suficiente.

---

## 3. Opción B — SMTP2GO (sin dominio, 1.000/mes)

1. Crea la cuenta en <https://www.smtp2go.com> (plan Free).
2. **Sending → Verified Senders → Add Sender**: agrega un correo real que controles
   (puede ser Gmail) y confirma el código que te envían.
3. **Sending → SMTP Users → Add SMTP User**: crea usuario y contraseña.
4. En Supabase:

| Campo | Valor |
| --- | --- |
| Sender email | el correo verificado |
| Sender name | `Tienda Ramiro` |
| Host | `mail.smtp2go.com` |
| Port | `587` (o `2525`, o `465`) |
| Username | el usuario SMTP creado |
| Password | la contraseña del usuario SMTP |

- Free: 1.000 correos/mes, 200/día.
- Sin dominio verificado hay un límite de 25/hora; para recuperación de contraseña sobra.
- Si más adelante verificas un dominio, desaparece ese límite y mejora la entregabilidad.

Guía: <https://support.smtp2go.com/hc/en-gb/articles/223087947-Free-Plan>

---

## 4. Opción C — Brevo (recomendado cuando tengas dominio)

1. Crea la cuenta en <https://www.brevo.com> (plan Free, 300/día).
2. **Senders, Domains & IPs → Domains → Add domain** y configura DKIM/SPF en el DNS.
3. **Senders → Add sender**: usa `no-reply@tudominio.com` y verifica el código.
4. **SMTP & API → SMTP**: genera una **SMTP key** (no una API key).
5. En Supabase:

| Campo | Valor |
| --- | --- |
| Sender email | el remitente verificado |
| Sender name | `Tienda Ramiro` |
| Host | `smtp-relay.brevo.com` |
| Port | `587` (o `465`) |
| Username | tu login de Brevo (o el que muestre la página SMTP) |
| Password | la **SMTP key** |

- Brevo no permite autenticar dominios gratuitos (`gmail.com`, `yahoo.com`): si usas un
  Gmail como remitente, la entregabilidad baja. Con dominio propio funciona muy bien.
- Guía: <https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP>

---

## 5. Configurar las URLs (obligatorio para el enlace del correo)

**Authentication → URL Configuration**:

| Campo | Valor |
| --- | --- |
| Site URL | `https://tiendaramiro.ramiroxavier07.workers.dev` |
| Redirect URLs | `https://tiendaramiro.ramiroxavier07.workers.dev/reset-password` |
| Redirect URLs (local) | `http://localhost:8080/reset-password` |

Sin esto, el enlace del correo vuelve a `localhost` y el cambio de contraseña no funciona.

---

## 6. Probar

1. Abre `/admin`.
2. Escribe el correo del administrador.
3. Pulsa **¿Olvidaste tu contraseña?**.
4. Revisa bandeja de entrada y spam.
5. El enlace debe abrir `.../reset-password#access_token=...`.
6. Define la nueva contraseña.

Si no llega:

- Revisa **Supabase → Logs → Auth** (errores de SMTP).
- Revisa los logs del proveedor (Gmail no tiene logs; SMTP2GO/Brevo sí).
- Prueba el puerto 465 y 587.
- Confirma que el remitente esté verificado.
- Revisa que no estés usando la contraseña normal de Gmail en vez de la de aplicación.
- Si el destinatario es `nauta.cu` o `correos.cu`, prueba primero con Gmail; algunos
  filtros cubanos son estrictos. Con dominio propio y DKIM mejora mucho.

---

## 7. Seguridad y mantenimiento

- Usa una cuenta de correo **dedicada** a la tienda, no la personal.
- La contraseña SMTP se guarda en Supabase; no la pongas en el repositorio ni en el
  frontend.
- Si sospechas que se filtró, revoca la contraseña de aplicación / SMTP key y genera otra.
- No mezcles correos de autenticación con marketing.
- Si el negocio crece, configura un dominio y DKIM/SPF/DMARC; es lo que más mejora la
  entregabilidad.
