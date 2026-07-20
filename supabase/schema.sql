-- YOLO Formation — poll schema.
-- Run this in the Supabase SQL editor (or `supabase db push`).
-- No login: the browser uses the anon key, so we open row-level security to
-- anonymous read/write. Votes are keyed by (game_date, member_id) so a person's
-- latest choice overwrites their previous one.

create table if not exists public.votes (
  game_date   text        not null,
  member_id   text        not null,
  member_name text        not null,
  status      text        not null check (status in ('in', 'out')),
  device_id   text,
  updated_at  timestamptz not null default now(),
  primary key (game_date, member_id)
);

create table if not exists public.guests (
  id             text        primary key,
  game_date      text        not null,
  name           text        not null,
  host_member_id text        not null,
  host_name      text        not null,
  device_id      text,
  created_at     timestamptz not null default now()
);

-- One row per game: organizer overrides (time/location/note) plus the poll's
-- lifecycle. The cron (supabase/functions/poll-cron) upserts this to open the
-- poll ~2 days before kickoff; a person can also open it early from the UI.
create table if not exists public.game_meta (
  game_date       text        primary key,
  slot_id         text,
  kickoff_at      timestamptz,
  opens_at        timestamptz,
  status          text        not null default 'scheduled', -- scheduled | open | closed
  opened_manually boolean     not null default false,
  time            text,
  location        text,
  note            text,
  updated_at      timestamptz not null default now()
);

-- Upgrade an existing game_meta (from an earlier version that only had
-- time/location/note) — `create table if not exists` above won't add columns.
alter table public.game_meta add column if not exists slot_id         text;
alter table public.game_meta add column if not exists kickoff_at      timestamptz;
alter table public.game_meta add column if not exists opens_at        timestamptz;
alter table public.game_meta add column if not exists status          text    not null default 'scheduled';
alter table public.game_meta add column if not exists opened_manually boolean not null default false;

create index if not exists votes_game_date_idx  on public.votes (game_date);
create index if not exists guests_game_date_idx on public.guests (game_date);

-- Row-level security: allow anonymous access (login-free app).
alter table public.votes     enable row level security;
alter table public.guests    enable row level security;
alter table public.game_meta enable row level security;

drop policy if exists "anon all votes"  on public.votes;
drop policy if exists "anon all guests" on public.guests;
drop policy if exists "anon all meta"   on public.game_meta;
create policy "anon all votes"  on public.votes     for all using (true) with check (true);
create policy "anon all guests" on public.guests    for all using (true) with check (true);
create policy "anon all meta"   on public.game_meta for all using (true) with check (true);

-- Live updates for the poll (realtime subscription in store.js). Wrapped so the
-- whole file stays safe to re-run once a table is already in the publication.
do $$ begin alter publication supabase_realtime add table public.votes;     exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.guests;    exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.game_meta; exception when duplicate_object then null; end $$;

-- ---- Peer-sourced player feedback (Phase 1: collection) ----
-- One row per (rater, subject, game). Anonymous: rater_id is stored only to
-- de-dupe / limit spam and is never surfaced in the UI. This block is safe to
-- re-run on an existing project.
create table if not exists public.player_feedback (
  id          text        primary key,
  subject_id  text        not null,           -- core member id being rated
  rater_id    text        not null,           -- core member id giving feedback
  game_date   text        not null,           -- the shared past game
  performance text        not null check (performance in ('ok', 'good', 'great')),
  strengths   text[]      not null default '{}',
  created_at  timestamptz not null default now(),
  unique (rater_id, subject_id, game_date)
);

create index if not exists feedback_subject_idx on public.player_feedback (subject_id);

alter table public.player_feedback enable row level security;

drop policy if exists "anon all feedback" on public.player_feedback;
create policy "anon all feedback" on public.player_feedback for all using (true) with check (true);
