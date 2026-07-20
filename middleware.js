// Vercel Edge Middleware — dynamic link previews for the shared root URL.
//
// For every request to "/", we fetch the built index.html and swap the generic
// OG title/description/image for ones naming the next game, e.g.
//   "Pickup · Thu, Jul 23 · Pleasant Park · 7:30 PM"
// Injecting for *all* user-agents (not just detected bots) means every chat app
// and preview tool gets the right card, while humans still receive the full
// working SPA (only <head> meta is touched). Any failure falls through to the
// unmodified app, so this can't take the site down.
import { next } from "@vercel/edge";

export const config = { matcher: "/" };

const TZ = process.env.TEAM_TZ || "America/New_York";
const SLOTS = [
  { id: "thu", weekday: 4, time: "19:30", location: "Pleasant Park" },
  { id: "sun", weekday: 0, time: "06:30", location: "Thomas Brooks Park" },
];
const GRACE = 3 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const LEAD = 2;

const tzNow = () => new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function nextGame() {
  const from = tzNow();
  const cands = SLOTS.map((s) => {
    const [hh, mm] = s.time.split(":").map(Number);
    const d = new Date(from);
    d.setHours(hh, mm, 0, 0);
    let add = (s.weekday - d.getDay() + 7) % 7;
    if (add === 0 && d.getTime() + GRACE <= from.getTime()) add = 7;
    d.setDate(d.getDate() + add);
    return { slot: s, when: d };
  });
  cands.sort((a, b) => a.when - b.when);
  const { slot, when } = cands[0];
  return { slot, date: ymd(when), when, opensAt: new Date(when.getTime() - LEAD * DAY) };
}
const prettyTime = (t) => {
  const [hh, mm] = t.split(":").map(Number);
  return `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh >= 12 ? "PM" : "AM"}`;
};
const shortDay = (d) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// The exact strings baked into index.html that we replace at the edge.
const GEN_TITLE = "Pickup — Next game RSVP";
const GEN_DESC = "Tap to mark yourself IN or OUT for the next pickup game.";

export default async function middleware(request) {
  try {
    const origin = new URL(request.url).origin;
    // Fetch the static shell (matcher only covers "/", so this doesn't recurse).
    const res = await fetch(`${origin}/index.html`, { headers: { "x-og": "1" } });
    if (!res.ok) return next();
    let html = await res.text();

    const g = nextGame();
    const title = `Pickup · ${shortDay(g.when)} · ${g.slot.location} · ${prettyTime(g.slot.time)}`;
    const desc = "Tap to mark yourself IN or OUT for the next pickup game.";
    const img = `${origin}/api/og`;

    // Exact-string swaps: match → replace, miss → no-op (never corrupts the doc).
    html = html
      .replaceAll(GEN_TITLE, esc(title))
      .replaceAll(GEN_DESC, esc(desc))
      .replaceAll('content="/api/og"', `content="${esc(img)}"`);

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=120",
      },
    });
  } catch {
    return next();
  }
}
