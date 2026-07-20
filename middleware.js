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
import { nextGame, prettyTime, shortDay } from "./lib/edge-schedule.js";

export const config = { matcher: "/" };

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
