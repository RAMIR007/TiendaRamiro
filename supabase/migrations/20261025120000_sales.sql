-- ============================================================================
-- Ventas con proveedores, comisiones y vale de pedido
-- Ejecutar DESPUÉS de 20261024120000_init.sql.
-- Es idempotente: se puede volver a ejecutar.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Código de referido por vendedor
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists referral_code text;

update public.profiles
set referral_code = lower(substr(replace(id::text, '-', ''), 1, 12))
where referral_code is null;

alter table public.profiles alter column referral_code set not null;

create unique index if not exists profiles_referral_code_key
  on public.profiles (lower(referral_code));

-- El trigger crea el perfil con su código de referido.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role, referral_code)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'name', ''),
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    'pending',
    lower(substr(replace(new.id::text, '-', ''), 1, 12))
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Costo, proveedor y comisión por producto
--    Tabla separada: el público y los vendedores NO pueden leer los costos.
-- ---------------------------------------------------------------------------

create table if not exists public.product_costs (
  product_id uuid primary key references public.products(id) on delete cascade,
  cost_cents integer not null default 0 check (cost_cents >= 0),
  commission_percent numeric(5, 2) not null default 0
    check (commission_percent >= 0 and commission_percent <= 100),
  supplier text,
  updated_at timestamptz not null default now()
);

alter table public.product_costs enable row level security;

drop policy if exists "product_costs_admin_all" on public.product_costs;
create policy "product_costs_admin_all" on public.product_costs
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists product_costs_set_updated_at on public.product_costs;
create trigger product_costs_set_updated_at
  before update on public.product_costs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Pedido: teléfono, vendedor, vale, entrega y pago
-- ---------------------------------------------------------------------------

alter table public.orders add column if not exists client_phone text not null default '';
alter table public.orders add column if not exists seller_id uuid
  references public.profiles(id) on delete set null;
alter table public.orders add column if not exists seller_code text;
alter table public.orders add column if not exists order_code text;
alter table public.orders add column if not exists delivery_method text not null default 'domicilio';
alter table public.orders add column if not exists payment_method text not null default 'efectivo';
alter table public.orders add column if not exists commission_cents integer not null default 0;

alter table public.orders drop constraint if exists orders_delivery_method_check;
alter table public.orders add constraint orders_delivery_method_check
  check (delivery_method in ('domicilio', 'recogida'));

alter table public.orders drop constraint if exists orders_payment_method_check;
alter table public.orders add constraint orders_payment_method_check
  check (payment_method in ('efectivo', 'transferencia'));

create sequence if not exists public.order_code_seq;

alter table public.orders alter column order_code
  set default (
    'TR-' || to_char(now(), 'YYMMDD') || '-' ||
    lpad(nextval('public.order_code_seq')::text, 3, '0')
  );

-- Rellena códigos de pedidos anteriores.
do $$
declare
  order_row record;
  counter integer := 0;
begin
  for order_row in
    select id, created_at from public.orders where order_code is null order by created_at
  loop
    counter := counter + 1;
    update public.orders
    set order_code = 'TR-' || to_char(order_row.created_at, 'YYMMDD') || '-' || lpad(counter::text, 3, '0')
    where id = order_row.id;
  end loop;
end;
$$;

alter table public.orders alter column order_code set not null;
create unique index if not exists orders_order_code_key on public.orders (order_code);

select setval(
  'public.order_code_seq',
  greatest((select count(*) from public.orders), 1),
  true
);

-- ---------------------------------------------------------------------------
-- 4. Ítems: costo y comisión congelados al momento de la venta
-- ---------------------------------------------------------------------------

alter table public.order_items add column if not exists cost_cents integer not null default 0;
alter table public.order_items add column if not exists commission_percent numeric(5, 2) not null default 0;
alter table public.order_items add column if not exists commission_cents integer not null default 0;
alter table public.order_items add column if not exists supplier text;

-- ---------------------------------------------------------------------------
-- 5. RLS: el vendedor ve solo sus ventas; el admin ve todas
-- ---------------------------------------------------------------------------

drop policy if exists "orders_staff_read" on public.orders;
drop policy if exists "orders_admin_read" on public.orders;
create policy "orders_admin_read" on public.orders
  for select to authenticated using (public.is_admin());

drop policy if exists "orders_staff_read_own" on public.orders;
create policy "orders_staff_read_own" on public.orders
  for select to authenticated
  using (public.is_staff() and seller_id = auth.uid());

drop policy if exists "order_items_staff_read" on public.order_items;
drop policy if exists "order_items_read" on public.order_items;
create policy "order_items_read" on public.order_items
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_items.order_id
        and public.is_staff()
        and o.seller_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Nueva función create_order con vale, vendedor y comisión
--    La versión anterior de 4 argumentos se conserva para no romper el
--    frontend que todavía esté desplegado.
-- ---------------------------------------------------------------------------

create or replace function public.create_order(
  p_client_name text,
  p_client_phone text,
  p_client_address text,
  p_client_notes text,
  p_delivery_method text,
  p_seller_code text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_order_code text;
  v_item jsonb;
  v_product public.products%rowtype;
  v_qty integer;
  v_variant text;
  v_total integer := 0;
  v_count integer := 0;
  v_commission_total integer := 0;
  v_commission_line integer;
  v_commission_percent numeric(5, 2);
  v_cost integer;
  v_supplier text;
  v_phone text;
  v_address text;
  v_delivery text;
  v_seller_id uuid;
  v_seller_code text;
begin
  if p_client_name is null or length(trim(p_client_name)) < 3 then
    raise exception 'El nombre del cliente es obligatorio';
  end if;

  v_phone := regexp_replace(coalesce(p_client_phone, ''), '[^0-9]', '', 'g');
  if length(v_phone) < 8 or length(v_phone) > 15 then
    raise exception 'El teléfono debe tener entre 8 y 15 dígitos';
  end if;

  v_delivery := lower(trim(coalesce(p_delivery_method, 'domicilio')));
  if v_delivery not in ('domicilio', 'recogida') then
    raise exception 'Método de entrega inválido';
  end if;

  v_address := nullif(trim(coalesce(p_client_address, '')), '');

  if v_delivery = 'domicilio' and (v_address is null or length(v_address) < 5) then
    raise exception 'La dirección es obligatoria para envío a domicilio';
  end if;

  if v_delivery = 'recogida' and v_address is null then
    v_address := 'Recogida en tienda';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'El pedido tiene demasiados artículos';
  end if;

  if p_seller_code is not null and trim(p_seller_code) <> '' then
    select id, referral_code
    into v_seller_id, v_seller_code
    from public.profiles
    where lower(referral_code) = lower(trim(p_seller_code))
    limit 1;
  end if;

  insert into public.orders (
    client_name, client_phone, client_address, client_notes,
    delivery_method, payment_method, seller_id, seller_code,
    total_cents, commission_cents
  )
  values (
    trim(p_client_name),
    v_phone,
    v_address,
    nullif(trim(coalesce(p_client_notes, '')), ''),
    v_delivery,
    'efectivo',
    v_seller_id,
    v_seller_code,
    0,
    0
  )
  returning id, order_code into v_order_id, v_order_code;

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

    select cost_cents, commission_percent, supplier
    into v_cost, v_commission_percent, v_supplier
    from public.product_costs
    where product_id = v_product.id;

    v_cost := coalesce(v_cost, 0);
    v_commission_percent := coalesce(v_commission_percent, 0);
    v_commission_line := (round(v_product.price_cents * v_commission_percent / 100))::integer * v_qty;

    insert into public.order_items (
      order_id, product_id, name, variant, unit_price_cents, quantity,
      cost_cents, commission_percent, commission_cents, supplier
    )
    values (
      v_order_id, v_product.id, v_product.name, v_variant, v_product.price_cents, v_qty,
      v_cost, v_commission_percent, v_commission_line, v_supplier
    );

    update public.products
    set stock = stock - v_qty,
        updated_at = now()
    where id = v_product.id;

    v_total := v_total + (v_product.price_cents * v_qty);
    v_count := v_count + v_qty;
    v_commission_total := v_commission_total + v_commission_line;
  end loop;

  update public.orders
  set total_cents = v_total,
      commission_cents = v_commission_total
  where id = v_order_id;

  insert into public.audit_logs (user_label, action)
  values (
    'Cliente (Web)',
    format('Pedido %s por %s (%s artículos)', v_order_code, v_total, v_count)
  );

  return jsonb_build_object(
    'order_id', v_order_id,
    'order_code', v_order_code,
    'total_cents', v_total,
    'commission_cents', v_commission_total,
    'count', v_count
  );
end;
$$;

revoke all on function public.create_order(text, text, text, text, text, text, jsonb) from public;
grant execute on function public.create_order(text, text, text, text, text, text, jsonb) to anon, authenticated;
