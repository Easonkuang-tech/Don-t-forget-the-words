alter table public.cards
  add column if not exists image_url text not null default '',
  add column if not exists image_thumb_url text not null default '',
  add column if not exists image_attribution text not null default '',
  add column if not exists image_source_url text not null default '';
