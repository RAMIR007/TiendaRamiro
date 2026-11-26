# Configuración de acceso de clientes — RamiroX Market

## Modelo elegido

La tienda mantiene el checkout de invitados como flujo principal. No se exige iniciar sesión ni crear una cuenta para comprar.

La única opción de acceso de clientes es **Google OAuth**. Se ha retirado el envío de enlaces mágicos por correo y no se ofrece Facebook ni registro con contraseña en esta etapa. Por tanto, el flujo de cuenta no necesita SMTP.

Para vincular pedidos de invitado, el cliente debe iniciar sesión con Google usando exactamente el mismo correo que escribió en el checkout. La función `claim_my_orders()` solo reclama pedidos cuando Auth confirma el correo y RLS limita el historial al propietario autenticado. Un correo diferente no se vincula automáticamente.

## 1. Configurar Google OAuth

1. Abre Google Cloud Console y crea un OAuth Client ID de tipo **Web application**.
2. En Supabase → Authentication → Providers → Google, habilita Google e introduce el Client ID y Client Secret.
3. Copia la **Callback URL** que muestra Supabase y añádela en Google Cloud como Authorized redirect URI. Es la URL de callback de Supabase, no la ruta `/account.html`.
4. En Supabase → Authentication → URL Configuration, configura el Site URL con el dominio público real de la tienda.
5. Añade como Redirect URL autorizada la ruta `/account.html` del dominio público y la ruta equivalente del Preview que se vaya a probar. Evita comodines amplios.
6. Guarda el Client Secret únicamente en la configuración segura de Supabase. Nunca lo pongas en GitHub, JavaScript público, variables `NEXT_PUBLIC_*` ni en este repositorio.

Dominio que figura actualmente como canónico en el HTML:
`https://tiendaramiro.ramiroxavier07.workers.dev/account.html`

Si Cloudflare utiliza otro dominio definitivo, sustituye esta URL por el dominio real antes de activar el acceso público.

## 2. Qué ocurre con los clientes

- El cliente puede completar el pedido como invitado, aunque no tenga Google o no quiera usarlo.
- El correo del checkout se conserva en el pedido, pero no inicia sesión ni envía correos.
- Desde «Mi cuenta», el cliente puede continuar con Google.
- Después del retorno OAuth, la tienda ejecuta `claim_my_orders()` y muestra los pedidos vinculados a ese correo verificado.
- Si el correo de Google no coincide con el del pedido, el pedido no se reclama automáticamente.

## 3. Pruebas antes de producción

- Configurar primero las credenciales OAuth en Supabase y las URLs autorizadas.
- Probar el inicio de sesión con una cuenta Google de control.
- Probar un pedido de invitado simulado con el mismo correo y confirmar su reclamación.
- Confirmar que una cuenta con otro correo no puede consultar ese pedido.
- Probar en Preview antes de publicar.
- No crear pedidos comerciales reales para pruebas.

## 4. Funciones aplazadas

Facebook OAuth, registro con contraseña y acceso por enlace de correo quedan fuera de esta etapa. Podrán evaluarse más adelante. No se necesita contratar SMTP para el flujo Google OAuth.

La protección de pedidos sigue dependiendo de RLS y de la RPC `claim_my_orders()`, que exige sesión autenticada y correo confirmado en Supabase Auth.
