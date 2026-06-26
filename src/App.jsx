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
const SNAP = 0.03; // alignment snap threshold (fraction of pitch)
let guestId = 1;

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

// Snap a value to a nearby reference (for tidy rows/columns).
function snap(val, refs) {
  for (const r of refs) if (Math.abs(val - r) < SNAP) return r;
  return val;
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
                >
                  {m.name}
                </span>
                {placed && <span className="field-badge">on field</span>}
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
          Tick who's here today, then drag them onto a team. Labels auto-set by
          zone — click a shirt to override. Drop back here to bench.
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
          <button
            className="export-btn"
            onClick={exportImage}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "⬇ Save as image"}
          </button>
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
