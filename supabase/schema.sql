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

create policy "anon all votes"  on public.votes     for all using (true) with check (true);
create policy "anon all guests" on public.guests    for all using (true) with check (true);
create policy "anon all meta"   on public.game_meta for all using (true) with check (true);

-- Live updates for the poll (realtime subscription in store.js).
alter publication supabase_realtime add table public.votes;
alter publication supabase_realtime add table public.guests;
alter publication supabase_realtime add table public.game_meta;
