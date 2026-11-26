-- Aísla las funciones SECURITY DEFINER en un esquema no expuesto por la Data API.
-- Las RPC públicas quedan como wrappers SECURITY INVOKER.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated;

-- Mueve las funciones privilegiadas fuera del esquema público.
alter function public.is_admin() set schema private;
alter function public.is_staff() set schema private;
alter function public.claim_my_orders() set schema private;
alter function public.create_order(text, text, text, text, text, text, jsonb) set schema private;
alter function public.create_order(text, text, text, text, text, text, jsonb, text) set schema private;

-- La RPC de 8 argumentos llama directamente a la versión privada de 7 argumentos.
create or replace function private.create_order(
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

  v_result := private.create_order(
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

-- Asegura search_path fijo y privilegios mínimos de todas las funciones privadas.
alter function private.is_admin() set search_path = pg_catalog;
alter function private.is_staff() set search_path = pg_catalog;
alter function private.claim_my_orders() set search_path = pg_catalog;
alter function private.create_order(text, text, text, text, text, text, jsonb) set search_path = pg_catalog;
alter function private.create_order(text, text, text, text, text, text, jsonb, text) set search_path = pg_catalog;

revoke all privileges on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin(), private.is_staff() to authenticated;
grant execute on function private.claim_my_orders() to authenticated;
grant execute on function private.create_order(text, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function private.create_order(text, text, text, text, text, text, jsonb, text) to anon, authenticated;

-- Las políticas consultan helpers del esquema privado, nunca RPC públicas.
alter policy audit_admin_delete on public.audit_logs using (private.is_admin());
alter policy audit_staff_insert on public.audit_logs with check (private.is_staff());
alter policy audit_staff_read on public.audit_logs using (private.is_staff());
alter policy categories_admin_all on public.categories
  using (private.is_admin()) with check (private.is_admin());
alter policy order_items_read on public.order_items
  using (
    private.is_admin()
    or (
      private.is_staff()
      and exists (
        select 1 from public.orders o
        where o.id = order_items.order_id
          and o.seller_id = auth.uid()
      )
    )
  );
alter policy orders_admin_delete on public.orders using (private.is_admin());
alter policy orders_admin_read on public.orders using (private.is_admin());
alter policy orders_admin_update on public.orders
  using (private.is_admin()) with check (private.is_admin());
alter policy orders_staff_read_own on public.orders
  using (private.is_staff() and seller_id = auth.uid());
alter policy product_costs_admin_all on public.product_costs
  using (private.is_admin()) with check (private.is_admin());
alter policy product_locations_admin_all on public.product_locations
  using (private.is_admin()) with check (private.is_admin());
alter policy products_admin_all on public.products
  using (private.is_admin()) with check (private.is_admin());
alter policy products_staff_update on public.products
  using (private.is_staff()) with check (private.is_staff());
alter policy profiles_select_admin on public.profiles using (private.is_admin());

-- Wrappers expuestos, sin privilegios elevados propios.
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
language sql
security invoker
set search_path = pg_catalog
as $function$
  select private.create_order($1, $2, $3, $4, $5, $6, $7);
$function$;

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
language sql
security invoker
set search_path = pg_catalog
as $function$
  select private.create_order($1, $2, $3, $4, $5, $6, $7, $8);
$function$;

create or replace function public.claim_my_orders()
returns integer
language sql
security invoker
set search_path = pg_catalog
as $function$
  select private.claim_my_orders();
$function$;

revoke all privileges on function public.create_order(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
revoke all privileges on function public.create_order(text, text, text, text, text, text, jsonb, text)
  from public, anon, authenticated;
revoke all privileges on function public.claim_my_orders() from public, anon, authenticated;
grant execute on function public.create_order(text, text, text, text, text, text, jsonb)
  to anon, authenticated;
grant execute on function public.create_order(text, text, text, text, text, text, jsonb, text)
  to anon, authenticated;
grant execute on function public.claim_my_orders() to authenticated;

comment on schema private is 'Funciones internas SECURITY DEFINER y helpers RLS; esquema no expuesto por la Data API.';
comment on function public.create_order(text, text, text, text, text, text, jsonb) is
  'Wrapper SECURITY INVOKER para el checkout de invitados; delega validación y escritura en private.create_order.';
comment on function public.create_order(text, text, text, text, text, text, jsonb, text) is
  'Wrapper SECURITY INVOKER para checkout y persistencia del correo; delega en private.create_order.';
comment on function public.claim_my_orders() is
  'Wrapper SECURITY INVOKER; la reclamación segura se ejecuta en private.claim_my_orders.';

commit;
