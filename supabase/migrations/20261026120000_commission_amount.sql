-- ============================================================================
-- Comisión opcional: porcentual o monto fijo por unidad (5, 10, 15 $...)
-- Ejecutar DESPUÉS de 20261025120000_sales.sql. Idempotente.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. product_costs: tipo de comisión
--    'percent' → com = precio * commission_percent / 100  (comportamiento previo)
--    'amount'  → com = commission_fixed_cents por unidad, siempre
-- ---------------------------------------------------------------------------

alter table public.product_costs
  add column if not exists commission_type text not null default 'percent';

alter table public.product_costs drop constraint if exists product_costs_commission_type_check;
alter table public.product_costs
  add constraint product_costs_commission_type_check
  check (commission_type in ('percent', 'amount'));

alter table public.product_costs
  add column if not exists commission_fixed_cents integer not null default 0;

alter table public.product_costs drop constraint if exists product_costs_commission_fixed_check;
alter table public.product_costs
  add constraint product_costs_commission_fixed_check
  check (commission_fixed_cents >= 0);

-- ---------------------------------------------------------------------------
-- 2. order_items: congelar también el tipo y el monto fijo de la venta
-- ---------------------------------------------------------------------------

alter table public.order_items add column if not exists commission_type text not null default 'percent';
alter table public.order_items add column if not exists commission_fixed_cents integer not null default 0;

-- ---------------------------------------------------------------------------
-- 3. create_order: mesma firma; cambia solo el cálculo de comisión
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
  v_commission_unit integer;
  v_commission_percent numeric(5, 2);
  v_commission_type text;
  v_commission_fixed integer;
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

    select cost_cents, commission_type, commission_percent, commission_fixed_cents, supplier
    into v_cost, v_commission_type, v_commission_percent, v_commission_fixed, v_supplier
    from public.product_costs
    where product_id = v_product.id;

    v_cost := coalesce(v_cost, 0);
    v_commission_type := coalesce(v_commission_type, 'percent');
    v_commission_percent := coalesce(v_commission_percent, 0);
    v_commission_fixed := coalesce(v_commission_fixed, 0);

    -- Comisión por unidad: porcentaje del precio o monto fijo en $.
    if v_commission_type = 'amount' then
      v_commission_unit := v_commission_fixed;
    else
      v_commission_unit := round(v_product.price_cents * v_commission_percent / 100)::integer;
    end if;

    v_commission_line := v_commission_unit * v_qty;

    insert into public.order_items (
      order_id, product_id, name, variant, unit_price_cents, quantity,
      cost_cents, commission_type, commission_percent, commission_fixed_cents,
      commission_cents, supplier
    )
    values (
      v_order_id, v_product.id, v_product.name, v_variant, v_product.price_cents, v_qty,
      v_cost, v_commission_type, v_commission_percent, v_commission_fixed,
      v_commission_line, v_supplier
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
