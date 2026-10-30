-- Cierra accesos directos a datos privados y refuerza el control de roles.
-- Ejecutar después de las migraciones 20261024120000 a 20261027130000.

create table if not exists public.product_locations (
  product_id uuid primary key references public.products(id) on delete cascade,
  supplier_city text,
  supplier_municipality text,
  supplier_address text
);

alter table public.product_locations enable row level security;

revoke all on table public.product_locations from public, anon;
grant select, insert, update, delete on table public.product_locations to authenticated;

drop policy if exists "product_locations_admin_all" on public.product_locations;
create policy "product_locations_admin_all" on public.product_locations
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

do $$
begin
  if (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name in ('supplier_city', 'supplier_municipality', 'supplier_address')
  ) = 3 then
    execute $migration$
      insert into public.product_locations (
        product_id,
        supplier_city,
        supplier_municipality,
        supplier_address
      )
      select
        id,
        supplier_city,
        supplier_municipality,
        supplier_address
      from public.products
      where supplier_city is not null
         or supplier_municipality is not null
         or supplier_address is not null
      on conflict (product_id) do nothing
    $migration$;
  end if;
end;
$$;

alter table public.products
  drop column if exists supplier_city,
  drop column if exists supplier_municipality,
  drop column if exists supplier_address;

drop policy if exists "orders_staff_read_own" on public.orders;
create policy "orders_staff_read_own" on public.orders
  for select to authenticated
  using (public.is_staff() and seller_id = auth.uid());

drop policy if exists "order_items_read" on public.order_items;
create policy "order_items_read" on public.order_items
  for select to authenticated
  using (
    public.is_admin()
    or (
      public.is_staff()
      and exists (
        select 1
        from public.orders o
        where o.id = order_items.order_id
          and o.seller_id = auth.uid()
      )
    )
  );

drop policy if exists "audit_staff_insert" on public.audit_logs;
create policy "audit_staff_insert" on public.audit_logs
  for insert to authenticated
  with check (public.is_staff());
