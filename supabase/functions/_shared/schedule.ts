// Schedule logic shared by the `og` and `poll-cron` Edge Functions.
//
// Edge Functions run in UTC, but "Thursday 7:30pm" is in the team's local
// timezone. We therefore resolve "now" in TEAM_TZ (default America/New_York)
// before doing any weekday/time math. Keep the slots in sync with
// src/schedule.js (the browser copy, which can just use local time).
export const SLOTS = [
  { id: "thu", weekday: 4, time: "19:30", location: "Pleasant Park", label: "Thu" },
  { id: "sun", weekday: 0, time: "18:30", location: "Thomas Brooks Park", label: "Sun" },
];
export const OPEN_LEAD_DAYS = 2;
const GRACE_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const TEAM_TZ = Deno.env.get("TEAM_TZ") ?? "America/New_York";

// A Date whose UTC fields equal the wall-clock time in `tz` right now. This lets
// us use getDay()/getHours() (which read UTC in the edge runtime) as if we were
// in the team's timezone. Good to the hour, which is all the schedule needs.
export function tzNow(tz = TEAM_TZ): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

// Offset (ms) between the tz wall clock and real UTC, so we can turn a naive
// tz-local Date back into a correct absolute instant.
function tzOffsetMs(tz = TEAM_TZ) {
  const now = new Date();
  const naive = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  return naive.getTime() - now.getTime();
}

export function nextGame(tz = TEAM_TZ) {
  const from = tzNow(tz);
  const offset = tzOffsetMs(tz);
  const cands = SLOTS.map((slot) => {
    const [h, m] = slot.time.split(":").map(Number);
    const d = new Date(from);
    d.setHours(h, m, 0, 0);
    let add = (slot.weekday - d.getDay() + 7) % 7;
    if (add === 0 && d.getTime() + GRACE_MS <= from.getTime()) add = 7;
    d.setDate(d.getDate() + add);
    return { slot, whenNaive: d };
  });
  cands.sort((a, b) => a.whenNaive.getTime() - b.whenNaive.getTime());
  const { slot, whenNaive } = cands[0];
  // Convert the naive tz-local kickoff to a real UTC instant.
  const kickoff = new Date(whenNaive.getTime() - offset);
  const opensAt = new Date(kickoff.getTime() - OPEN_LEAD_DAYS * DAY_MS);
  return { slot, date: ymd(whenNaive), kickoff, opensAt };
}

export function prettyTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function prettyDay(date: Date, tz = TEAM_TZ) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: tz,
  });
}
