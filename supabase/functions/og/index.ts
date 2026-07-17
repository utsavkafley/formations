// Supabase Edge Function: live link-preview for the shared poll.
//
// Share THIS function's URL in the group chat, e.g.
//   https://YOUR-PROJECT.functions.supabase.co/og
// When a chat/crawler unfurls it, it renders Open Graph tags with the live
// game + tally ("Thu 7:30 PM · Pleasant Park — 12 IN, 3 OUT"), or a "RSVP opens
// <day>" teaser before the poll opens. Real browsers are redirected on to the
// app so people land on the RSVP screen.
//
// Deploy:  supabase functions deploy og --no-verify-jwt
// Set the app URL it redirects to:
//   supabase secrets set APP_URL=https://your-app-host
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { nextGame, prettyTime, prettyDay, TEAM_TZ } from "../_shared/schedule.ts";

const APP_URL = Deno.env.get("APP_URL") ?? "/";

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!),
  );
}

Deno.serve(async () => {
  const g = nextGame(TEAM_TZ);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );

  const [votesRes, guestsRes, metaRes] = await Promise.all([
    supabase.from("votes").select("status").eq("game_date", g.date),
    supabase.from("guests").select("id", { count: "exact", head: true }).eq("game_date", g.date),
    supabase.from("game_meta").select("*").eq("game_date", g.date).maybeSingle(),
  ]);

  const votes = votesRes.data ?? [];
  const inCount = votes.filter((v) => v.status === "in").length;
  const outCount = votes.filter((v) => v.status === "out").length;
  const guestCount = guestsRes.count ?? 0;

  const meta = metaRes.data;
  const time = meta?.time || g.slot.time;
  const location = meta?.location || g.slot.location;
  const open = Boolean(meta?.opened_manually) || Date.now() >= g.opensAt.getTime();

  const title = `⚽ ${g.slot.label} ${prettyTime(time)} · ${location}`;
  const desc = open
    ? `${inCount + guestCount} IN · ${outCount} OUT — tap to mark yourself IN or OUT` +
      (meta?.note ? ` (${meta.note})` : "")
    : `RSVP opens ${prettyDay(g.opensAt)} — tap to see the next game`;

  // Bots want the meta; humans get redirected to the app.
  const html = `<!doctype html><html><head>
<meta charset="utf-8" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(desc)}" />
<meta property="og:image" content="${esc(APP_URL)}/og-default.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta http-equiv="refresh" content="0; url=${esc(APP_URL)}" />
</head><body>Redirecting to the RSVP… <a href="${esc(APP_URL)}">open</a></body></html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=30" },
  });
});
