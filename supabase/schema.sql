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

-- ---- Squad, money, and the admin passcode ----
-- Three things the organizers maintain and everyone else reads: who is in the
-- squad, what has been collected toward the costs, and the passcode that marks
-- a browser as an organizer.
--
-- A WORD ON WHAT THIS DOES NOT DO. The policies below stay open, exactly like
-- the ones above, because the app has no login and talks to Supabase with the
-- anon key. The passcode gates the UI, not the database: anyone who opens
-- devtools can write these tables whichever way the screen is showing them.
-- That is a deliberate choice for a thirty-six-person football group where the
-- worst case is a wrong figure somebody can fix, and it is the wrong choice
-- the moment this data matters to anyone outside it. Making it real means
-- Supabase Auth accounts and policies keyed on `auth.uid()`, which is a
-- different shape of change, not a bigger version of this one.

-- The squad. Seeded with exactly the ids the hardcoded list used, because
-- every vote and every rating already in this database points at them by those
-- strings — `votes.member_id`, `player_feedback.subject_id`. New members added
-- from the app get a generated id instead.
create table if not exists public.members (
  id         text        primary key,
  name       text        not null,
  active     boolean     not null default true,
  -- The squad has an order the group recognises — the regulars who organise it
  -- first, then the rest — and the poll has always listed it that way. Sorting
  -- by name instead would reshuffle a list people are used to reading, so the
  -- order is carried explicitly. New members land after everyone else.
  sort_order integer     not null default 1000,
  created_at timestamptz not null default now()
);

alter table public.members add column if not exists sort_order integer not null default 1000;

insert into public.members (id, name, sort_order) values
  ('core-amir', 'Amir', 0),
  ('core-deepen', 'Deepen', 1),
  ('core-kevin', 'Kevin', 2),
  ('core-pradin', 'Pradin', 3),
  ('core-rabin', 'Rabin', 4),
  ('core-yagya', 'Yagya', 5),
  ('core-utsav', 'Utsav', 6),
  ('core-anukul', 'Anukul', 7),
  ('core-ashim', 'Ashim', 8),
  ('core-avinash', 'Avinash', 9),
  ('core-ayush', 'Ayush', 10),
  ('core-bijay', 'Bijay', 11),
  ('core-bishal', 'Bishal', 12),
  ('core-chirring', 'Chirring', 13),
  ('core-deeyas', 'Deeyas', 14),
  ('core-dwaipayan', 'Dwaipayan', 15),
  ('core-eakon', 'Eakon', 16),
  ('core-govin', 'Govin', 17),
  ('core-govinda', 'Govinda', 18),
  ('core-nabin', 'Nabin', 19),
  ('core-nirbirodh', 'Nirbirodh', 20),
  ('core-supreme', 'Supreme', 21),
  ('core-raj', 'Raj', 22),
  ('core-rishikesh', 'Rishikesh', 23),
  ('core-roshan', 'Roshan', 24),
  ('core-safal', 'Safal', 25),
  ('core-sailesh', 'Sailesh', 26),
  ('core-sajeeb', 'Sajeeb', 27),
  ('core-salik', 'Salik', 28),
  ('core-saman', 'Saman', 29),
  ('core-sanjay', 'Sanjay', 30),
  ('core-saroj', 'Saroj', 31),
  ('core-shobhit', 'Shobhit', 32),
  ('core-sunil', 'Sunil', 33),
  ('core-suresh', 'Suresh', 34),
  ('core-vijaya', 'Vijaya', 35)
on conflict (id) do nothing;

-- A round of fundraising. The group raises a lump occasionally to cover the
-- pitch and the kit, so each round carries both numbers people actually quote:
-- the total it needs to reach and the share per head.
create table if not exists public.collections (
  id               text        primary key,
  title            text        not null,
  target_cents     integer,
  per_person_cents integer,
  note             text,
  opened_on        date        not null default current_date,
  closed           boolean     not null default false,
  created_at       timestamptz not null default now()
);

-- One payment. Money is whole cents in an integer: a running total of dollars
-- held as floats drifts, and this one gets summed on every page load.
create table if not exists public.contributions (
  id            text        primary key,
  collection_id text        not null references public.collections (id) on delete cascade,
  member_id     text        not null,
  amount_cents  integer     not null,
  note          text,
  paid_on       date        not null default current_date,
  created_at    timestamptz not null default now()
);

create index if not exists contributions_collection_idx on public.contributions (collection_id);
create index if not exists contributions_member_idx     on public.contributions (member_id);

-- Loose key/value for the few settings the app keeps. Today that is one row:
-- `admin_passcode`, holding a PBKDF2-SHA256 hash and its salt. The hash is
-- readable by anyone, which is why it is slow to test against rather than a
-- bare digest of a six-character code.
create table if not exists public.app_settings (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

alter table public.members       enable row level security;
alter table public.collections   enable row level security;
alter table public.contributions enable row level security;
alter table public.app_settings  enable row level security;

drop policy if exists "anon all members"       on public.members;
drop policy if exists "anon all collections"   on public.collections;
drop policy if exists "anon all contributions" on public.contributions;
drop policy if exists "anon all settings"      on public.app_settings;
create policy "anon all members"       on public.members       for all using (true) with check (true);
create policy "anon all collections"   on public.collections   for all using (true) with check (true);
create policy "anon all contributions" on public.contributions for all using (true) with check (true);
create policy "anon all settings"      on public.app_settings  for all using (true) with check (true);

do $$ begin alter publication supabase_realtime add table public.members;       exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.collections;   exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.contributions; exception when duplicate_object then null; end $$;
