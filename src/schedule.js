// Recurring game slots. `weekday` follows JS Date.getDay(): 0 = Sunday … 6 = Sat.
// These are the *defaults*; the organizer can override time/location per game via
// the poll (stored in game_meta), which the UI layers on top of these.
export const SLOTS = [
  { id: "thu", weekday: 4, time: "19:30", location: "Pleasant Park", label: "Thursday" },
  { id: "sun", weekday: 0, time: "06:30", location: "Thomas Brooks Park", label: "Sunday" },
];

// Keep a game "current" for a few hours after kickoff so people arriving late (or
// the organizer) still land on today's poll rather than jumping to next week.
const GRACE_MS = 3 * 60 * 60 * 1000;

// The poll for a game opens this many days before kickoff. Before that the
// landing shows a teaser ("RSVP opens …") instead of the vote buttons. The
// cron auto-opens it; a person can also open it early ("Open RSVP now").
export const OPEN_LEAD_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// The next datetime this slot lands on, at or after `from` (minus grace).
function nextOccurrence(slot, from) {
  const [h, m] = slot.time.split(":").map(Number);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  let add = (slot.weekday - d.getDay() + 7) % 7;
  // If today's the day but kickoff (+grace) has already passed, roll a week.
  if (add === 0 && d.getTime() + GRACE_MS <= from.getTime()) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

// The closest upcoming game across all slots. `date` (local YYYY-MM-DD) is the
// stable key used to group votes/guests in the store.
export function getNextGame(now = new Date()) {
  const cands = SLOTS.map((slot) => ({ slot, when: nextOccurrence(slot, now) }));
  cands.sort((a, b) => a.when - b.when);
  const { slot, when } = cands[0];
  return {
    slotId: slot.id,
    date: ymd(when),
    when,
    opensAt: new Date(when.getTime() - OPEN_LEAD_DAYS * DAY_MS),
    weekday: slot.label,
    time: slot.time,
    location: slot.location,
  };
}

// The next game's poll is always open: `getNextGame` rolls to the next slot the
// moment the previous game ends (kickoff + grace), so RSVP for whatever's next
// is open right away — e.g. Sunday's poll is open on Friday, once Thursday's
// game is done. There is always exactly one open poll.
export function isPollOpen() {
  return true;
}

// Whole days until `date` (rounded up, never negative) — for "in 2 days".
export function daysUntil(date, now = new Date()) {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / DAY_MS));
}

// "Fri, Jul 17" from a Date.
export function prettyDay(date) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

// Merge a game_meta override (time/location/note) onto the schedule default.
export function applyMeta(game, meta) {
  if (!meta) return game;
  return {
    ...game,
    time: meta.time || game.time,
    location: meta.location || game.location,
    note: meta.note || null,
  };
}

// "Thursday, Jul 23" for headers/previews.
export function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

// "7:30 PM" from "19:30".
export function prettyTime(t) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

// "Pickup · Thu, Jul 23 · Pleasant Park · 7:30 PM" — the game's display name,
// used in the poll header and the shared link preview. `game` should be the
// meta-merged object (so overridden time/location show).
export function gameName(game) {
  return `Pickup · ${prettyDay(game.when)} · ${game.location} · ${prettyTime(game.time)}`;
}
