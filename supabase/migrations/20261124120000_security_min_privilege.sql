-- Endurecimiento de permisos para el catálogo público y el checkout de invitados.
-- Propuesta versionada: no se ejecuta en la base de datos real desde este cambio.
--
-- El único acceso anónimo de escritura será public.create_order(...) (7 args).
-- Esa RPC es intencionalmente pública para permitir pedidos como invitado:
-- valida los datos, consulta precios/stock del servidor y crea pedido/ítems
-- bajo SECURITY DEFINER. Los clientes no reciben INSERT directo sobre tablas.

begin;

-- Evita que las próximas tablas, secuencias y funciones hereden permisos amplios.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;

alter default privileges for role supabase_admin in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke execute on functions from anon, authenticated;

-- Cierra los permisos heredados que hoy existen sobre todas las tablas y secuencias.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;

-- El público solo puede leer los datos que forman el catálogo.
grant select on table public.products, public.categories to anon;
grant select on table public.products, public.categories to authenticated;

-- El panel usa authenticated; RLS sigue determinando qué filas puede tocar.
grant insert, update, delete on table public.products, public.categories to authenticated;
grant select, update, delete on table public.orders to authenticated;
grant select on table public.order_items, public.profiles to authenticated;
grant select, insert, delete on table public.audit_logs to authenticated;
grant select, insert, update, delete on table public.product_costs, public.product_locations to authenticated;

-- audit_logs usa una columna identity y el panel inserta eventos con la sesión.
-- Las secuencias de pedidos/ítems quedan reservadas al propietario de la RPC.
grant usage on sequence public.audit_logs_id_seq to authenticated;

-- Retira el acceso RPC general y concede solo las funciones necesarias.
revoke execute on all functions in schema public from public, anon, authenticated;

alter function public.create_order(text, text, text, jsonb) set search_path = pg_catalog;
alter function public.create_order(text, text, text, text, text, text, jsonb) set search_path = pg_catalog;
alter function public.handle_new_user() set search_path = pg_catalog;
alter function public.is_admin() set search_path = pg_catalog;
alter function public.is_staff() set search_path = pg_catalog;
alter function public.set_updated_at() set search_path = pg_catalog;

-- La firma antigua no debe permitir saltarse teléfono y método de entrega.
revoke all privileges on function public.create_order(text, text, text, jsonb)
  from public, anon, authenticated;

-- Única RPC de pedidos disponible para clientes sin iniciar sesión.
revoke all privileges on function public.create_order(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_order(text, text, text, text, text, text, jsonb)
  to anon;

-- Los helpers se usan internamente en políticas RLS, solo para sesiones autenticadas.
grant execute on function public.is_admin(), public.is_staff() to authenticated;

-- handle_new_user y set_updated_at son funciones de trigger, no endpoints RPC.
revoke all privileges on function public.handle_new_user(), public.set_updated_at()
  from public, anon, authenticated;

comment on function public.create_order(text, text, text, text, text, text, jsonb) is
  'Checkout público de invitado. Validación y creación de pedidos bajo SECURITY DEFINER; acceso anónimo intencional y único.';

commit;
