-- Conserva datos de contacto del formulario en el perfil tras verificar el correo.
begin;

alter table public.profiles
  add column if not exists phone text,
  add column if not exists address text;

create or replace function private.claim_my_orders()
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

  -- Tras verificar el correo, guarda los datos de contacto de la compra más
  -- reciente que pertenece a esta identidad; no usa metadata editable como
  -- fuente de autorización ni modifica datos de otros clientes.
  update public.profiles p
  set
    phone = coalesce(nullif(latest.client_phone, ''), p.phone),
    address = coalesce(nullif(latest.client_address, ''), p.address)
  from (
    select o.client_phone, o.client_address
    from public.orders o
    where o.customer_id = v_user_id
      and lower(trim(o.customer_email)) = v_email
    order by o.created_at desc
    limit 1
  ) latest
  where p.id = v_user_id;

  return v_claimed;
end;
$function$;

alter function private.claim_my_orders() set search_path = pg_catalog;
revoke all privileges on function private.claim_my_orders() from public, anon, authenticated;
grant execute on function private.claim_my_orders() to authenticated;

comment on column public.profiles.phone is
  'Teléfono de contacto del cliente, copiado desde su compra más reciente tras verificar su correo.';
comment on column public.profiles.address is
  'Dirección de contacto del cliente, copiada desde su compra más reciente tras verificar su correo.';

commit;
