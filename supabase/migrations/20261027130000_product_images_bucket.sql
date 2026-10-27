-- ============================================================================
-- Bucket para las imágenes subidas desde el panel de administración.
-- Seguro de volver a ejecutar: no modifica ni elimina buckets o políticas
-- existentes. Si una política con ese nombre ya existe, se conserva.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  8388608,
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_admin_insert'
  ) then
    execute $policy$
      create policy "product_images_admin_insert" on storage.objects
        for insert to authenticated
        with check (bucket_id = 'product-images' and public.is_admin())
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_admin_update'
  ) then
    execute $policy$
      create policy "product_images_admin_update" on storage.objects
        for update to authenticated
        using (bucket_id = 'product-images' and public.is_admin())
        with check (bucket_id = 'product-images' and public.is_admin())
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'product_images_admin_delete'
  ) then
    execute $policy$
      create policy "product_images_admin_delete" on storage.objects
        for delete to authenticated
        using (bucket_id = 'product-images' and public.is_admin())
    $policy$;
  end if;
end;
$$;
