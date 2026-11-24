# Configuración de acceso de clientes — RamiroX Market

La interfaz y las RPC están preparadas para correo sin contraseña y para iniciar OAuth con Google/Facebook. Los proveedores sociales requieren credenciales externas y no se activan solo por mostrar los botones.

## 1. URL de retorno de Auth

En Supabase → Authentication → URL Configuration:

- Configura el Site URL con el dominio público real de la tienda.
- Añade como Redirect URL autorizada la ruta `/account.html` del dominio público.
- Añade la ruta equivalente del entorno Preview que se vaya a probar. No uses comodines amplios si puedes evitarlo.

Dominio que figura actualmente como canónico en el HTML:
`https://tiendaramiro.ramiroxavier07.workers.dev/account.html`

Si Cloudflare usa otro dominio definitivo, sustituye esta URL por el dominio final antes de activar el registro público.

## 2. Correo sin contraseña

En Supabase → Authentication → Sign In / Providers:

- Mantén habilitado Email.
- Asegura que la confirmación de correo está habilitada.
- Revisa el template de Magic Link para que use `{{ .ConfirmationURL }}`.
- **Bloqueante para clientes reales:** el SMTP predeterminado de Supabase solo envía a direcciones autorizadas del equipo del proyecto. Configura un SMTP propio antes de que compradores externos puedan recibir enlaces.
- Configura SMTP propio para mejorar entrega y controlar límites; revisa también los límites de OTP/magic link.
- En Authentication → Rate Limits, revisa límites de OTP y solicitudes de correo.

El formulario del checkout solo solicita el enlace si el comprador marca expresamente la casilla de crear cuenta. La compra se registra incluso si el envío del enlace falla. Tras verificar el correo, el sistema vincula pedidos y guarda en el perfil el nombre, teléfono y dirección de la compra más reciente vinculada.

## 3. Google

1. Crea un OAuth Client ID de tipo Web en Google Cloud Console.
2. En Supabase → Authentication → Providers → Google, habilita Google e introduce Client ID y Client Secret.
3. Copia la Callback URL que muestra Supabase y añádela como Authorized redirect URI en Google Cloud.
4. Comprueba que `/account.html` del dominio de la tienda está en Redirect URLs autorizadas de Supabase.

No guardes Client Secret en GitHub, JavaScript público, variables `NEXT_PUBLIC_*` ni en este repositorio.

## 4. Facebook

1. Crea una aplicación en Meta for Developers y añade el producto Facebook Login.
2. En Supabase → Authentication → Providers → Facebook, habilita el proveedor e introduce App ID y App Secret.
3. Copia la Callback URL que muestra Supabase y configúrala en Facebook Login → Valid OAuth Redirect URIs.
4. Verifica los permisos de email y que el dominio de la tienda esté configurado en la aplicación de Meta.
5. Añade `/account.html` a Redirect URLs autorizadas de Supabase.

No guardes App Secret en GitHub ni en código del navegador.

## 5. Prueba previa a producción

- Probar correo con una dirección de control propia.
- Verificar que el enlace devuelve a `/account.html` y crea sesión.
- Confirmar que un pedido con el mismo correo verificado se reclama.
- Confirmar que una cuenta con otro correo no puede consultar ese pedido.
- Probar Google/Facebook solo después de configurar credenciales.
- Probar en Preview antes de publicar.
- No usar pedidos reales para pruebas: las pruebas de integración simulan Supabase.

La RPC `claim_my_orders()` exige una sesión autenticada y un correo confirmado en `auth.users`. Las políticas RLS limitan la consulta de pedidos y líneas al `customer_id` autenticado.


## 6. Vinculación de Google/Facebook

Supabase Auth puede enlazar automáticamente identidades que comparten el mismo correo verificado y único. Si el cliente usa otro correo, no se fusionarán automáticamente; el enlace manual es una función beta y no está implementado en esta tienda.
