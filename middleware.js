// Vercel Edge Middleware — dynamic link previews for the shared root URL.
//
// When a chat app / crawler unfurls https://<your-app>/, we return HTML whose
// Open Graph tags name the next game with live counts, e.g.
//   "Pickup · Thu, Jul 23 · Pleasant Park · 7:30 PM"  /  "12 in · 3 out — tap to RSVP"
// Real browsers fall straight through to the SPA (next()), so humans are
// unaffected. Reads the same VITE_SUPABASE_* env vars you already set in Vercel
// (they're available to the runtime here regardless of the VITE_ prefix).
import { next } from "@vercel/edge";

export const config = { matcher: "/" };

const TZ = process.env.TEAM_TZ || "America/New_York";
const SLOTS = [
  { id: "thu", weekday: 4, time: "19:30", location: "Pleasant Park", label: "Thu" },
  { id: "sun", weekday: 0, time: "18:30", location: "Thomas Brooks Park", label: "Sun" },
];
const GRACE = 3 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const LEAD = 2;

// Crawlers that fetch a page just to build a link preview.
const BOT =
  /facebookexternalhit|Twitterbot|Slackbot|WhatsApp|Discordbot|TelegramBot|LinkedInBot|Pinterest|redditbot|Googlebot|bingbot|SkypeUriPreview|vkShare|Applebot|embedly|Iframely|opengraph|MetaInspector|facebot/i;

function tzNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nextGame() {
  const from = tzNow();
  const cands = SLOTS.map((s) => {
    const [h, m] = s.time.split(":").map(Number);
    const d = new Date(from);
    d.setHours(h, m, 0, 0);
    let add = (s.weekday - d.getDay() + 7) % 7;
    if (add === 0 && d.getTime() + GRACE <= from.getTime()) add = 7;
    d.setDate(d.getDate() + add);
    return { slot: s, when: d };
  });
  cands.sort((a, b) => a.when - b.when);
  const { slot, when } = cands[0];
  return { slot, date: ymd(when), when, opensAt: new Date(when.getTime() - LEAD * DAY) };
}
function prettyTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}
function prettyDay(d) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export default async function middleware(request) {
  const ua = request.headers.get("user-agent") || "";
  if (!BOT.test(ua)) return next(); // humans → the real app

  const g = nextGame();
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY;

  let meta = null;
  let inCount = 0;
  let outCount = 0;
  let guestCount = 0;
  if (url && key) {
    try {
      const headers = { apikey: key, Authorization: `Bearer ${key}` };
      const [vr, gr, mr] = await Promise.all([
        fetch(`${url}/rest/v1/votes?select=status&game_date=eq.${g.date}`, { headers }),
        fetch(`${url}/rest/v1/guests?select=id&game_date=eq.${g.date}`, { headers }),
        fetch(`${url}/rest/v1/game_meta?select=time,location,note,opened_manually&game_date=eq.${g.date}`, { headers }),
      ]);
      const votes = await vr.json();
      const guests = await gr.json();
      const metas = await mr.json();
      if (Array.isArray(votes)) {
        inCount = votes.filter((v) => v.status === "in").length;
        outCount = votes.filter((v) => v.status === "out").length;
      }
      if (Array.isArray(guests)) guestCount = guests.length;
      if (Array.isArray(metas) && metas[0]) meta = metas[0];
    } catch {
      // fall back to schedule-only preview
    }
  }

  const time = meta?.time || g.slot.time;
  const location = meta?.location || g.slot.location;
  const open = Boolean(meta?.opened_manually) || Date.now() >= g.opensAt.getTime();

  const title = `Pickup · ${prettyDay(g.when)} · ${location} · ${prettyTime(time)}`;
  const desc = open
    ? `${inCount + guestCount} in · ${outCount} out — tap to mark yourself IN or OUT` +
      (meta?.note ? ` (${meta.note})` : "")
    : `RSVP opens ${prettyDay(g.opensAt)} — tap to see the next game`;
  const origin = new URL(request.url).origin;

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<title>${esc(title)}</title>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="YOLO Formation"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:url" content="${esc(origin)}/"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(desc)}"/>
</head><body>${esc(title)} — ${esc(desc)}</body></html>`;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60" },
  });
}
