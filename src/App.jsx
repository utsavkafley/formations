import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";

const TEAM_COLORS = [
  { name: "Red", value: "#e63946" },
  { name: "Blue", value: "#1d6fe0" },
  { name: "Green", value: "#2a9d3f" },
  { name: "Orange", value: "#f08c00" },
  { name: "Purple", value: "#7048e8" },
  { name: "Teal", value: "#0b8a8a" },
  { name: "Black", value: "#2b2b2b" },
  { name: "Yellow", value: "#f1b000" },
  { name: "Pink", value: "#e64980" },
  { name: "White", value: "#e9ecef" },
];

const SQUAD_KEY = "formations.squad.v1";
const FORMS_KEY = "formations.forms.v1"; // { [id]: "great" } — Good is the baseline
const AREAS_KEY = "formations.areas.v1"; // { [id]: "ATT" | "DEF" } — MID is the baseline
const SNAP = 0.03; // alignment snap threshold (fraction of pitch)
let guestId = 1;

const AREAS = ["DEF", "MID", "ATT"];
// Skill weight used by the team balancer. Everyone is "Good" by default; the
// organizer flips standout players to "Great" on the day.
const FORM_WEIGHT = { good: 1, great: 1.8 };

const CORE_SQUAD = [
  "Amir", "Deepen", "Kevin", "Pradin", "Rabin", "Yagya", "Utsav",
  "Anukul", "Ashim", "Avinash", "Ayush", "Bijay", "Bishal", "Deeyas",
  "Eakon", "Govin", "Govinda", "Mridul", "Nabin", "Nirbirodh", "Supreme",
  "Raj", "Rishikesh", "Roshan", "Safal", "Sailesh", "Sajeeb", "Salik",
  "Saman", "Sanjay", "Saroj", "Shobhit", "Sunil", "Suresh", "Vijaya",
].map((name) => ({ id: `core-${name.toLowerCase()}`, name, core: true }));

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
// total skill (Great weighted heavier). Secondary: spread DEF/MID/ATT evenly.
// Ties are shuffled so re-running gives a different fair split.
function balance(coming, getForm, getArea) {
  const ordered = shuffle(coming).sort(
    (a, b) => FORM_WEIGHT[getForm(b.id)] - FORM_WEIGHT[getForm(a.id)],
  );
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
    weight[pick] += FORM_WEIGHT[getForm(p.id)];
    areaCount[pick][area] += 1;
  }
  return team;
}

// Lay a team's players onto its half by usual area, spreading each line out.
// Returns a map id -> {x, y}. A keeper is assigned when the side has >= 5,
// preferring a less-standout defender so the best players stay outfield.
function layoutTeam(teamPlayers, getArea, getForm) {
  const lines = { DEF: [], MID: [], ATT: [] };
  teamPlayers.forEach((p) => lines[getArea(p.id)].push(p));

  let gk = null;
  if (teamPlayers.length >= 5) {
    const pool = lines.DEF.length ? lines.DEF : lines.MID.length ? lines.MID : lines.ATT;
    // Prefer a "Good" keeper over a "Great" one.
    let gkIdx = 0;
    pool.forEach((p, i) => {
      if (FORM_WEIGHT[getForm(p.id)] < FORM_WEIGHT[getForm(pool[gkIdx].id)]) gkIdx = i;
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

export default function App() {
  const [squad, setSquad] = useState([]); // [{id, name}]
  // present players: {id, name, team, x, y, tag} — tag null = auto label
  const [players, setPlayers] = useState([]);
  const [name, setName] = useState("");
  const [teams, setTeams] = useState({
    A: { name: "Home", color: "#1d6fe0" },
    B: { name: "Away", color: "#e63946" },
  });
  const [dragId, setDragId] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState(null); // 'A' | 'B' | 'bench'
  const [editId, setEditId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [savedNote, setSavedNote] = useState(false);
  // Lazy-init from localStorage so the values are present on first render and
  // the persistence effects below don't clobber them on mount.
  const [forms, setForms] = useState(() => readJSON(FORMS_KEY)); // { id: "great" }
  const [areas, setAreas] = useState(() => readJSON(AREAS_KEY)); // { id: "ATT" | "DEF" }
  const pitchRef = useRef(null);

  // Load saved guests from localStorage and merge with hardcoded core squad.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SQUAD_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      // Filter out any stale core entries that may have been saved before
      // the hardcoded squad was introduced.
      const guests = parsed.filter((m) => !m.core);
      setSquad([...CORE_SQUAD, ...guests]);
    } catch {
      setSquad(CORE_SQUAD);
    }
  }, []);

  // Persist form/area tweaks so they carry to next session.
  useEffect(() => {
    localStorage.setItem(FORMS_KEY, JSON.stringify(forms));
  }, [forms]);
  useEffect(() => {
    localStorage.setItem(AREAS_KEY, JSON.stringify(areas));
  }, [areas]);

  const getForm = (id) => forms[id] || "good";
  const getArea = (id) => areas[id] || "MID";

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

  // Drop the dragged player onto a team's half at (x,y), snapping to align
  // with teammates already placed. Moving to a new zone clears a manual
  // override so the label returns to auto for the new zone.
  function dropOnField(team, x, y) {
    if (dragId == null) return;
    setPlayers((prev) => {
      const others = prev.filter((p) => p.id !== dragId && p.team === team);
      const sx = snap(
        x,
        others.map((p) => p.x),
      );
      const sy = snap(
        y,
        others.map((p) => p.y),
      );
      return prev.map((p) => {
        if (p.id !== dragId) return p;
        const movedZone =
          p.team !== team || autoTag(p.x, p.y) !== autoTag(sx, sy);
        return { ...p, team, x: sx, y: sy, tag: movedZone ? null : p.tag };
      });
    });
    endDrag();
  }

  function dropOnBench() {
    if (dragId == null) return;
    setPlayers((p) =>
      p.map((pl) => (pl.id === dragId ? { ...pl, team: null, tag: null } : pl)),
    );
    endDrag();
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
      const split = balance(prev, getForm, getArea);
      const posA = layoutTeam(split.A, getArea, getForm);
      const posB = layoutTeam(split.B, getArea, getForm);
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

  function startDrag(id) {
    setDragId(id);
    setDragging(true);
  }
  function endDrag() {
    setDragId(null);
    setDragging(false);
    setHover(null);
  }

  async function exportImage() {
    if (!pitchRef.current) return;
    setEditId(null);
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 50));
      const dataUrl = await toPng(pitchRef.current, {
        pixelRatio: 2,
        backgroundColor: "#145029",
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

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Y⚽L⚽ Formation</h1>

        <div className="squad-head">
          <span>Squad</span>
          {squad.some((m) => !m.core) && (
            <button className="save-btn" onClick={saveSquad}>
              {savedNote ? "✓ Saved" : "Save guests"}
            </button>
          )}
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
          <span className="col-form">Form</span>
          <span className="col-pos">Position</span>
        </div>

        <div
          className={`squad-list ${hover === "bench" ? "drop-hover" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setHover("bench");
          }}
          onDragLeave={() => setHover((h) => (h === "bench" ? null : h))}
          onDrop={dropOnBench}
        >
          {squad.map((m) => {
            const coming = isComing(m.id);
            const player = players.find((p) => p.id === m.id);
            const placed = player && player.team != null;
            const great = getForm(m.id) === "great";
            const area = getArea(m.id);
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
                  draggable={coming && !placed}
                  onDragStart={
                    coming && !placed ? () => startDrag(m.id) : undefined
                  }
                  onDragEnd={endDrag}
                  title={placed ? "On field" : undefined}
                >
                  {placed && <span className="on-dot" />}
                  {m.name}
                </span>
                <button
                  className={`form-toggle ${great ? "great" : ""}`}
                  title={great ? "Great — click for Good" : "Good — click for Great"}
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
          Tick who's here, set each player's usual area and ★ for the standouts,
          then hit <b>Balance teams</b> for two fair sides — or drag people on
          manually. Drop back here to bench.
        </p>
      </aside>

      <main className="main">
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
              setHover={setHover}
              onDropField={dropOnField}
              onDragStart={startDrag}
              onDragEnd={endDrag}
              editId={editId}
              setEditId={setEditId}
              onOverride={setOverride}
            />
          ))}
        </div>
      </main>
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
  setHover,
  onDropField,
  onDragStart,
  onDragEnd,
  editId,
  setEditId,
  onOverride,
}) {
  const text = contrastText(meta.color);
  const fieldRef = useRef(null);
  const placed = players.filter((p) => p.team === team);
  // Alignment guides reference teammates other than the one being dragged.
  const guides = placed.filter((p) => p.id !== dragId);

  function coords(e) {
    const rect = fieldRef.current.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0.05, 0.95);
    const y = clamp((e.clientY - rect.top) / rect.height, 0.04, 0.96);
    return { x, y };
  }

  return (
    <div className="pitch">
      <div className="pitch-header" style={{ borderColor: meta.color }}>
        <span className="dot" style={{ background: meta.color }} />
        <span className="pitch-title">{meta.name}</span>
        <span className="muted">{count} players</span>
      </div>
      <div
        ref={fieldRef}
        className={`field ${dragging ? "dragging" : ""} ${
          isHover ? "field-hover" : ""
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setHover(team);
        }}
        onDragLeave={() => setHover((h) => (h === team ? null : h))}
        onDrop={(e) => {
          const { x, y } = coords(e);
          onDropField(team, x, y);
        }}
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
            onDragStart={() => onDragStart(p.id)}
            onDragEnd={onDragEnd}
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
  onDragStart,
  onDragEnd,
  onClick,
  onCommit,
}) {
  return (
    <div
      className="token"
      style={{ left: `${player.x * 100}%`, top: `${player.y * 100}%` }}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
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
            onDragStart={(e) => e.preventDefault()}
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
