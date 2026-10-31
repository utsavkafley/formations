// Schedule logic shared by the Vercel edge runtimes (middleware.js and
// api/og.js). Both are bundled by Vercel, so a plain relative import works.
// Keep the slots in sync with src/schedule.js (browser) and
// supabase/functions/_shared/schedule.ts (Deno cron).
//
// Edge runs in UTC, but "Thursday 7:30 PM" is the team's local time — resolve
// "now" in TEAM_TZ before any weekday/time math.
import { sunriseLocalHM, ceilToStep, clampHM } from "./sunrise.js";

export const TZ = process.env.TEAM_TZ || "America/New_York";

// Both pitches are in the same town — one set of coordinates covers either.
export const PITCH = { lat: 35.8008, lon: -78.8617 };

export const SLOTS = [
  { id: "thu", weekday: 4, time: "19:30", location: "Pleasant Park" },
  {
    id: "sun",
    weekday: 0,
    time: "06:30",
    location: "Thomas Brooks Park",
    // Morning kickoff follows the sun — see slotTimeOn.
    sunrise: { earliest: "06:30", latest: "07:30" },
  },
];

// First quarter hour at or after sunrise over that pitch, held inside the
// slot's window. Mirrors slotTimeOn in src/schedule.js.
export function slotTimeOn(slot, date) {
  if (!slot.sunrise) return slot.time;
  const rise = sunriseLocalHM(date.getFullYear(), date.getMonth() + 1, date.getDate(), {
    ...PITCH,
    tz: TZ,
  });
  if (!rise) return slot.time;
  return clampHM(ceilToStep(rise, 15), slot.sunrise.earliest, slot.sunrise.latest);
}

// A game stays "current" until kickoff + grace, then rolls to the next slot.
const GRACE_MS = 3 * 60 * 60 * 1000;

export function tzNow() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
}

function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The closest upcoming game. `date` is the local YYYY-MM-DD key used by the
// shared store; `when` is a naive tz-local Date for display formatting.
export function nextGame() {
  const from = tzNow();
  const cands = SLOTS.map((s) => {
    // Resolved per candidate date: a sunrise-following slot sits at a
    // different time this week than next.
    let add = (s.weekday - from.getDay() + 7) % 7;
    for (let i = 0; i < 2; i++) {
      const d = new Date(from);
      d.setDate(d.getDate() + add);
      const [h, m] = slotTimeOn(s, d).split(":").map(Number);
      d.setHours(h, m, 0, 0);
      if (d.getTime() + GRACE_MS > from.getTime()) return { slot: s, when: d };
      add += 7;
    }
    return null;
  }).filter(Boolean);
  cands.sort((a, b) => a.when - b.when);
  const { slot, when } = cands[0];
  return { slot, date: ymd(when), when, time: slotTimeOn(slot, when) };
}

export function prettyTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function shortDay(d) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
}
