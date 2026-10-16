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
