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
