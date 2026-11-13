# YOLO Formation — poll setup

The site opens on the **next game's RSVP poll** (`/`). Squad members mark
**IN / OUT**, optionally add a **guest**, and everyone's answers accrete in a
shared database — no login. On game day the organizer opens **`/build`** to
balance teams and export the formation, pre-loaded with whoever RSVP'd IN.

## 1. Run it now (local-only)

```bash
npm install
npm run dev
```

With no Supabase keys the app works but stores votes in `localStorage` only —
great for trying it, but votes are **not** shared across devices. A yellow
banner on the poll reminds you of this.

## 2. Make it shared (Supabase)

1. Create a free project at <https://supabase.com>.
2. In the SQL editor, paste and run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy `.env.example` → `.env.local` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (Project Settings → API).
4. Restart `npm run dev`. Votes now sync live across every device.

Identity is login-free: each device keeps a random id and the name you pick,
so your IN/OUT choice sticks to you on return visits.

## 2b. Contributions and the organizer passcode

`/money` shows what the group has put in: the current collection (what it is
for, the total it needs, the share per head), a meter, and the people who have
paid. Only them — a list of all thirty-six with dashes against most of it reads
as a wall of people who haven't. Everyone can read the page; it is linked from
the banknote in the poll's top-right corner.

Changing anything needs the **organizer passcode**. The way in is the faint
banknote in the top-right corner of the poll, then the dot in the corner of
`/money`. A browser stays signed in for 30 days; tapping **Organizer** signs it
out.

**Set the passcode once, in Supabase.** This repository is public, so the
passcode is not in it and never should be — pick one and run:

```bash
node scripts/passcode.mjs "the passcode you want"
```

That prints a single `insert` holding a salted PBKDF2 hash. Paste it into the
Supabase SQL editor. The hash is not a secret (the app reads that table with
the anon key); the passcode is, and it stays on your machine. Until this is
run, the sign-in dialog says so rather than offering to set one — an earlier
version let the first person through claim it, which made the lock
first-come-first-served.

After that, **Passcode** at the bottom of the organizer tools changes it
without going back to SQL.

An organizer can:

- start a collection and close it, and switch between past ones
- set the amount per person, then mark people down by dragging their name into
  the **Contributed** box — or tapping it, which does the same thing. Both,
  because this gets used on a phone beside a pitch. Dropping a name records the
  per-person amount; the `×` on a name in the box takes it back off.
- add players and fix names on **`/squad`**, linked from the organizer tools

**What the passcode is and is not.** It gates the screen, not the database.
This app has no login and talks to Supabase with the anon key, so the tables
stay writable by anyone who opens devtools — exactly as the votes always have
been. What it buys is that thirty-six people see figures they cannot change by
accident. That is the right size of lock for a football kitty and the wrong one
for anything that matters to someone outside the group; making it real means
Supabase Auth accounts and policies keyed on `auth.uid()`. The passcode itself
is stored as a PBKDF2-SHA256 hash (210k iterations, random salt) rather than a
bare digest, because the row holding it is world-readable.

The squad also moves into the database with this (`members`, seeded with
exactly the ids the hardcoded list used, so every vote and rating already
recorded still points at the right person). `src/squad.js` stays as the
fallback the app shows while the fetch is in flight, or if Supabase is
unreachable.

## 3. Live link previews in group chats

Handled automatically by [`middleware.js`](middleware.js) — a Vercel Edge
Middleware that ships with your normal `git push` (no separate deploy). When a
chat app unfurls the plain link, it returns Open Graph tags naming the next
game with live counts, e.g.
`Pickup · Thu, Jul 23 · Pleasant Park · 7:30 PM` / `12 in · 3 out — tap to RSVP`.
Real browsers fall straight through to the app.

It reads the **same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`** you already
set in Vercel (available to the edge runtime regardless of the `VITE_` prefix),
so there's nothing extra to configure. Optional: set a `TEAM_TZ` env var in
Vercel (default `America/New_York`) so "Thursday 7:30 PM" resolves in your
timezone.

**Test it:** paste `https://yoloformation.vercel.app` into
<https://www.opengraph.xyz> (or a real group chat), or run
`curl -A "Twitterbot" https://yoloformation.vercel.app` and check the `<meta>` tags.

## 4. Auto-open the poll + keep the project alive (cron)

A free Supabase project pauses after ~7 days idle. One scheduled Edge Function
solves both that and rolling the poll forward:

```bash
supabase functions deploy poll-cron --no-verify-jwt
supabase secrets set TEAM_TZ=America/New_York   # your local timezone
```

Then schedule it (every 6 hours) — either run
[`supabase/cron.sql`](supabase/cron.sql) (fill in your project URL + anon key),
or use **Dashboard → Integrations → Cron** to POST to the function URL.

The cron's remaining job is to **keep the project awake** (its scheduled HTTP
call is real API activity) and mark finished games `closed`. It runs in UTC, so
it resolves "Thursday 7:30 PM" in `TEAM_TZ` first.

### Poll opening

The **next game's poll is always open** — there's always exactly one, and it
flips to the next slot the moment the previous game ends (kickoff + ~3h grace).
So Sunday's RSVP is already open on Friday, once Thursday's game is done. No
teaser, no waiting.

## Schedule

Defaults live in three in-sync copies (browser, Vercel edge, Deno cron) —
update all when the schedule changes:
[`src/schedule.js`](src/schedule.js),
[`lib/edge-schedule.js`](lib/edge-schedule.js) (shared by `middleware.js` and
`api/og.js`),
[`supabase/functions/_shared/schedule.ts`](supabase/functions/_shared/schedule.ts).

- **Thursday 7:30 PM** — Pleasant Park
- **Sunday 6:30 AM** — Thomas Brooks Park

The poll always shows the closest upcoming slot, and stays on a game until ~3h
after kickoff before rolling to the next. Time / location / a note can be
changed per-game from the poll's **edit** link (also login-free).
