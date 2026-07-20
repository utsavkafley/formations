// Shared poll store. When Supabase env vars are present it reads/writes a shared
// database (so votes from everyone's devices accrete in one place, no login).
// Without them it transparently falls back to localStorage so the app still runs
// in dev / on a single device.
//
// Public API (all async, all keyed by a game `date` = local YYYY-MM-DD):
//   fetchGame(date)                          -> { votes, guests, meta }
//   setVote(date, {memberId, memberName, status, deviceId})
//   clearVote(date, memberId)
//   addGuest(date, {name, hostMemberId, hostName, deviceId})   -> guest
//   removeGuest(date, guestId)
//   setMeta(date, {time, location, note})
//   subscribe(date, cb)                      -> unsubscribe()
//   addFeedback({subjectId, raterId, gameDate, performance, strengths})
//   fetchAttendedGames(memberId, beforeDate) -> [gameDate] desc
//   fetchAttendees(gameDate)                 -> [{memberId, memberName}] (status in)
//   fetchAllFeedback()                       -> [row]
//
// Shape:
//   votes: { [memberId]: { status: 'in'|'out', name, deviceId } }
//   guests: [ { id, name, hostMemberId, hostName, deviceId } ]
//   meta:  { time, location, note } | null
import { createClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const hasRemote = Boolean(URL && ANON);

const supabase = hasRemote ? createClient(URL, ANON) : null;

function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "g-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/* ------------------------------------------------------------------ *
 * Remote implementation (Supabase)                                    *
 * ------------------------------------------------------------------ */
const remote = {
  async fetchGame(date) {
    const [votesRes, guestsRes, metaRes] = await Promise.all([
      supabase.from("votes").select("*").eq("game_date", date),
      supabase.from("guests").select("*").eq("game_date", date),
      supabase.from("game_meta").select("*").eq("game_date", date).maybeSingle(),
    ]);
    // supabase-js reports connectivity/auth/schema problems as `error` rather
    // than rejecting — surface it so the UI can show a "can't reach DB" banner.
    const err = votesRes.error || guestsRes.error || metaRes.error;
    if (err) throw new Error(err.message || "database unreachable");
    const votes = {};
    for (const r of votesRes.data || []) {
      votes[r.member_id] = { status: r.status, name: r.member_name, deviceId: r.device_id };
    }
    const guests = (guestsRes.data || []).map((r) => ({
      id: r.id,
      name: r.name,
      hostMemberId: r.host_member_id,
      hostName: r.host_name,
      deviceId: r.device_id,
    }));
    const m = metaRes.data;
    const meta = m ? { time: m.time, location: m.location, note: m.note } : null;
    return { votes, guests, meta };
  },

  async setVote(date, { memberId, memberName, status, deviceId }) {
    await supabase.from("votes").upsert(
      {
        game_date: date,
        member_id: memberId,
        member_name: memberName,
        status,
        device_id: deviceId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "game_date,member_id" },
    );
  },

  async clearVote(date, memberId) {
    await supabase.from("votes").delete().eq("game_date", date).eq("member_id", memberId);
  },

  async addGuest(date, { name, hostMemberId, hostName, deviceId }) {
    const row = {
      id: uid(),
      game_date: date,
      name,
      host_member_id: hostMemberId,
      host_name: hostName,
      device_id: deviceId,
    };
    await supabase.from("guests").insert(row);
    return { id: row.id, name, hostMemberId, hostName, deviceId };
  },

  async removeGuest(date, guestId) {
    await supabase.from("guests").delete().eq("id", guestId);
  },

  async setMeta(date, { time, location, note }) {
    await supabase.from("game_meta").upsert(
      { game_date: date, time, location, note, updated_at: new Date().toISOString() },
      { onConflict: "game_date" },
    );
  },

  // ---- Peer feedback (Phase 1) ----
  async addFeedback({ subjectId, raterId, gameDate, performance, strengths }) {
    const id = `${raterId}|${subjectId}|${gameDate}`; // deterministic → re-answers upsert
    const { error } = await supabase.from("player_feedback").upsert(
      { id, subject_id: subjectId, rater_id: raterId, game_date: gameDate, performance, strengths },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
  },
  async fetchAttendedGames(memberId, beforeDate) {
    const { data, error } = await supabase
      .from("votes")
      .select("game_date")
      .eq("member_id", memberId)
      .eq("status", "in")
      .lt("game_date", beforeDate)
      .order("game_date", { ascending: false })
      .limit(6);
    if (error) throw new Error(error.message);
    return (data || []).map((r) => r.game_date);
  },
  async fetchAttendees(gameDate) {
    const { data, error } = await supabase
      .from("votes")
      .select("member_id, member_name")
      .eq("game_date", gameDate)
      .eq("status", "in");
    if (error) throw new Error(error.message);
    return (data || []).map((r) => ({ memberId: r.member_id, memberName: r.member_name }));
  },
  async fetchAllFeedback() {
    const { data, error } = await supabase.from("player_feedback").select("*");
    if (error) throw new Error(error.message);
    return data || [];
  },

  subscribe(date, cb) {
    const filter = `game_date=eq.${date}`;
    const ch = supabase
      .channel(`game:${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "votes", filter }, cb)
      .on("postgres_changes", { event: "*", schema: "public", table: "guests", filter }, cb)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_meta", filter }, cb)
      .subscribe();
    return () => supabase.removeChannel(ch);
  },
};

/* ------------------------------------------------------------------ *
 * Local fallback (localStorage) — single device, cross-tab via events *
 * ------------------------------------------------------------------ */
const LOCAL_EVT = "yolo-store-change";
const localKey = (date) => `yolo.game.${date}`;
const FEEDBACK_KEY = "yolo.feedback.v1";
const GAME_PREFIX = "yolo.game.";

function readFeedback() {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY)) || [];
  } catch {
    return [];
  }
}

function readLocal(date) {
  try {
    return JSON.parse(localStorage.getItem(localKey(date))) || { votes: {}, guests: [], meta: null };
  } catch {
    return { votes: {}, guests: [], meta: null };
  }
}
function writeLocal(date, data) {
  localStorage.setItem(localKey(date), JSON.stringify(data));
  window.dispatchEvent(new CustomEvent(LOCAL_EVT, { detail: date }));
}

const local = {
  async fetchGame(date) {
    return readLocal(date);
  },
  async setVote(date, { memberId, memberName, status, deviceId }) {
    const d = readLocal(date);
    d.votes[memberId] = { status, name: memberName, deviceId };
    writeLocal(date, d);
  },
  async clearVote(date, memberId) {
    const d = readLocal(date);
    delete d.votes[memberId];
    writeLocal(date, d);
  },
  async addGuest(date, { name, hostMemberId, hostName, deviceId }) {
    const d = readLocal(date);
    const guest = { id: uid(), name, hostMemberId, hostName, deviceId };
    d.guests.push(guest);
    writeLocal(date, d);
    return guest;
  },
  async removeGuest(date, guestId) {
    const d = readLocal(date);
    d.guests = d.guests.filter((g) => g.id !== guestId);
    writeLocal(date, d);
  },
  async setMeta(date, { time, location, note }) {
    const d = readLocal(date);
    d.meta = { ...(d.meta || {}), time, location, note };
    writeLocal(date, d);
  },
  // ---- Peer feedback (Phase 1) ----
  async addFeedback({ subjectId, raterId, gameDate, performance, strengths }) {
    const id = `${raterId}|${subjectId}|${gameDate}`;
    const rows = readFeedback().filter((r) => r.id !== id);
    rows.push({ id, subject_id: subjectId, rater_id: raterId, game_date: gameDate, performance, strengths, created_at: new Date().toISOString() });
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(rows));
  },
  async fetchAttendedGames(memberId, beforeDate) {
    const games = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(GAME_PREFIX)) continue;
      const date = k.slice(GAME_PREFIX.length);
      if (date >= beforeDate) continue;
      try {
        const d = JSON.parse(localStorage.getItem(k));
        if (d?.votes?.[memberId]?.status === "in") games.push(date);
      } catch {
        /* skip */
      }
    }
    return games.sort().reverse().slice(0, 6);
  },
  async fetchAttendees(gameDate) {
    try {
      const d = JSON.parse(localStorage.getItem(localKey(gameDate))) || {};
      return Object.entries(d.votes || {})
        .filter(([, v]) => v.status === "in")
        .map(([id, v]) => ({ memberId: id, memberName: v.name }));
    } catch {
      return [];
    }
  },
  async fetchAllFeedback() {
    return readFeedback();
  },
  subscribe(date, cb) {
    const onLocal = (e) => {
      if (e.detail === date) cb();
    };
    const onStorage = (e) => {
      if (e.key === localKey(date)) cb();
    };
    window.addEventListener(LOCAL_EVT, onLocal);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LOCAL_EVT, onLocal);
      window.removeEventListener("storage", onStorage);
    };
  },
};

const store = hasRemote ? remote : local;
export default store;
