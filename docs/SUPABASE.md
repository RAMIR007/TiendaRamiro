# ¿Supabase para esta tienda? Análisis de rendimiento, costos y diseño

Documento de decisión. Resume qué gana y qué cuesta pasar de `localStorage` a Supabase,
y cómo hacerlo sin que la tienda se vuelva lenta en Cuba.

---

## 1. Respuesta corta: ¿se pone lento?

**No, si el catálogo no se consulta a Supabase en cada visita.**

Lo que hace lento un sitio no es "usar Supabase", sino poner una llamada de red en el camino
crítico de la primera pantalla. La arquitectura correcta mantiene el HTML, CSS y JS en el CDN
de Cloudflare (como ahora) y usa Supabase solo para:

- registrar un pedido (una escritura al final del checkout),
- leer/escribir el catálogo desde el panel,
- autenticar al dueño.

### Presupuesto de latencia realista (Cuba → us-east-1)

| Acción | Sin Supabase | Con Supabase (bien usado) |
| --- | --- | --- |
| Abrir la tienda | 100–400 ms (CDN) | 100–400 ms (igual: CDN) |
| Ver catálogo ya visitado | instantáneo (localStorage) | instantáneo (caché local) + refresco en segundo plano |
| Catálogo en un dispositivo nuevo | instantáneo (semilla local) | 0,4–1,5 s la primera vez, luego caché |
| Confirmar pedido | 0 ms | 0,4–1,5 s (una escritura) + WhatsApp |
| Abrir el panel y ver pedidos | 0 ms (solo local) | 0,5–2 s |

En móvil con datos lentos, una llamada HTTPS a EE. UU. puede costar 500–1.500 ms. Por eso el
pedido necesita un estado "Enviando…" y el catálogo necesita caché. Con eso, la percepción del
cliente no cambia: el cuello de botella real sigue siendo WhatsApp.

### Lo que sí lo pondría lento (evitar)

1. Traer el catálogo de Supabase **en cada carga** sin caché.
2. Usar Realtime (WebSocket) en la tienda pública.
3. Pedir el catálogo completo en cada tecla del buscador.
4. Subir las fotos a Supabase Storage y servirlas desde ahí sin CDN ni optimización.
5. Hacer 5 consultas separadas para armar una pantalla (productos + variantes + stock + pedidos).

---

## 2. Beneficios de Supabase para este proyecto

### Datos y negocio

- **Los pedidos dejan de ser locales.** Hoy un pedido hecho en el teléfono del cliente no
  aparece en el panel del dueño. Con Supabase, sí: una sola tabla compartida.
- **Catálogo compartido entre dispositivos.** El dueño edita desde el móvil y el cliente ve el
  cambio; se acaba el "solo se ve en mi navegador".
- **Stock real y consistente.** Se puede descontar dentro de una transacción/RPC, sin carreras
  entre dos clientes comprando la última unidad.
- **Historial que sobrevive.** Limpiar el navegador ya no borra las ventas.
- **Consultas y reportes:** ventas por semana, producto más vendido, clientes recurrentes,
  con SQL en vez de sumar arrays en JS.
- **Trabajo en equipo:** dueño y empleados con roles, cada uno con su cuenta real.
- **Auditoría del lado del servidor:** no depende de que el navegador no borre el log.

### Seguridad

- **Autenticación real** (email/contraseña, enlaces mágicos, OAuth) con sesiones JWT,
  recuperación de contraseña y bloqueo de registro.
- **Row Level Security (RLS):** el cliente puede *insertar* pedidos pero no *leer* los de otros;
  solo el personal autenticado lee pedidos. La clave pública (`anon`) es segura **si las
  políticas están bien escritas**.
- **Contraseñas hasheadas y gestionadas por Supabase Auth** (bcrypt), no en el frontend.
- **Backups** (según plan) y posibilidad de exportar la base completa.
- **Protección contra manipulación:** el precio y el stock se validan en el servidor, no en el
  navegador. Hoy un usuario técnico puede alterar el carrito en localStorage.

### Operación y mantenimiento

- **Panel de base de datos** para ver/editar filas sin tocar código; útil para el dueño o para ti
  dando soporte.
- **API REST y Realtime autogeneradas**; no hay que escribir endpoints a mano.
- **Edge Functions** para integrar WhatsApp Cloud API, correos o cron jobs más adelante.
- **Migraciones SQL versionadas**, entornos separados (dev/prod) y ramas de base de datos.
- **Comunidad enorme y documentación**; es el estándar "baterías incluidas" sobre Postgres.
- **Sin lock-in real:** es Postgres estándar; se puede exportar o autoalojar.

### Costo

- **Plan gratuito suficiente para empezar** (500 MB de base, 5 GB de salida, 50.000 usuarios
  autenticados; verifica límites vigentes, cambian). Los pedidos de texto ocupan muy poco.
- Sin servidor que administrar, sin parches de sistema operativo.
- Escala a planes pagos sin reescribir nada.

---

## 3. Costos y riesgos que hay que saber

| Riesgo | Impacto | Mitigación |
| --- | --- | --- |
| **El proyecto free se pausa tras ~1 semana sin actividad** | La primera petición falla hasta restaurarlo desde el panel | Plan pago, o un ping diario (Cloudflare Worker cron) mientras sea aceptable |
| **Latencia desde Cuba** | 0,4–1,5 s por consulta en datos móviles | Caché local, una sola escritura por pedido, región us-east-1 |
| **Ancho de banda del plan free** | Si sirves imágenes desde Storage, se agota | Imágenes en Cloudflare/Unsplash o WebP locales; Storage solo si hace falta |
| **RLS mal configurado** | Fuga de pedidos o escritura libre | Políticas explícitas, probar con la clave `anon`, nunca exponer `service_role` |
| **Dependencia de red** | Sin internet no hay pedido guardado | WhatsApp siempre funciona; encolar el pedido y reintentar |
| **Spam de pedidos** | Cualquiera puede insertar filas | Cloudflare Turnstile, rate limit en un Worker o validación por teléfono |
| **Migración de datos** | Los pedidos actuales están en navegadores | Importación manual única (JSON exportado) |

---

## 4. Arquitectura recomendada (si decides usarlo)

```
Cliente
  ├─ index.html, css, js  → Cloudflare CDN (igual que hoy)
  ├─ catálogo             → caché en localStorage (TTL 1 h) + refresco en segundo plano
  └─ checkout             → 1 POST a Supabase (orders + order_items) → WhatsApp

Panel (admin.html)
  ├─ login                → Supabase Auth (email/contraseña)
  ├─ pedidos              → SELECT con RLS (solo autenticados)
  ├─ catálogo             → INSERT/UPDATE/DELETE con RLS (solo admin)
  └─ refresco             → botón o polling cada 60 s (no Realtime en móvil)
```

Regla de oro: **el catálogo nunca debe bloquear la primera pintura**. Se muestra lo cacheado y
se actualiza después.

---

## 5. Esquema mínimo (SQL de referencia)

```sql
-- Perfiles y roles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'staff' check (role in ('admin','staff'))
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- Catálogo
create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  price_cents integer not null check (price_cents >= 0),
  stock integer not null default 0 check (stock >= 0),
  badge text,
  description text,
  images text[] not null default '{}',
  variants text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Pedidos
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pendiente'
    check (status in ('pendiente','contactado','entregado','cancelado')),
  client_name text not null,
  client_address text not null,
  client_notes text,
  total_cents integer not null check (total_cents >= 0),
  source text not null default 'web'
);

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  variant text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0)
);

-- RLS
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "perfil propio" on public.profiles
  for select to authenticated using (id = auth.uid());

create policy "catálogo público" on public.products
  for select to anon, authenticated using (active);

create policy "admin escribe catálogo" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "cualquiera crea pedido" on public.orders
  for insert to anon, authenticated with check (true);

create policy "staff lee pedidos" on public.orders
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

create policy "admin borra pedidos" on public.orders
  for delete to authenticated using (public.is_admin());

create policy "items del pedido" on public.order_items
  for insert to anon, authenticated with check (true);
```

> El stock debería descontarse dentro de una función RPC transaccional, no desde el cliente,
> para evitar que dos pedidos simultáneos vendan la misma unidad.

---

## 6. Cómo integrarlo sin SDK (mejor para redes lentas)

No hace falta cargar `supabase-js` (~30 KB gzip). Con `fetch` alcanza:

```js
const API = 'https://TU-PROYECTO.supabase.co/rest/v1';
const ANON = 'TU_ANON_KEY'; // pública, protegida por RLS

async function crearPedido(pedido) {
  const response = await fetch(`${API}/orders`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(pedido)
  });
  if (!response.ok) throw new Error('No se pudo registrar el pedido');
}
```

El login del panel sí conviene con `supabase-js` o con la API de Auth, porque maneja refresh
tokens y sesión.

---

## 7. Plan de migración (1–2 semanas de trabajo parcial)

1. Crear el proyecto en la región **us-east-1** (medir latencia real desde La Habana).
2. Ejecutar el esquema y las políticas RLS.
3. Importar los 8 productos actuales (`Exportar JSON` del panel).
4. Crear el usuario del dueño con Supabase Auth y desactivar registro público.
5. Añadir `js/api.js` con fetch, caché de catálogo y manejo de errores.
6. Cambiar el checkout para guardar en Supabase y mantener WhatsApp como cierre.
7. Migrar el panel: login real, pedidos desde la API, CRUD contra Supabase.
8. Dejar `localStorage` como caché y como respaldo si falla la red.
9. Probar en 3G simulada y en un móvil real.
10. Configurar backup/exportación y un ping diario si se queda en el plan free.

---

## 8. Alternativa si la prioridad es latencia: Cloudflare D1

Ya usas Cloudflare. **D1 + Workers** ejecuta las consultas en el edge (decenas de ms), con plan
gratuito generoso y sin pausas por inactividad. La contra: tienes que construir login, permisos y
panel de datos tú mismo; no hay Auth ni dashboard listos.

| Criterio | Supabase | Cloudflare D1 |
| --- | --- | --- |
| Velocidad desde Cuba | Buena con caché (0,4–1,5 s) | Muy buena (~50–300 ms) |
| Auth y roles | Incluidos (RLS) | A construir |
| Panel para el dueño | Incluido | A construir |
| Esfuerzo inicial | 1–2 semanas | 2–4 semanas |
| Costo | Free con límites/pausa | Free amplio |
| Riesgo operativo | Pausa por inactividad | Ninguno relevante |

**Recomendación:** Supabase si quieres velocidad de entrega y un panel real con poco código;
D1 si más adelante quieres todo en Cloudflare y no te importa escribir auth.

---

## 9. Decisión para esta tienda

Para el volumen de un negocio pequeño en Cuba, el plan gratuito de Supabase sobra en capacidad.
El verdadero requisito no es "más potencia", es **que el pedido del cliente llegue al dueño**.
Eso se resuelve con una tabla de pedidos y RLS, no con un servidor grande.

Si el negocio factura lo suficiente para pagar el plan Pro (~US$25/mes), desaparece la pausa por
inactividad y ganas backups: es el punto en el que conviene pasar.
