// Schedule logic shared by the Vercel edge runtimes (middleware.js and
// api/og.js). Both are bundled by Vercel, so a plain relative import works.
// Keep the slots in sync with src/schedule.js (browser) and
// supabase/functions/_shared/schedule.ts (Deno cron).
//
// Edge runs in UTC, but "Thursday 7:30 PM" is the team's local time — resolve
// "now" in TEAM_TZ before any weekday/time math.
export const TZ = process.env.TEAM_TZ || "America/New_York";

export const SLOTS = [
  { id: "thu", weekday: 4, time: "19:30", location: "Pleasant Park" },
  { id: "sun", weekday: 0, time: "06:30", location: "Thomas Brooks Park" },
];

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
    const [h, m] = s.time.split(":").map(Number);
    const d = new Date(from);
    d.setHours(h, m, 0, 0);
    let add = (s.weekday - d.getDay() + 7) % 7;
    if (add === 0 && d.getTime() + GRACE_MS <= from.getTime()) add = 7;
    d.setDate(d.getDate() + add);
    return { slot: s, when: d };
  });
  cands.sort((a, b) => a.when - b.when);
  const { slot, when } = cands[0];
  return { slot, date: ymd(when), when };
}

export function prettyTime(t) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export function shortDay(d) {
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: TZ });
}
