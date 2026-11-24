-- Datos de cuenta del cliente y reclamación segura de pedidos de invitado.
-- No cambia la lógica de precios, stock ni comisiones: la nueva RPC delega
-- en la RPC de checkout existente y solo añade el correo al pedido.

begin;

alter table public.orders
  add column if not exists customer_email text,
  add column if not exists customer_id uuid references auth.users(id) on delete set null;

create index if not exists orders_customer_email_unclaimed_idx
  on public.orders (lower(customer_email))
  where customer_id is null;

create index if not exists orders_customer_id_created_at_idx
  on public.orders (customer_id, created_at desc)
  where customer_id is not null;

create or replace function public.create_order(
  p_client_name text,
  p_client_phone text,
  p_client_address text,
  p_client_notes text,
  p_delivery_method text,
  p_seller_code text,
  p_items jsonb,
  p_client_email text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_result jsonb;
  v_email text;
begin
  v_email := nullif(lower(trim(coalesce(p_client_email, ''))), '');

  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Correo electrónico no válido';
  end if;

  -- Reutiliza el checkout validado que ya existe. No replica ni modifica
  -- los cálculos de comisión ni el control de inventario.
  v_result := public.create_order(
    p_client_name,
    p_client_phone,
    p_client_address,
    p_client_notes,
    p_delivery_method,
    p_seller_code,
    p_items
  );

  update public.orders
  set customer_email = v_email
  where id = (v_result ->> 'order_id')::uuid;

  return v_result;
end;
$function$;

revoke all privileges on function public.create_order(text, text, text, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.create_order(text, text, text, text, text, text, jsonb, text)
  to anon, authenticated;

create or replace function public.claim_my_orders()
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_user_id uuid;
  v_email text;
  v_claimed integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Debes iniciar sesión para vincular tus pedidos';
  end if;

  select lower(trim(email))
  into v_email
  from auth.users
  where id = v_user_id
    and email_confirmed_at is not null;

  if v_email is null then
    raise exception 'Debes verificar tu correo antes de vincular pedidos';
  end if;

  update public.orders
  set customer_id = v_user_id
  where customer_id is null
    and lower(trim(customer_email)) = v_email;

  get diagnostics v_claimed = row_count;
  return v_claimed;
end;
$function$;

revoke all privileges on function public.claim_my_orders() from public, anon, authenticated;
grant execute on function public.claim_my_orders() to authenticated;

drop policy if exists orders_customer_read_own on public.orders;
create policy orders_customer_read_own
  on public.orders
  for select
  to authenticated
  using (customer_id = auth.uid());

drop policy if exists order_items_customer_read_own on public.order_items;
create policy order_items_customer_read_own
  on public.order_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.orders o
      where o.id = order_items.order_id
        and o.customer_id = auth.uid()
    )
  );

comment on column public.orders.customer_email is
  'Correo aportado durante checkout; solo se vincula a una cuenta tras verificar la identidad.';
comment on column public.orders.customer_id is
  'Cuenta Auth propietaria del pedido; se establece solo mediante claim_my_orders tras verificar el correo.';

commit;
