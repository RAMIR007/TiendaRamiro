-- ============================================================================
-- Imágenes de producto en Storage, categorías compartidas y ubicación proveedor
-- Ejecutar después de las migraciones 20261024120000, 20261025120000 y
-- 20261026120000. Idempotente.
-- ============================================================================

alter table public.products
  add column if not exists supplier_city text,
  add column if not exists supplier_municipality text,
  add column if not exists supplier_address text;

create table if not exists public.categories (
  key text primary key check (key ~ '^[a-z0-9][a-z0-9-]{0,31}$'),
  label text not null check (length(trim(label)) between 1 and 50),
  emoji text not null default '📦',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

drop policy if exists "categories_public_read" on public.categories;
create policy "categories_public_read" on public.categories
  for select to anon, authenticated using (active);

drop policy if exists "categories_admin_all" on public.categories;
create policy "categories_admin_all" on public.categories
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.categories to anon, authenticated;
grant insert, update, delete on public.categories to authenticated;

insert into public.categories (key, label, emoji)
values
  ('tecnologia', 'Tecnología', '⚡'),
  ('moda', 'Moda & Calzado', '👟'),
  ('hogar', 'Hogar & Accesorios', '🏠')
on conflict (key) do update
set label = excluded.label,
    emoji = excluded.emoji,
    active = true;
