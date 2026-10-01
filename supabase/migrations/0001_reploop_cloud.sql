begin;

create extension if not exists pgcrypto;

create table if not exists public.projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  created_at bigint not null,
  updated_at bigint not null,
  position integer not null default 0,
  primary key (user_id, id)
);

create table if not exists public.decks (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  project_id text not null,
  name text not null,
  created_at bigint not null,
  updated_at bigint not null,
  position integer not null default 0,
  primary key (user_id, id),
  constraint decks_project_fk
    foreign key (user_id, project_id)
    references public.projects(user_id, id)
    on delete cascade
);

create table if not exists public.cards (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  deck_id text not null,
  content_type text not null,
  english text not null default '',
  chinese text not null default '',
  target text not null default '',
  sentence text not null default '',
  sentence_translation text not null default '',
  phonetic text not null default '',
  definition_en text not null default '',
  definition_zh text not null default '',
  part_of_speech text not null default '',
  tags text[] not null default '{}',
  source text not null default 'manual',
  level integer not null default 0,
  next_review_at bigint not null,
  last_reviewed_at bigint,
  review_count integer not null default 0,
  correct_count integer not null default 0,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (user_id, id),
  constraint cards_deck_fk
    foreign key (user_id, deck_id)
    references public.decks(user_id, id)
    on delete cascade
);

create table if not exists public.review_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  card_id text not null,
  mode text not null,
  review_scope text not null,
  answer text not null default '',
  correct_answer text not null default '',
  is_correct boolean not null,
  attempts integer not null default 1,
  system_rating text not null,
  user_rating text not null,
  reaction_time_ms integer not null default 0,
  answer_time_ms integer not null default 0,
  total_time_ms integer not null default 0,
  speed_band text not null,
  level_before integer not null,
  level_after integer not null,
  next_review_at bigint not null,
  affects_schedule boolean not null default false,
  reviewed_at bigint not null,
  primary key (user_id, id),
  constraint review_logs_card_fk
    foreign key (user_id, card_id)
    references public.cards(user_id, id)
    on delete cascade
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_new_limit integer not null default 10,
  notification_enabled boolean not null default false,
  notification_time text not null default '09:30',
  initialized boolean not null default true,
  updated_at bigint not null
);

create index if not exists projects_user_position_idx
  on public.projects(user_id, position);
create index if not exists decks_user_project_idx
  on public.decks(user_id, project_id, position);
create index if not exists cards_user_next_review_idx
  on public.cards(user_id, next_review_at);
create index if not exists cards_user_deck_idx
  on public.cards(user_id, deck_id);
create index if not exists review_logs_user_card_time_idx
  on public.review_logs(user_id, card_id, reviewed_at desc);

alter table public.projects enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.review_logs enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "projects_owner_all" on public.projects;
create policy "projects_owner_all" on public.projects
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "decks_owner_all" on public.decks;
create policy "decks_owner_all" on public.decks
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "cards_owner_all" on public.cards;
create policy "cards_owner_all" on public.cards
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "review_logs_owner_all" on public.review_logs;
create policy "review_logs_owner_all" on public.review_logs
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "user_settings_owner_all" on public.user_settings;
create policy "user_settings_owner_all" on public.user_settings
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.apply_review_log(
  p_log jsonb,
  p_affects_schedule boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.review_logs (
    user_id, id, card_id, mode, review_scope, answer, correct_answer,
    is_correct, attempts, system_rating, user_rating, reaction_time_ms,
    answer_time_ms, total_time_ms, speed_band, level_before, level_after,
    next_review_at, affects_schedule, reviewed_at
  ) values (
    current_user_id,
    p_log->>'id',
    p_log->>'cardId',
    p_log->>'mode',
    p_log->>'reviewScope',
    coalesce(p_log->>'answer', ''),
    coalesce(p_log->>'correctAnswer', ''),
    (p_log->>'isCorrect')::boolean,
    coalesce((p_log->>'attempts')::integer, 1),
    p_log->>'systemRating',
    p_log->>'userRating',
    coalesce((p_log->>'reactionTimeMs')::integer, 0),
    coalesce((p_log->>'answerTimeMs')::integer, 0),
    coalesce((p_log->>'totalTimeMs')::integer, 0),
    p_log->>'speedBand',
    (p_log->>'levelBefore')::integer,
    (p_log->>'levelAfter')::integer,
    (p_log->>'nextReviewAt')::bigint,
    p_affects_schedule,
    (p_log->>'reviewedAt')::bigint
  )
  on conflict (user_id, id) do nothing;

  if p_affects_schedule then
    update public.cards
    set
      level = (p_log->>'levelAfter')::integer,
      next_review_at = (p_log->>'nextReviewAt')::bigint,
      last_reviewed_at = (p_log->>'reviewedAt')::bigint,
      review_count = review_count + 1,
      correct_count = correct_count + case
        when (p_log->>'isCorrect')::boolean then 1
        else 0
      end,
      updated_at = (p_log->>'reviewedAt')::bigint
    where user_id = current_user_id
      and id = p_log->>'cardId';
  end if;
end;
$$;

create or replace function public.clear_user_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.review_logs where user_id = current_user_id;
  delete from public.cards where user_id = current_user_id;
  delete from public.decks where user_id = current_user_id;
  delete from public.projects where user_id = current_user_id;
  delete from public.user_settings where user_id = current_user_id;

  insert into public.user_settings (
    user_id, daily_new_limit, notification_enabled,
    notification_time, initialized, updated_at
  ) values (
    current_user_id, 10, false, '09:30', true, (extract(epoch from clock_timestamp()) * 1000)::bigint
  );
end;
$$;

create or replace function public.import_reploop_snapshot(
  p_snapshot jsonb,
  p_replace boolean default false
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  first_settings jsonb;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_replace then
    delete from public.review_logs where user_id = current_user_id;
    delete from public.cards where user_id = current_user_id;
    delete from public.decks where user_id = current_user_id;
    delete from public.projects where user_id = current_user_id;
    delete from public.user_settings where user_id = current_user_id;
  end if;

  insert into public.projects (
    user_id, id, name, created_at, updated_at, position
  )
  select
    current_user_id,
    item->>'id',
    item->>'name',
    (item->>'createdAt')::bigint,
    (item->>'updatedAt')::bigint,
    coalesce((item->>'position')::integer, 0)
  from jsonb_array_elements(coalesce(p_snapshot->'projects', '[]'::jsonb)) item
  on conflict (user_id, id) do update set
    name = excluded.name,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    position = excluded.position;

  insert into public.decks (
    user_id, id, project_id, name, created_at, updated_at, position
  )
  select
    current_user_id,
    item->>'id',
    item->>'projectId',
    item->>'name',
    (item->>'createdAt')::bigint,
    (item->>'updatedAt')::bigint,
    coalesce((item->>'position')::integer, 0)
  from jsonb_array_elements(coalesce(p_snapshot->'decks', '[]'::jsonb)) item
  on conflict (user_id, id) do update set
    project_id = excluded.project_id,
    name = excluded.name,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    position = excluded.position;

  insert into public.cards (
    user_id, id, deck_id, content_type, english, chinese, target, sentence,
    sentence_translation, phonetic, definition_en, definition_zh,
    part_of_speech, tags, source, level, next_review_at, last_reviewed_at,
    review_count, correct_count, created_at, updated_at
  )
  select
    current_user_id,
    item->>'id',
    item->>'deckId',
    item->>'contentType',
    coalesce(item->>'english', ''),
    coalesce(item->>'chinese', ''),
    coalesce(item->>'target', ''),
    coalesce(item->>'sentence', ''),
    coalesce(item->>'sentenceTranslation', ''),
    coalesce(item->>'phonetic', ''),
    coalesce(item->>'definitionEn', ''),
    coalesce(item->>'definitionZh', ''),
    coalesce(item->>'partOfSpeech', ''),
    coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(item->'tags', '[]'::jsonb)
        )
      ),
      '{}'::text[]
    ),
    coalesce(item->>'source', 'manual'),
    coalesce((item->>'level')::integer, 0),
    (item->>'nextReviewAt')::bigint,
    nullif(item->>'lastReviewedAt', '')::bigint,
    coalesce((item->>'reviewCount')::integer, 0),
    coalesce((item->>'correctCount')::integer, 0),
    (item->>'createdAt')::bigint,
    (item->>'updatedAt')::bigint
  from jsonb_array_elements(coalesce(p_snapshot->'cards', '[]'::jsonb)) item
  on conflict (user_id, id) do update set
    deck_id = excluded.deck_id,
    content_type = excluded.content_type,
    english = excluded.english,
    chinese = excluded.chinese,
    target = excluded.target,
    sentence = excluded.sentence,
    sentence_translation = excluded.sentence_translation,
    phonetic = excluded.phonetic,
    definition_en = excluded.definition_en,
    definition_zh = excluded.definition_zh,
    part_of_speech = excluded.part_of_speech,
    tags = excluded.tags,
    source = excluded.source,
    level = excluded.level,
    next_review_at = excluded.next_review_at,
    last_reviewed_at = excluded.last_reviewed_at,
    review_count = excluded.review_count,
    correct_count = excluded.correct_count,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at;

  insert into public.review_logs (
    user_id, id, card_id, mode, review_scope, answer, correct_answer,
    is_correct, attempts, system_rating, user_rating, reaction_time_ms,
    answer_time_ms, total_time_ms, speed_band, level_before, level_after,
    next_review_at, affects_schedule, reviewed_at
  )
  select
    current_user_id,
    item->>'id',
    item->>'cardId',
    item->>'mode',
    item->>'reviewScope',
    coalesce(item->>'answer', ''),
    coalesce(item->>'correctAnswer', ''),
    coalesce((item->>'isCorrect')::boolean, false),
    coalesce((item->>'attempts')::integer, 1),
    item->>'systemRating',
    item->>'userRating',
    coalesce((item->>'reactionTimeMs')::integer, 0),
    coalesce((item->>'answerTimeMs')::integer, 0),
    coalesce((item->>'totalTimeMs')::integer, 0),
    item->>'speedBand',
    coalesce((item->>'levelBefore')::integer, 0),
    coalesce((item->>'levelAfter')::integer, 0),
    (item->>'nextReviewAt')::bigint,
    coalesce((item->>'affectsSchedule')::boolean, false),
    (item->>'reviewedAt')::bigint
  from jsonb_array_elements(coalesce(p_snapshot->'reviewLogs', '[]'::jsonb)) item
  on conflict (user_id, id) do nothing;

  first_settings := (p_snapshot->'settings')->0;
  insert into public.user_settings (
    user_id, daily_new_limit, notification_enabled,
    notification_time, initialized, updated_at
  ) values (
    current_user_id,
    coalesce((first_settings->>'dailyNewLimit')::integer, 10),
    coalesce((first_settings->>'notificationEnabled')::boolean, false),
    coalesce(first_settings->>'notificationTime', '09:30'),
    true,
    (extract(epoch from clock_timestamp()) * 1000)::bigint
  )
  on conflict (user_id) do update set
    daily_new_limit = excluded.daily_new_limit,
    notification_enabled = excluded.notification_enabled,
    notification_time = excluded.notification_time,
    initialized = true,
    updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.apply_review_log(jsonb, boolean) from public;
revoke all on function public.clear_user_data() from public;
revoke all on function public.import_reploop_snapshot(jsonb, boolean) from public;
grant execute on function public.apply_review_log(jsonb, boolean) to authenticated;
grant execute on function public.clear_user_data() to authenticated;
grant execute on function public.import_reploop_snapshot(jsonb, boolean) to authenticated;

alter publication supabase_realtime add table public.projects;
alter publication supabase_realtime add table public.decks;
alter publication supabase_realtime add table public.cards;
alter publication supabase_realtime add table public.review_logs;
alter publication supabase_realtime add table public.user_settings;

commit;
