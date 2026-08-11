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

// Every device must agree on which game is "next", because `date` is the key
// votes are stored under. Computing that from the device's own timezone means a
// phone set to another zone lands in a DIFFERENT bucket — its owner sees their
// own vote while the group never does. So resolve "now" in the team's timezone
// (matching lib/edge-schedule.js) instead of the device's.
export const TEAM_TZ = "America/New_York";

// A Date whose fields read as team-local wall-clock time. Formatting it without
// a timeZone option gives those same fields back, so display stays correct.
function teamNow(now = new Date()) {
  return new Date(now.toLocaleString("en-US", { timeZone: TEAM_TZ }));
}

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
  const from = teamNow(now);
  const cands = SLOTS.map((slot) => ({ slot, when: nextOccurrence(slot, from) }));
  cands.sort((a, b) => a.when - b.when);
  const { slot, when } = cands[0];
  return {
    slotId: slot.id,
    date: ymd(when),
    when,
    weekday: slot.label,
    time: slot.time,
    location: slot.location,
  };
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

// Weekday and month/day separately, so the hero can break the line on purpose
// instead of wrapping mid-date.
export function dateParts(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return {
    weekday: dt.toLocaleDateString(undefined, { weekday: "long" }),
    monthDay: dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
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
