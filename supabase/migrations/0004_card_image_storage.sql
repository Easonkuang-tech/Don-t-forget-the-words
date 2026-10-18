insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', true)
on conflict (id) do update set public = true;

drop policy if exists "card_images_public_read" on storage.objects;
create policy "card_images_public_read"
  on storage.objects for select
  using (bucket_id = 'card-images');

drop policy if exists "card_images_insert_own" on storage.objects;
create policy "card_images_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "card_images_update_own" on storage.objects;
create policy "card_images_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "card_images_delete_own" on storage.objects;
create policy "card_images_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'card-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
