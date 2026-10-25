-- ============================================================================
-- Tienda Ramiro — migración inicial para Supabase
-- Ejecutar completo en: Supabase Dashboard → SQL Editor → New query → Run
-- Crea: perfiles/roles, catálogo, pedidos, auditoría, RLS y la función
-- transaccional create_order() que descuenta stock sin carreras.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Perfiles y roles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  -- 'pending' = cuenta creada pero sin aprobar: no puede leer ni escribir nada.
  role text not null default 'pending'
    check (role in ('admin', 'staff', 'pending')),
  created_at timestamptz not null default now()
);

-- Actualiza bases creadas con una versión anterior del esquema.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'staff', 'pending'));
alter table public.profiles alter column role set default 'pending';

alter table public.profiles enable row level security;

-- ¿El usuario autenticado es administrador?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ¿El usuario autenticado es personal aprobado (admin o ventas)?
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'staff')
  );
$$;

-- Perfil automático al crear un usuario en Supabase Auth.
-- Queda en 'pending': aunque el registro público estuviera abierto, la cuenta
-- nueva no puede ver pedidos ni tocar el catálogo hasta que un admin la apruebe.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    'pending'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Catálogo
-- ---------------------------------------------------------------------------

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null,
  price_cents integer not null check (price_cents >= 0),
  stock integer not null default 0 check (stock >= 0),
  badge text,
  description text not null default '',
  images text[] not null default '{}',
  variants text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category) where active;
create index if not exists products_created_idx on public.products (created_at desc);

-- Mantiene updated_at al día en cualquier edición (panel o SQL).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Pedidos
-- ---------------------------------------------------------------------------

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'contactado', 'entregado', 'cancelado')),
  client_name text not null,
  client_address text not null,
  client_notes text,
  total_cents integer not null default 0 check (total_cents >= 0),
  source text not null default 'web'
);

create index if not exists orders_created_idx on public.orders (created_at desc);
create index if not exists orders_status_idx on public.orders (status);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  variant text,
  unit_price_cents integer not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity > 0 and quantity <= 100)
);

create index if not exists order_items_order_idx on public.order_items (order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Auditoría
-- ---------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_label text not null default 'Sistema',
  action text not null
);

create index if not exists audit_created_idx on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Políticas RLS
-- ---------------------------------------------------------------------------

-- Perfiles: cada uno ve el suyo; el admin ve todos.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin" on public.profiles
  for select to authenticated using (public.is_admin());

-- Catálogo: público solo productos activos; el admin ve y escribe todo.
drop policy if exists "products_public_read" on public.products;
create policy "products_public_read" on public.products
  for select to anon, authenticated using (active);

drop policy if exists "products_admin_all" on public.products;
create policy "products_admin_all" on public.products
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Pedidos: el personal lee; solo el admin actualiza o borra.
-- No hay política de INSERT: los pedidos entran únicamente por create_order().
drop policy if exists "orders_staff_read" on public.orders;
create policy "orders_staff_read" on public.orders
  for select to authenticated using (public.is_staff());

drop policy if exists "orders_admin_update" on public.orders;
create policy "orders_admin_update" on public.orders
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "orders_admin_delete" on public.orders;
create policy "orders_admin_delete" on public.orders
  for delete to authenticated using (public.is_admin());

-- Ítems: lectura para el personal; escritura solo por create_order().
drop policy if exists "order_items_staff_read" on public.order_items;
create policy "order_items_staff_read" on public.order_items
  for select to authenticated using (public.is_staff());

-- Auditoría: el personal lee; cualquier usuario autenticado puede registrar.
drop policy if exists "audit_staff_read" on public.audit_logs;
create policy "audit_staff_read" on public.audit_logs
  for select to authenticated using (public.is_staff());

drop policy if exists "audit_staff_insert" on public.audit_logs;
create policy "audit_staff_insert" on public.audit_logs
  for insert to authenticated with check (true);

drop policy if exists "audit_admin_delete" on public.audit_logs;
create policy "audit_admin_delete" on public.audit_logs
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Función transaccional de creación de pedido
--    El precio y el stock SIEMPRE se leen de la base, nunca del cliente.
-- ---------------------------------------------------------------------------

create or replace function public.create_order(
  p_client_name text,
  p_client_address text,
  p_client_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_variant text;
  v_total integer := 0;
  v_count integer := 0;
begin
  if p_client_name is null or length(trim(p_client_name)) < 3 then
    raise exception 'El nombre del cliente es obligatorio';
  end if;

  if p_client_address is null or length(trim(p_client_address)) < 5 then
    raise exception 'La dirección de entrega es obligatoria';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'El pedido tiene demasiados artículos';
  end if;

  insert into public.orders (client_name, client_address, client_notes, total_cents)
  values (
    trim(p_client_name),
    trim(p_client_address),
    nullif(trim(coalesce(p_client_notes, '')), ''),
    0
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := coalesce((v_item ->> 'quantity')::integer, 0);
    v_variant := nullif(trim(coalesce(v_item ->> 'variant', '')), '');

    if v_qty <= 0 or v_qty > 100 then
      raise exception 'Cantidad inválida';
    end if;

    select * into v_product
    from public.products
    where id = (v_item ->> 'product_id')::uuid
      and active
    for update;

    if not found then
      raise exception 'Uno de los productos ya no está disponible';
    end if;

    if array_length(v_product.variants, 1) is not null and array_length(v_product.variants, 1) > 0 then
      if v_variant is null or not (v_variant = any (v_product.variants)) then
        raise exception 'Variante inválida para %', v_product.name;
      end if;
    end if;

    if v_product.stock < v_qty then
      raise exception 'Stock insuficiente para % (quedan %)', v_product.name, v_product.stock;
    end if;

    insert into public.order_items
      (order_id, product_id, name, variant, unit_price_cents, quantity)
    values
      (v_order_id, v_product.id, v_product.name, v_variant, v_product.price_cents, v_qty);

    update public.products
    set stock = stock - v_qty,
        updated_at = now()
    where id = v_product.id;

    v_total := v_total + (v_product.price_cents * v_qty);
    v_count := v_count + v_qty;
  end loop;

  update public.orders set total_cents = v_total where id = v_order_id;

  insert into public.audit_logs (user_label, action)
  values ('Cliente (Web)', format('Pedido %s por %s (%s artículos)', v_order_id, v_total, v_count));

  return jsonb_build_object(
    'order_id', v_order_id,
    'total_cents', v_total,
    'count', v_count
  );
end;
$$;

revoke all on function public.create_order(text, text, text, jsonb) from public;
grant execute on function public.create_order(text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Datos iniciales (los mismos 8 productos de la demo)
-- ---------------------------------------------------------------------------

insert into public.products
  (id, name, category, price_cents, stock, badge, description, images, variants)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Auriculares Inalámbricos TWS Pro', 'tecnologia', 2800, 12, 'Más vendido',
    'Auriculares bluetooth 5.3 con cancelación de ruido ambiental (ENC), estuche con pantalla LED indicadora de batería y hasta 24h de reproducción combinada.',
    array[
      'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80'
    ],
    array['Negro Mate', 'Blanco Glaciar']
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Smartwatch Deportivo Ultra Fit', 'tecnologia', 4500, 8, 'Nuevo',
    'Reloj inteligente con monitor de ritmo cardíaco, oxímetro SpO2, seguimiento de más de 30 deportes, notificaciones de llamadas/WhatsApp y batería de 7 días.',
    array[
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&auto=format&fit=crop&q=80'
    ],
    array['Correa Negra', 'Correa Naranja Deportivo']
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'Power Bank Magnético 10000mAh', 'tecnologia', 3200, 15, 'Esencial',
    'Batería portátil compacta con carga rápida PD 20W e imán MagSafe compatible con iPhone y dispositivos Qi. Diseño ultrafino ideal para llevar a diario.',
    array['https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&auto=format&fit=crop&q=80'],
    array['Gris Titanio', 'Azul Noche']
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'Camiseta Oversize Algodón Premium', 'moda', 2000, 25, 'Tendencia',
    'Camiseta de corte oversized confeccionada en 100% algodón peinado pesado (240 GSM). Tejido fresco, cuello reforzado y costuras de alta durabilidad.',
    array[
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&auto=format&fit=crop&q=80'
    ],
    array['S - Negro', 'M - Negro', 'L - Negro', 'M - Blanco Crema', 'L - Blanco Crema']
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    'Zapatillas Urbanas Minimalist Low', 'moda', 5500, 6, 'Exclusivo',
    'Calzado casual versátil con plantilla ergonómica de memoria, suela de caucho antideslizante y acabado exterior resistente a la suciedad.',
    array[
      'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&auto=format&fit=crop&q=80'
    ],
    array['Talla 40', 'Talla 41', 'Talla 42', 'Talla 43', 'Talla 44']
  ),
  (
    '00000000-0000-0000-0000-000000000006',
    'Gorra Clásica Streetwear Bordada', 'moda', 1600, 18, null,
    'Gorra estructurada de 6 paneles en dril de algodón con hebilla de ajuste metálica trasera y bordado frontal en relieve de alta definición.',
    array['https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=800&auto=format&fit=crop&q=80'],
    array['Negro', 'Verde Militar', 'Beige Arena']
  ),
  (
    '00000000-0000-0000-0000-000000000007',
    'Botella Térmica Inox Doble Pared 750ml', 'hogar', 2200, 20, 'Eco Friendly',
    'Termo de acero inoxidable grado alimenticio 18/8. Mantiene bebidas frías por 24h o calientes por 12h. Libre de BPA y a prueba de fugas.',
    array['https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&auto=format&fit=crop&q=80'],
    array['Negro Mate', 'Azul Pastel', 'Acero Pulido']
  ),
  (
    '00000000-0000-0000-0000-000000000008',
    'Lámpara de Escritorio LED Minimal', 'hogar', 3000, 10, null,
    'Lámpara recargable touch con cuello flexible 360°, 3 tonos de luz (cálida, neutra, fría) y dimmer de brillo continuo. Ideal para lectura y trabajo nocturno.',
    array['https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80'],
    array['Blanco Nórdico', 'Negro Ébano']
  )
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Después de crear el usuario administrador en Authentication → Users,
--    ejecuta esta sentencia cambiando el correo:
-- ---------------------------------------------------------------------------
-- insert into public.profiles (id, name, role)
-- select id, split_part(email, '@', 1), 'admin'
-- from auth.users
-- where email = 'admin@tudominio.com'
-- on conflict (id) do update set role = 'admin';
