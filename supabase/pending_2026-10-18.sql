-- RepLoop pending schema updates: deck language + card images.
-- Paste this whole file into the Supabase SQL Editor once.

alter table public.decks
  add column if not exists language text not null default 'en';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'decks_language_check'
      and conrelid = 'public.decks'::regclass
  ) then
    alter table public.decks
      add constraint decks_language_check
      check (language in ('en', 'fr'));
  end if;
end $$;

create index if not exists decks_user_language_idx
  on public.decks (user_id, language);

alter table public.cards
  add column if not exists image_url text not null default '',
  add column if not exists image_thumb_url text not null default '',
  add column if not exists image_attribution text not null default '',
  add column if not exists image_source_url text not null default '',
  add column if not exists image_origin text not null default '';

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
