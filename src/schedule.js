import { sunriseLocalHM, ceilToStep, clampHM } from "../lib/sunrise.js";

// Recurring game slots. `weekday` follows JS Date.getDay(): 0 = Sunday … 6 = Sat.
// These are the *defaults*; the organizer can override time/location per game via
// the poll (stored in game_meta), which the UI layers on top of these.
// Both pitches are in the same town, so one set of coordinates answers "when
// is it light?" for either of them — the difference between the two fields is
// well under a minute of sunrise.
export const PITCH = { lat: 35.8008, lon: -78.8617 };

export const SLOTS = [
  { id: "thu", weekday: 4, time: "19:30", location: "Pleasant Park", label: "Thursday" },
  {
    id: "sun",
    weekday: 0,
    time: "06:30",
    location: "Thomas Brooks Park",
    label: "Sunday",
    // The Sunday morning game follows the sun: see slotTimeOn below. `time`
    // stays as the fallback for a date sunrise can't be computed for.
    sunrise: { earliest: "06:30", latest: "07:30" },
  },
];

// A morning slot's kickoff for one particular date: the first quarter hour at
// or after sunrise over that pitch. In June that would be 6:00, which nobody
// asked for, and just before Christmas it would be 7:30 — hence the window on
// the slot. Between those the time drifts with the season, so the winter games
// kick off in daylight instead of fifty minutes before it.
//
// The organizer's per-game override (game_meta.time, applied in applyMeta)
// still beats whatever this returns.
export function slotTimeOn(slot, date) {
  if (!slot.sunrise) return slot.time;
  const rise = sunriseLocalHM(date.getFullYear(), date.getMonth() + 1, date.getDate(), {
    ...PITCH,
    tz: TEAM_TZ,
  });
  if (!rise) return slot.time;
  return clampHM(ceilToStep(rise, 15), slot.sunrise.earliest, slot.sunrise.latest);
}

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
// Kickoff is resolved per candidate date, because a sunrise-following slot is
// at a different time this week than next.
function nextOccurrence(slot, from) {
  let add = (slot.weekday - from.getDay() + 7) % 7;
  for (let i = 0; i < 2; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + add);
    const [h, m] = slotTimeOn(slot, d).split(":").map(Number);
    d.setHours(h, m, 0, 0);
    // If today's the day but kickoff (+grace) has already passed, roll a week.
    if (d.getTime() + GRACE_MS > from.getTime()) return d;
    add += 7;
  }
  return null;
}

// Dev only: set `localStorage.yoloPretendNow` to an ISO date/time and the app
// treats that as the current moment, so the week's other game can be looked at
// without waiting for it. `import.meta.env.DEV` is false in a production
// build, so this folds away to null there.
function pretendNow() {
  if (!import.meta.env?.DEV) return null;
  try {
    const raw = localStorage.getItem("yoloPretendNow");
    const at = raw && new Date(raw);
    return at && !Number.isNaN(at.getTime()) ? at : null;
  } catch {
    return null;
  }
}

// The closest upcoming game across all slots. `date` (local YYYY-MM-DD) is the
// stable key used to group votes/guests in the store.
export function getNextGame(now = pretendNow() || new Date()) {
  const from = teamNow(now);
  const cands = SLOTS.map((slot) => ({ slot, when: nextOccurrence(slot, from) })).filter(
    (c) => c.when,
  );
  cands.sort((a, b) => a.when - b.when);
  const { slot, when } = cands[0];
  return {
    slotId: slot.id,
    date: ymd(when),
    when,
    weekday: slot.label,
    time: slotTimeOn(slot, when),
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
