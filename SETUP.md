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

## 3. Live link previews in group chats (optional)

So a shared link unfurls as `⚽ Thu 7:30 PM · Pleasant Park — 12 IN · 3 OUT`:

```bash
supabase functions deploy og --no-verify-jwt
supabase secrets set APP_URL=https://your-deployed-app-url
```

Then **share the function URL** in the chat, e.g.
`https://YOUR-PROJECT.functions.supabase.co/og`. Crawlers read the live meta
tags; humans get redirected to the RSVP screen. (Drop an `og-default.png`
preview image in `public/` for the thumbnail.)

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

Each run:

- **Keeps the project awake** — the scheduled HTTP call is real API activity.
- **Opens the poll ~2 days before kickoff** (`status → open`) and marks finished
  games `closed`.

Because it runs in UTC, it resolves "Thursday 7:30 PM" in `TEAM_TZ` first.

### Poll opening, without the cron

The client is self-sufficient: it opens the RSVP on its own once you're within
**2 days** of kickoff. Before that it shows a *"RSVP opens \<day\>"* teaser with
an **Open RSVP now** button to open it early. The cron just persists that state
for the shared DB and the link preview, and keeps the project alive.

## Schedule

Defaults live in [`src/schedule.js`](src/schedule.js) (browser) and
[`supabase/functions/_shared/schedule.ts`](supabase/functions/_shared/schedule.ts)
(server — keep the two in sync):

- **Thursday 7:30 PM** — Pleasant Park
- **Sunday 6:30 PM** — Thomas Brooks Park

The poll always shows the closest upcoming slot, and stays on a game until ~3h
after kickoff before rolling to the next. Time / location / a note can be
changed per-game from the poll's **edit** link (also login-free).
