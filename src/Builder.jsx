import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import store from "./store.js";
import { getNextGame } from "./schedule.js";
import { CORE_SQUAD } from "./squad.js";
import { TEAM_COLORS, DEFAULT_KITS } from "./kits.js";
import { ratingIndex, formLevels } from "./rating.js";
import Crest from "./Crest.jsx";
import { FormChevrons } from "./Glyphs.jsx";

const SQUAD_KEY = "formations.squad.v1";
const FORMS_KEY = "formations.forms.v1"; // { [id]: "great" } — Good is the baseline
const AREAS_KEY = "formations.areas.v1"; // { [id]: "ATT" | "DEF" } — MID is the baseline
const SNAP = 0.03; // alignment snap threshold (fraction of pitch)
let guestId = 1;

const AREAS = ["DEF", "MID", "ATT"];
// How much a ★ is worth on top of a player's standing. The ★ used to be the
// only signal the balancer had; now it means "on form today" over a baseline
// the squad's own ratings already set, so it nudges rather than decides.
const ON_FORM = 1.3;

// How the split came out, in words. An odd number of players is the thing this
// has to get right: with ten against nine the extra body is worth about five
// per cent of the pitch on its own, so a gap that size is not the balancer
// failing, it is arithmetic. Calling it "lopsided" would send the organizer
// pressing the button over and over for a split that does not exist.
function Evenness({ gap, a, b }) {
  const pct = gap * 100;
  const uneven = a !== b;
  let tone = "even";
  let text;
  if (uneven) {
    tone = "near";
    text = `${a} v ${b} — as even as an odd number allows, ${pct.toFixed(0)}% apart`;
  } else if (pct <= 2) {
    text = `Even — sides within ${pct.toFixed(1)}%`;
  } else if (pct <= 5) {
    tone = "near";
    text = `Near enough — ${pct.toFixed(0)}% apart`;
  } else {
    tone = "off";
    text = `Lopsided — ${pct.toFixed(0)}% apart. Press Balance again for another split.`;
  }
  return <div className={`evenness ${tone}`}>{text}</div>;
}

function contrastText(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#111" : "#fff";
}

// Auto position label from where the shirt sits on the team's half.
// y: 0 = opponent goal (top / attack), 1 = own goal (bottom / GK).
// x: 0 = left touchline, 1 = right touchline.
function autoTag(x, y) {
  if (y >= 0.84) return "GK";
  const left = x < 0.22;
  const right = x > 0.78;
  if (y < 0.3) {
    // attack
    if (left) return "LW";
    if (right) return "RW";
    return y < 0.14 ? "CF" : "ST";
  }
  if (y < 0.58) {
    // midfield — depth within the band picks AM / CM / CDM
    if (left) return "LM";
    if (right) return "RM";
    const f = (y - 0.3) / (0.58 - 0.3);
    if (f < 0.34) return "AM";
    if (f > 0.66) return "CDM";
    return "CM";
  }
  // defense
  if (left) return y < 0.67 ? "LWB" : "LB";
  if (right) return y < 0.67 ? "RWB" : "RB";
  return "CB";
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch {
    return {};
  }
}

// Snap a value to a nearby reference (for tidy rows/columns).
function snap(val, refs) {
  for (const r of refs) if (Math.abs(val - r) < SNAP) return r;
  return val;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Split the coming players into two balanced teams. Primary goal: near-equal
// total skill. Secondary: spread DEF/MID/ATT evenly.
//
// `jitter` is what keeps the button honest. When the only weights were 1.0 and
// 1.8 almost everybody tied, so the shuffle above the sort genuinely re-rolled
// the split and pressing Balance again gave you a different fair side. Peer
// ratings are distinct floats, which made the sort total and the whole thing
// deterministic — press it twice and you got the same teams, which is useless
// at 9:40 when somebody says "that's not fair, do it again". A small random
// nudge on the sort key lets players of similar standing swap places while
// still keeping the strong away from the weak.
function balance(coming, getWeight, getArea, jitter = 0) {
  const noise = () => (jitter ? (Math.random() - 0.5) * jitter : 0);
  const key = new Map(coming.map((p) => [p.id, getWeight(p.id) + noise()]));
  const ordered = shuffle(coming).sort((a, b) => key.get(b.id) - key.get(a.id));
  const team = { A: [], B: [] };
  const weight = { A: 0, B: 0 };
  const areaCount = { A: { DEF: 0, MID: 0, ATT: 0 }, B: { DEF: 0, MID: 0, ATT: 0 } };
  for (const p of ordered) {
    const area = getArea(p.id);
    // Pick the lighter team; break ties by who needs this area, then size.
    let pick;
    if (weight.A !== weight.B) {
      pick = weight.A < weight.B ? "A" : "B";
    } else if (areaCount.A[area] !== areaCount.B[area]) {
      pick = areaCount.A[area] < areaCount.B[area] ? "A" : "B";
    } else {
      pick = team.A.length <= team.B.length ? "A" : "B";
    }
    team[pick].push(p);
    weight[pick] += getWeight(p.id);
    areaCount[pick][area] += 1;
  }
  return team;
}

// How far apart two sides are, as a share of the whole. The organizer never
// sees the raw totals — a gap of 0.02 means nothing to anyone — but the
// fraction is what decides whether a split is worth offering.
function splitGap(split, getWeight) {
  const tot = (side) => side.reduce((n, p) => n + getWeight(p.id), 0);
  const a = tot(split.A);
  const b = tot(split.B);
  const all = a + b;
  return all ? Math.abs(a - b) / all : 0;
}

// Several near-equal splits rather than one, so pressing Balance again has
// something to show. Candidates within a shade of the best are kept and sorted
// fairest-first; the caller walks the list on repeated presses.
function balanceOptions(coming, getWeight, getArea, tries = 32) {
  const seen = new Map();
  for (let i = 0; i < tries; i++) {
    const split = balance(coming, getWeight, getArea, i === 0 ? 0 : 0.09);
    const ids = split.A.map((p) => p.id)
      .sort()
      .join(",");
    if (seen.has(ids)) continue;
    seen.set(ids, { split, gap: splitGap(split, getWeight) });
  }
  const options = [...seen.values()].sort((x, y) => x.gap - y.gap);
  const best = options[0]?.gap ?? 0;
  // Within one and a half points of the fairest, or a flat 1% when the fairest
  // is already dead even — otherwise a perfect split would reject every
  // alternative and we would be back to one answer.
  const tol = Math.max(best * 1.5, 0.01);
  return options.filter((o) => o.gap <= tol);
}

// Lay a team's players onto its half by usual area, spreading each line out.
// Returns a map id -> {x, y}. A keeper is assigned when the side has >= 5,
// preferring a less-standout defender so the best players stay outfield.
function layoutTeam(teamPlayers, getArea, getWeight) {
  const lines = { DEF: [], MID: [], ATT: [] };
  teamPlayers.forEach((p) => lines[getArea(p.id)].push(p));

  let gk = null;
  if (teamPlayers.length >= 5) {
    const pool = lines.DEF.length ? lines.DEF : lines.MID.length ? lines.MID : lines.ATT;
    // Prefer a "Good" keeper over a "Great" one.
    let gkIdx = 0;
    pool.forEach((p, i) => {
      if (getWeight(p.id) < getWeight(pool[gkIdx].id)) gkIdx = i;
    });
    gk = pool.splice(gkIdx, 1)[0];
  }

  const Y = { ATT: 0.18, MID: 0.42, DEF: 0.66, GK: 0.9 };
  const pos = {};
  const placeLine = (arr, y) => {
    arr.forEach((p, i) => {
      const x = arr.length === 1 ? 0.5 : 0.12 + (0.76 * i) / (arr.length - 1);
      pos[p.id] = { x, y };
    });
  };
  placeLine(lines.ATT, Y.ATT);
  placeLine(lines.MID, Y.MID);
  placeLine(lines.DEF, Y.DEF);
  if (gk) pos[gk.id] = { x: 0.5, y: Y.GK };
  return pos;
}

export default function Builder({ onNavigate }) {
  const [squad, setSquad] = useState([]); // [{id, name}]
  // present players: {id, name, team, x, y, tag} — tag null = auto label
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [teams, setTeams] = useState({
    A: { name: "Home", color: DEFAULT_KITS.home.value },
    B: { name: "Away", color: DEFAULT_KITS.away.value },
  });
  const [dragId, setDragId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(null); // 'A' | 'B' | 'bench'
  const [ghost, setGhost] = useState(null); // floating drag preview { name, color, x, y }
  const pendingRef = useRef(null); // in-flight pointer drag data
  const nextSplit = useRef(0); // which of the near-equal splits the next press shows
  const [splitGapPct, setSplitGap] = useState(null);
  const [editId, setEditId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  // Lazy-init from localStorage so the values are present on first render and
  // the persistence effects below don't clobber them on mount.
  const [forms, setForms] = useState(() => readJSON(FORMS_KEY)); // { id: "great" }
  const [areas, setAreas] = useState(() => readJSON(AREAS_KEY)); // { id: "ATT" | "DEF" }
  const pitchRef = useRef(null);

  // Load saved guests from localStorage and merge with the core squad. The
  // core list comes from the database so anyone an organizer has added shows
  // up here too — without it a new member could RSVP on the poll and then be
  // quietly dropped on the way to the teamsheet. The hardcoded list is the
  // floor while the fetch is in flight or if it fails.
  const [core, setCore] = useState(CORE_SQUAD);
  useEffect(() => {
    let alive = true;
    store
      .fetchMembers()
      .then((ms) => {
        const live = ms.filter((m) => m.active !== false);
        if (alive && live.length) setCore(live);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SQUAD_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      // Filter out any stale core entries that may have been saved before
      // the hardcoded squad was introduced.
      const guests = parsed.filter((m) => !m.core);
      setSquad([...core, ...guests]);
    } catch {
      setSquad(core);
    }
  }, [core]);

  // Pre-load from the poll: whoever marked IN (plus their guests) comes in as
  // "coming today" so the organizer just balances and builds.
  useEffect(() => {
    let alive = true;
    (async () => {
      const game = getNextGame();
      const d = await store.fetchGame(game.date);
      if (!alive) return;
      const inIds = new Set(
        Object.entries(d.votes)
          .filter(([, v]) => v.status === "in")
          .map(([id]) => id),
      );
      const guestMembers = d.guests.map((g) => ({ id: `pg-${g.id}`, name: g.name, core: false }));
      const mk = (id, nm) => ({ id, name: nm, team: null, x: 0.5, y: 0.5, tag: null });
      const coming = [
        ...core.filter((m) => inIds.has(m.id)).map((m) => mk(m.id, m.name)),
        ...guestMembers.map((g) => mk(g.id, g.name)),
      ];
      setSquad((s) => {
        const have = new Set(s.map((m) => m.id));
        return [...s, ...guestMembers.filter((g) => !have.has(g.id))];
      });
      setPlayers((prev) => {
        const have = new Set(prev.map((p) => p.id));
        return [...prev, ...coming.filter((c) => !have.has(c.id))];
      });
    })();
    return () => {
      alive = false;
    };
  }, [core]);

  // Persist form/area tweaks so they carry to next session.
  useEffect(() => {
    localStorage.setItem(FORMS_KEY, JSON.stringify(forms));
  }, [forms]);
  useEffect(() => {
    localStorage.setItem(AREAS_KEY, JSON.stringify(areas));
  }, [areas]);

  const getForm = (id) => forms[id] || "good";
  const getArea = (id) => areas[id] || "MID";

  // What the squad has said about each other over the season. Best-effort: if
  // it can't be fetched the index is empty, every weight falls back to the
  // baseline, and the balancer splits on areas and the ★ alone — which is
  // exactly what it did before any of this existed.
  const [ratings, setRatings] = useState(() => ratingIndex([]));
  const [chevrons, setChevrons] = useState(() => new Map());
  useEffect(() => {
    let alive = true;
    store
      .fetchAllFeedback()
      .then((rows) => {
        if (!alive) return;
        setRatings(ratingIndex(rows));
        setChevrons(formLevels(rows));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // The scores bunch up: shrinking toward the mean leaves almost the whole
  // squad between 0.8 and 1.6 out of 2, so a bar drawn against 0..2 moved
  // about seven pixels across the entire group and every mid player looked
  // identical. Drawn against half a point either side of the group's own
  // average instead, the same differences fill the track.
  const barFill = (score) => {
    const lo = ratings.prior - 0.5;
    const hi = ratings.prior + 0.5;
    return Math.max(4, Math.min(100, ((score - lo) / (hi - lo)) * 100));
  };

  const getWeight = (id) =>
    (ratings.index.get(id)?.weight ?? ratings.baseline) * (getForm(id) === "great" ? ON_FORM : 1);

  function toggleForm(id) {
    setForms((f) => ({ ...f, [id]: getForm(id) === "great" ? "good" : "great" }));
  }
  function cycleArea(id) {
    const next = AREAS[(AREAS.indexOf(getArea(id)) + 1) % AREAS.length];
    setAreas((a) => ({ ...a, [id]: next }));
  }

  function saveSquad() {
    // Only persist guests (non-core) — core squad is always in the code.
    const guests = squad.filter((m) => !m.core);
    localStorage.setItem(SQUAD_KEY, JSON.stringify(guests));
    setSavedNote(true);
    setTimeout(() => setSavedNote(false), 1800);
  }

  function addSquadMember(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = `g${guestId++}-${Date.now()}`;
    const guest = { id, name: trimmed, core: false };
    setSquad((s) => [...s, guest]);
    // Guests default to "coming today".
    setPlayers((p) => [
      ...p,
      { id, name: trimmed, team: null, x: 0.5, y: 0.5, tag: null },
    ]);
    setName("");
  }

  function removeSquadMember(id) {
    // Core members can't be permanently removed, only unchecked.
    setSquad((s) => s.filter((m) => m.id !== id));
    setPlayers((p) => p.filter((pl) => pl.id !== id));
  }

  const isComing = (id) => players.some((p) => p.id === id);

  function toggleComing(member) {
    if (isComing(member.id)) {
      setPlayers((p) => p.filter((pl) => pl.id !== member.id));
    } else {
      setPlayers((p) => [
        ...p,
        { id: member.id, name: member.name, team: null, x: 0.5, y: 0.5, tag: null },
      ]);
    }
  }

  // Tick everyone, or clear all if everyone is already in. Keeps existing
  // placements for those already coming.
  function toggleSelectAll() {
    setPlayers((prev) => {
      const allIn = squad.length > 0 && squad.every((m) => prev.some((p) => p.id === m.id));
      if (allIn) return [];
      const existing = new Map(prev.map((p) => [p.id, p]));
      return squad.map(
        (m) =>
          existing.get(m.id) || {
            id: m.id,
            name: m.name,
            team: null,
            x: 0.5,
            y: 0.5,
            tag: null,
          },
      );
    });
  }

  function setTeamField(team, field, value) {
    setTeams((t) => ({ ...t, [team]: { ...t[team], [field]: value } }));
  }

  // Place a player onto a team's half at (x,y), snapping to align with
  // teammates already placed. Moving to a new zone clears a manual override so
  // the label returns to auto for the new zone.
  function placeOnField(id, team, x, y) {
    setPlayers((prev) => {
      const others = prev.filter((p) => p.id !== id && p.team === team);
      const sx = snap(
        x,
        others.map((p) => p.x),
      );
      const sy = snap(
        y,
        others.map((p) => p.y),
      );
      return prev.map((p) => {
        if (p.id !== id) return p;
        const movedZone =
          p.team !== team || autoTag(p.x, p.y) !== autoTag(sx, sy);
        return { ...p, team, x: sx, y: sy, tag: movedZone ? null : p.tag };
      });
    });
  }

  function benchPlayer(id) {
    setPlayers((p) =>
      p.map((pl) => (pl.id === id ? { ...pl, team: null, tag: null } : pl)),
    );
  }

  function setOverride(id, tag) {
    setPlayers((p) =>
      p.map((pl) => (pl.id === id ? { ...pl, tag: tag || null } : pl)),
    );
    setEditId(null);
  }

  // Auto-split everyone who's coming into two balanced teams and drop them
  // into formation. Re-run for a different fair split.
  function balanceTeams() {
    setPlayers((prev) => {
      if (prev.length < 2) return prev;
      const options = balanceOptions(prev, getWeight, getArea);
      const pick = options[nextSplit.current % options.length];
      nextSplit.current += 1;
      const split = pick.split;
      setSplitGap({
        gap: pick.gap,
        a: split.A.length,
        b: split.B.length,
      });
      const posA = layoutTeam(split.A, getArea, getWeight);
      const posB = layoutTeam(split.B, getArea, getWeight);
      const teamOf = {};
      const posOf = {};
      split.A.forEach((p) => ((teamOf[p.id] = "A"), (posOf[p.id] = posA[p.id])));
      split.B.forEach((p) => ((teamOf[p.id] = "B"), (posOf[p.id] = posB[p.id])));
      return prev.map((p) => ({
        ...p,
        team: teamOf[p.id],
        x: posOf[p.id].x,
        y: posOf[p.id].y,
        tag: null, // let labels derive from the new positions
      }));
    });
  }

  function clearField() {
    setPlayers((p) => p.map((pl) => ({ ...pl, team: null, tag: null })));
  }

  function endDrag() {
    setDragId(null);
    setDragging(false);
    setHover(null);
    setGhost(null);
  }

  // --- Unified pointer drag (mouse + touch) ---------------------------------
  // A press starts a "pending" drag. On the scrollable squad list a touch must
  // long-press to begin (so quick swipes still scroll); elsewhere a small move
  // threshold starts it. Once dragging, a floating ghost follows the pointer
  // and the drop target is found with elementFromPoint.
  function startPress(e, info) {
    if (e.button != null && e.button > 0) return; // ignore non-primary mouse
    const longPress = e.pointerType === "touch" && info.source === "bench";
    pendingRef.current = {
      ...info,
      startX: e.clientX,
      startY: e.clientY,
      pointerType: e.pointerType,
      started: false,
      timer: longPress
        ? setTimeout(() => activateDrag(e.clientX, e.clientY), 220)
        : null,
    };
  }

  function activateDrag(cx, cy) {
    const p = pendingRef.current;
    if (!p || p.started) return;
    p.started = true;
    setDragId(p.id);
    setDragging(true);
    setGhost({ name: p.name, color: p.color, x: cx, y: cy });
    updateHover(cx, cy);
  }

  function updateHover(cx, cy) {
    const el = document.elementFromPoint(cx, cy);
    if (el && el.closest(".field")) setHover(el.closest(".field").dataset.team);
    else if (el && el.closest(".squad-list")) setHover("bench");
    else setHover(null);
  }

  function dropAt(cx, cy) {
    const p = pendingRef.current;
    if (!p) return;
    const el = document.elementFromPoint(cx, cy);
    const field = el && el.closest(".field");
    if (field) {
      const rect = field.getBoundingClientRect();
      const x = clamp((cx - rect.left) / rect.width, 0.05, 0.95);
      const y = clamp((cy - rect.top) / rect.height, 0.04, 0.96);
      placeOnField(p.id, field.dataset.team, x, y);
    } else if (el && el.closest(".squad-list")) {
      benchPlayer(p.id);
    }
  }

  // Window-level move/up listeners; pendingRef keeps per-drag data so these
  // closures stay valid for the component's lifetime.
  useEffect(() => {
    function move(e) {
      const p = pendingRef.current;
      if (!p) return;
      const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
      if (!p.started) {
        if (p.pointerType === "touch" && p.source === "bench") {
          if (dist > 10) {
            // moved before long-press fired → treat as a scroll, cancel
            clearTimeout(p.timer);
            pendingRef.current = null;
          }
          return;
        }
        if (dist > 6) activateDrag(e.clientX, e.clientY);
        return;
      }
      e.preventDefault();
      setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
      updateHover(e.clientX, e.clientY);
    }
    function up(e) {
      const p = pendingRef.current;
      if (!p) return;
      if (p.timer) clearTimeout(p.timer);
      if (p.started) {
        dropAt(e.clientX, e.clientY);
        endDrag();
      }
      pendingRef.current = null;
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function exportImage() {
    if (!pitchRef.current) return;
    setEditId(null);
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 50));
      const dataUrl = await toPng(pitchRef.current, {
        pixelRatio: 2,
        backgroundColor: "#35716a",
      });
      const link = document.createElement("a");
      link.download = `formation-${teams.A.name}-vs-${teams.B.name}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Export failed", err);
      alert("Sorry, the image export failed. See console for details.");
    } finally {
      setExporting(false);
    }
  }

  const placedCount = (team) => players.filter((p) => p.team === team).length;
  const comingCount = players.length;
  const allComing = squad.length > 0 && comingCount >= squad.length;

  // Signed-up players (those coming) float to the top so the organizer sees
  // who's in first. Stable sort keeps each group's original order.
  const orderedSquad = [...squad].sort(
    (a, b) => (isComing(b.id) ? 1 : 0) - (isComing(a.id) ? 1 : 0),
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="squad-head">
          <button className="link-btn back-link" onClick={() => onNavigate("/")}>
            ← Poll
          </button>
          {squad.some((m) => !m.core) && (
            <button className="save-btn" onClick={saveSquad}>
              {savedNote ? "✓ Saved" : "Save guests"}
            </button>
          )}
        </div>
        <h1>
          <Crest size={28} />
          YOLO Formation
        </h1>

        <div className="squad-head">
          <span>Squad</span>
        </div>

        <form className="add-form" onSubmit={addSquadMember}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Add guest player…"
            aria-label="Guest player name"
          />
          <button type="submit">Add</button>
        </form>

        <div className="coming-line">
          <span className="muted">Tick who's coming today</span>
          <span className="muted">{comingCount} in</span>
        </div>

        <div className="squad-cols">
          <input
            type="checkbox"
            className="select-all-box"
            ref={(el) => {
              if (el) el.indeterminate = comingCount > 0 && !allComing;
            }}
            checked={allComing}
            onChange={toggleSelectAll}
            aria-label="Select all players"
            title={allComing ? "Clear all" : "Select all"}
          />
          <span className="col-name">Name</span>
          <span className="col-rated">Rated</span>
          <span className="col-form">Form</span>
          <span className="col-pos">Position</span>
        </div>
        {/* The only non-hover explanation of either mark. `title` tooltips do
            not fire on a phone, which is the device this is used on. */}
        <div className="squad-legend">
          Bar is what the squad rates them. ★ is on form today, and counts extra.
        </div>

        <div className={`squad-list ${hover === "bench" ? "drop-hover" : ""}`}>
          {orderedSquad.map((m) => {
            const coming = isComing(m.id);
            const player = players.find((p) => p.id === m.id);
            const placed = player && player.team != null;
            const great = getForm(m.id) === "great";
            const area = getArea(m.id);
            const rated = ratings.index.get(m.id);
            const score = rated ? rated.score : ratings.prior;
            return (
              <div key={m.id} className={`squad-row ${coming ? "" : "out"}`}>
                <input
                  type="checkbox"
                  checked={coming}
                  onChange={() => toggleComing(m)}
                  aria-label={`${m.name} coming today`}
                />
                <span
                  className={`squad-name ${
                    coming && !placed ? "draggable" : ""
                  } ${placed ? "on-field" : ""}`}
                  onPointerDown={
                    coming && !placed
                      ? (e) =>
                          startPress(e, {
                            id: m.id,
                            name: m.name,
                            color: "#7c8c8a",
                            source: "bench",
                          })
                      : undefined
                  }
                  title={
                    placed
                      ? "On field"
                      : coming
                        ? "Drag onto a team (press & hold on touch)"
                        : undefined
                  }
                >
                  {placed && <span className="on-dot" />}
                  {m.name}
                </span>
                {/* What the squad's own ratings say, so the balancer is not
                    working off numbers nobody can see. Faint when there is
                    little behind it — two ratings and five are not the same
                    claim, and the bar says so without a second column. */}
                <span
                  className={`rate-chip ${rated ? "" : "none"}`}
                  title={
                    rated
                      ? `${rated.n} rating${rated.n === 1 ? "" : "s"} from the squad — average ${rated.raw.toFixed(1)} of 2`
                      : "Not rated yet — the balancer treats them as average"
                  }
                >
                  {rated && <span className="rate-fill" style={{ width: `${barFill(score)}%` }} />}
                </span>
                <FormChevrons level={chevrons.get(m.id)} />
                <button
                  className={`form-toggle ${great ? "great" : ""}`}
                  title={great ? "On form today — click to clear" : "Mark as on form today"}
                  onClick={() => toggleForm(m.id)}
                >
                  {great ? "★" : "☆"}
                </button>
                <button
                  className={`area-chip area-${area}`}
                  title="Usual area — click to cycle DEF / MID / ATT"
                  onClick={() => cycleArea(m.id)}
                >
                  {area}
                </button>
                {!m.core && (
                  <button
                    className="squad-x"
                    title="Remove guest"
                    onClick={() => removeSquadMember(m.id)}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="hint">
          Tick who's here, set each player's usual area and ★ whoever is on form,
          then hit <b>Balance teams</b> for two fair sides — or drag people on
          manually (press &amp; hold on touch). Drop back here to bench.
        </p>
      </aside>

      <main className="main">
        {splitGapPct && <Evenness {...splitGapPct} />}

        <div className="toolbar">
          {["A", "B"].map((team) => (
            <div className="team-control" key={team}>
              <input
                className="team-name"
                value={teams[team].name}
                onChange={(e) => setTeamField(team, "name", e.target.value)}
                aria-label={`Team ${team} name`}
              />
              <span
                className="swatch"
                style={{ background: teams[team].color }}
              />
              <select
                value={teams[team].color}
                onChange={(e) => setTeamField(team, "color", e.target.value)}
                aria-label={`Team ${team} color`}
              >
                {TEAM_COLORS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <div className="toolbar-actions">
            <button
              className="balance-btn"
              onClick={balanceTeams}
              disabled={comingCount < 2}
              title="Auto-split everyone who's coming into two balanced teams"
            >
              ⚖ Balance teams
            </button>
            <button
              className="ghost-btn"
              onClick={clearField}
              disabled={players.every((p) => p.team == null)}
            >
              Clear
            </button>
            <button
              className="export-btn"
              onClick={exportImage}
              disabled={exporting}
            >
              {exporting ? "Exporting…" : "⬇ Save as image"}
            </button>
          </div>
        </div>

        <div
          className={`pitch-wrap ${exporting ? "exporting" : ""}`}
          ref={pitchRef}
        >
          {["A", "B"].map((team) => (
            <Pitch
              key={team}
              team={team}
              meta={teams[team]}
              count={placedCount(team)}
              players={players}
              dragging={dragging}
              dragId={dragId}
              isHover={hover === team}
              onTokenPress={startPress}
              editId={editId}
              setEditId={setEditId}
              onOverride={setOverride}
            />
          ))}
        </div>
      </main>

      {ghost && (
        <div
          className="drag-ghost"
          style={{ left: ghost.x, top: ghost.y }}
          aria-hidden="true"
        >
          <div className="jersey">
            <Jersey color={ghost.color} />
          </div>
          <span className="token-name">{ghost.name}</span>
        </div>
      )}
    </div>
  );
}

function Pitch({
  team,
  meta,
  count,
  players,
  dragging,
  dragId,
  isHover,
  onTokenPress,
  editId,
  setEditId,
  onOverride,
}) {
  const text = contrastText(meta.color);
  const placed = players.filter((p) => p.team === team);
  // Alignment guides reference teammates other than the one being dragged.
  const guides = placed.filter((p) => p.id !== dragId);

  return (
    <div className="pitch">
      <div className="pitch-header" style={{ borderColor: meta.color }}>
        <span className="dot" style={{ background: meta.color }} />
        <span className="pitch-title">{meta.name}</span>
        <span className="muted">{count} players</span>
      </div>
      <div
        data-team={team}
        className={`field ${dragging ? "dragging" : ""} ${
          isHover ? "field-hover" : ""
        }`}
      >
        <PitchMarkings />
        {dragging && (
          <div className="guides">
            {guides.map((p) => (
              <div
                key={`v${p.id}`}
                className="guide-v"
                style={{ left: `${p.x * 100}%` }}
              />
            ))}
            {guides.map((p) => (
              <div
                key={`h${p.id}`}
                className="guide-h"
                style={{ top: `${p.y * 100}%` }}
              />
            ))}
          </div>
        )}
        {placed.map((p) => (
          <PlayerToken
            key={p.id}
            player={p}
            tag={p.tag || autoTag(p.x, p.y)}
            isOverride={!!p.tag}
            color={meta.color}
            text={text}
            editing={editId === p.id}
            onPointerDown={(e) =>
              onTokenPress(e, {
                id: p.id,
                name: p.name,
                color: meta.color,
                source: "field",
              })
            }
            onClick={() => setEditId(p.id)}
            onCommit={(t) => onOverride(p.id, t)}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerToken({
  player,
  tag,
  isOverride,
  color,
  text,
  editing,
  onPointerDown,
  onClick,
  onCommit,
}) {
  return (
    <div
      className="token"
      style={{ left: `${player.x * 100}%`, top: `${player.y * 100}%` }}
      onPointerDown={onPointerDown}
    >
      <div
        className={`jersey ${isOverride ? "override" : ""}`}
        onClick={onClick}
        title="Click to override position label"
      >
        <Jersey color={color} />
        {editing ? (
          <input
            className="jersey-tag-input"
            autoFocus
            defaultValue={player.tag || ""}
            placeholder={tag}
            maxLength={4}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => onCommit(e.target.value.trim().toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.target.blur();
              if (e.key === "Escape") onCommit(player.tag || "");
            }}
          />
        ) : (
          <span className="jersey-tag" style={{ color: text }}>
            {tag}
          </span>
        )}
      </div>
      <span className="token-name">{player.name}</span>
    </div>
  );
}

function Jersey({ color }) {
  return (
    <svg className="jersey-svg" viewBox="0 0 64 58" aria-hidden="true">
      <path
        fill={color}
        stroke="rgba(0,0,0,0.28)"
        strokeWidth="1"
        d="M24 4 L18 4 L3 14 L10 28 L18 22 L18 54 L46 54 L46 22 L54 28 L61 14 L46 4 L40 4 C40 13 24 13 24 4 Z"
      />
      <path fill="#ffffff" d="M18 4 L3 14 L8 24 L18 18 Z" />
      <path fill="#ffffff" d="M46 4 L61 14 L56 24 L46 18 Z" />
      <path fill="#ffffff" d="M24 4 C24 12 40 12 40 4 L37 3 C37 9 27 9 27 3 Z" />
    </svg>
  );
}

function PitchMarkings() {
  const line = "rgba(255,255,255,0.6)";
  return (
    <svg
      className="markings"
      viewBox="0 0 300 460"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g fill="none" stroke={line} strokeWidth="2">
        <rect x="8" y="8" width="284" height="444" />
        <line x1="8" y1="230" x2="292" y2="230" />
        <circle cx="150" cy="230" r="40" />
        <circle cx="150" cy="230" r="2" fill={line} />
        <rect x="75" y="8" width="150" height="60" />
        <rect x="110" y="8" width="80" height="26" />
        <path d="M118 68 A40 40 0 0 0 182 68" />
        <rect x="75" y="392" width="150" height="60" />
        <rect x="110" y="426" width="80" height="26" />
        <path d="M118 392 A40 40 0 0 1 182 392" />
      </g>
    </svg>
  );
}
