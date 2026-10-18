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
  add column if not exists image_source_url text not null default '';
