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
import { CORE_SQUAD } from "./squad.js";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const hasRemote = Boolean(URL && ANON);

const supabase = hasRemote ? createClient(URL, ANON) : null;

function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "g-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const today = () => new Date().toISOString().slice(0, 10);

// New members get a generated id rather than `core-<name>`: that prefix belongs
// to the thirty-six the squad was seeded with, and two people called Sunil
// would collide on it.
const memberId = (name) =>
  `m-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

const asMember = (r) => ({ id: r.id, name: r.name, active: r.active !== false, core: true });
const asCollection = (r) => ({
  id: r.id,
  title: r.title,
  targetCents: r.target_cents,
  perPersonCents: r.per_person_cents,
  note: r.note,
  openedOn: r.opened_on,
  closed: Boolean(r.closed),
});
const asContribution = (r) => ({
  id: r.id,
  collectionId: r.collection_id,
  memberId: r.member_id,
  amountCents: r.amount_cents,
  note: r.note,
  paidOn: r.paid_on,
});

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

  // NOTE: supabase-js reports failures via `error` instead of rejecting, so
  // every write must check it — otherwise a flaky connection drops the write
  // silently and the UI can't tell the user to retry.
  async setVote(date, { memberId, memberName, status, deviceId }) {
    // Votes are the one write we can't afford to lose, and phones on park wifi
    // drop requests routinely — retry a couple of times before giving up.
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((r) => setTimeout(r, 400 * attempt));
      const { error } = await supabase.from("votes").upsert(
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
      if (!error) return;
      lastError = error;
    }
    throw new Error(lastError?.message || "vote failed to save");
  },

  async clearVote(date, memberId) {
    const { error } = await supabase
      .from("votes")
      .delete()
      .eq("game_date", date)
      .eq("member_id", memberId);
    if (error) throw new Error(error.message);
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
    const { error } = await supabase.from("guests").insert(row);
    if (error) throw new Error(error.message);
    return { id: row.id, name, hostMemberId, hostName, deviceId };
  },

  async removeGuest(date, guestId) {
    const { error } = await supabase.from("guests").delete().eq("id", guestId);
    if (error) throw new Error(error.message);
  },

  async setMeta(date, { time, location, note }) {
    const { error } = await supabase.from("game_meta").upsert(
      { game_date: date, time, location, note, updated_at: new Date().toISOString() },
      { onConflict: "game_date" },
    );
    if (error) throw new Error(error.message);
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

  /* ---- Squad, money, settings ---- */

  async fetchMembers() {
    const { data, error } = await supabase
      .from("members")
      .select("*")
      .order("sort_order")
      .order("name");
    if (error) throw new Error(error.message);
    return (data || []).map(asMember);
  },
  async addMember(name) {
    const row = { id: memberId(name), name: name.trim(), active: true };
    const { error } = await supabase.from("members").insert(row);
    if (error) throw new Error(error.message);
    return asMember(row);
  },
  async updateMember(id, patch) {
    const { error } = await supabase.from("members").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },

  async fetchCollections() {
    const { data, error } = await supabase
      .from("collections")
      .select("*")
      .order("opened_on", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(asCollection);
  },
  async addCollection({ title, targetCents, perPersonCents, note }) {
    const row = {
      id: uid(),
      title,
      target_cents: targetCents ?? null,
      per_person_cents: perPersonCents ?? null,
      note: note || null,
    };
    const { error } = await supabase.from("collections").insert(row);
    if (error) throw new Error(error.message);
    return asCollection({ ...row, opened_on: today(), closed: false });
  },
  async updateCollection(id, patch) {
    const { error } = await supabase.from("collections").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
  },
  async removeCollection(id) {
    const { error } = await supabase.from("collections").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async fetchContributions(collectionId) {
    const { data, error } = await supabase
      .from("contributions")
      .select("*")
      .eq("collection_id", collectionId)
      .order("paid_on", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map(asContribution);
  },
  async addContribution({ collectionId, memberId, amountCents, note, paidOn }) {
    const row = {
      id: uid(),
      collection_id: collectionId,
      member_id: memberId,
      amount_cents: amountCents,
      note: note || null,
      paid_on: paidOn || today(),
    };
    const { error } = await supabase.from("contributions").insert(row);
    if (error) throw new Error(error.message);
    return asContribution(row);
  },
  async removeContribution(id) {
    const { error } = await supabase.from("contributions").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async fetchSetting(key) {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.value ?? null;
  },
  async setSetting(key, value) {
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
  },
};

/* ------------------------------------------------------------------ *
 * Local fallback (localStorage) — single device, cross-tab via events *
 * ------------------------------------------------------------------ */
const LOCAL_EVT = "yolo-store-change";
const localKey = (date) => `yolo.game.${date}`;
const MEMBERS_KEY = "yolo.members.v1";
const COLLECTIONS_KEY = "yolo.collections.v1";
const CONTRIB_KEY = "yolo.contributions.v1";
const SETTINGS_KEY = "yolo.settings.v1";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window, quota — the app still runs, it just won't remember */
  }
}
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

  /* ---- Squad, money, settings: same shapes, one device ---- */

  async fetchMembers() {
    return readJson(MEMBERS_KEY, null) || CORE_SQUAD.map((m) => ({ ...m, active: true }));
  },
  async addMember(name) {
    const list = await local.fetchMembers();
    const m = { id: memberId(name), name: name.trim(), active: true, core: true };
    writeJson(MEMBERS_KEY, [...list, m]);
    return m;
  },
  async updateMember(id, patch) {
    const list = await local.fetchMembers();
    writeJson(
      MEMBERS_KEY,
      list.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    );
  },

  async fetchCollections() {
    return readJson(COLLECTIONS_KEY, []);
  },
  async addCollection({ title, targetCents, perPersonCents, note }) {
    const c = {
      id: uid(),
      title,
      targetCents: targetCents ?? null,
      perPersonCents: perPersonCents ?? null,
      note: note || null,
      openedOn: today(),
      closed: false,
    };
    writeJson(COLLECTIONS_KEY, [c, ...readJson(COLLECTIONS_KEY, [])]);
    return c;
  },
  async updateCollection(id, patch) {
    writeJson(
      COLLECTIONS_KEY,
      readJson(COLLECTIONS_KEY, []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  },
  async removeCollection(id) {
    writeJson(
      COLLECTIONS_KEY,
      readJson(COLLECTIONS_KEY, []).filter((c) => c.id !== id),
    );
    writeJson(
      CONTRIB_KEY,
      readJson(CONTRIB_KEY, []).filter((c) => c.collectionId !== id),
    );
  },

  async fetchContributions(collectionId) {
    return readJson(CONTRIB_KEY, []).filter((c) => c.collectionId === collectionId);
  },
  async addContribution({ collectionId, memberId: mid, amountCents, note, paidOn }) {
    const c = {
      id: uid(),
      collectionId,
      memberId: mid,
      amountCents,
      note: note || null,
      paidOn: paidOn || today(),
    };
    writeJson(CONTRIB_KEY, [c, ...readJson(CONTRIB_KEY, [])]);
    return c;
  },
  async removeContribution(id) {
    writeJson(
      CONTRIB_KEY,
      readJson(CONTRIB_KEY, []).filter((c) => c.id !== id),
    );
  },

  async fetchSetting(key) {
    return readJson(SETTINGS_KEY, {})[key] ?? null;
  },
  async setSetting(key, value) {
    writeJson(SETTINGS_KEY, { ...readJson(SETTINGS_KEY, {}), [key]: value });
  },
};

const store = hasRemote ? remote : local;
export default store;
