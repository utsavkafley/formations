import { useEffect, useMemo, useState } from "react";
import store from "./store.js";
import { CORE_SQUAD } from "./squad.js";
import { aggregateProfiles, filterWindow, selectStandouts } from "./feedback.js";
import { STRENGTH_LABEL, STRENGTH_SHORT } from "./strengths.js";
import Radar from "./Radar.jsx";

const WINDOWS = [
  { key: "month", label: "Last month", days: 30 },
  { key: "year", label: "Last year", days: 365 },
];
const AXES = 6; // spokes per web — enough shape to read at a glance
const NAME = Object.fromEntries(CORE_SQUAD.map((m) => [m.id, m.name]));

// What the group has volunteered, aggregated. Ratings stay anonymous: only
// blended results are shown, never who said what.
export default function Players({ onNavigate }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const [win, setWin] = useState("month");

  useEffect(() => {
    store
      .fetchAllFeedback()
      .then(setRows)
      .catch(() => setError(true));
  }, []);

  const days = WINDOWS.find((w) => w.key === win).days;

  const { profiles, standouts, squadRate } = useMemo(() => {
    const p = aggregateProfiles(filterWindow(rows || [], days));
    // Squad baseline: how often each skill gets mentioned per rating given, so
    // a player with 10 ratings isn't mechanically "bigger" than one with 3.
    let totalRatings = 0;
    const totals = {};
    for (const prof of Object.values(p)) {
      totalRatings += prof.ratingsCount;
      for (const s of prof.strengths) totals[s.key] = (totals[s.key] || 0) + s.count;
    }
    return {
      profiles: p,
      standouts: new Set(selectStandouts(p)),
      squadRate: (key) => (totalRatings ? (totals[key] || 0) / totalRatings : 0),
    };
  }, [rows, days]);

  const ratedIds = Object.keys(profiles).sort(
    (a, b) => profiles[b].ratingsCount - profiles[a].ratingsCount ||
      (NAME[a] || a).localeCompare(NAME[b] || b),
  );
  const unrated = CORE_SQUAD.filter((m) => !profiles[m.id]);
  const totalRatings = Object.values(profiles).reduce((n, p) => n + p.ratingsCount, 0);

  const axesFor = (id) =>
    profiles[id].strengths.slice(0, AXES).map((s) => ({
      key: s.key,
      label: STRENGTH_SHORT[s.key] || s.key,
      count: s.count,
      value: s.count / profiles[id].ratingsCount,
      baseline: squadRate(s.key),
    }));

  return (
    <div className="poll">
      <div className="poll-shell wide">
        <header className="page-head">
          <button className="back" onClick={() => onNavigate("/")}>
            ← Back
          </button>
          <h1 className="hero-title">Players</h1>
          <div className="hero-when">
            {rows === null
              ? "Loading…"
              : `${totalRatings} rating${totalRatings === 1 ? "" : "s"} · ${Object.keys(profiles).length} rated`}
          </div>
          <div className="seg" role="tablist">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                role="tab"
                aria-selected={win === w.key}
                className={win === w.key ? "on" : ""}
                onClick={() => setWin(w.key)}
              >
                {w.label}
              </button>
            ))}
          </div>
        </header>

        {error && <div className="conn-banner">Couldn’t load ratings — check your connection.</div>}

        <div className="profiles-grid">
          {/* Standouts — the honour, and the only place exact counts appear. */}
          <aside className="standouts">
            <h2 className="col-title">Standouts</h2>
            {standouts.size === 0 ? (
              <div className="roster-block">
                <div className="roster-empty">
                  Not enough ratings in this window yet. Standouts appear once at least 5 players
                  have been rated, and it takes 3+ ratings to be in the running.
                </div>
              </div>
            ) : (
              [...standouts].map((id) => (
                <section key={id} className="player-card standout">
                  <div className="player-top">
                    <span className="player-name">{NAME[id] || id}</span>
                    <span className="player-skill standout">★ Standout</span>
                  </div>
                  <div className="player-sub">
                    {profiles[id].ratingsCount} rating{profiles[id].ratingsCount === 1 ? "" : "s"}
                    {profiles[id].suggestedArea ? ` · plays ${profiles[id].suggestedArea}` : ""}
                  </div>
                  <div className="namechips">
                    {profiles[id].strengths.map((s) => (
                      <span key={s.key} className="namechip strength">
                        {STRENGTH_LABEL[s.key] || s.key}
                        <b className="tick">{s.count}</b>
                      </span>
                    ))}
                  </div>
                </section>
              ))
            )}
          </aside>

          {/* Everyone rated, standouts included — shape only, no numbers. */}
          <div className="squad-webs">
            <h2 className="col-title">The squad</h2>
            <div className="web-legend">
              <span>
                <i /> This player
              </span>
              <span>
                <i className="base" /> Squad average
              </span>
            </div>
            <div className="web-grid">
              {ratedIds.map((id) => (
                <section key={id} className="player-card">
                  <div className="player-top">
                    <span className="player-name">{NAME[id] || id}</span>
                    {standouts.has(id) && <span className="player-skill standout">★</span>}
                  </div>
                  <Radar
                    axes={axesFor(id)}
                    showCounts={standouts.has(id)}
                    label={`${NAME[id] || id} skill web`}
                  />
                </section>
              ))}
            </div>

            {rows !== null && ratedIds.length === 0 && (
              <div className="roster-block">
                <div className="roster-empty">
                  No ratings in this window yet. They build up as people RSVP after each game.
                </div>
              </div>
            )}

            {unrated.length > 0 && rows !== null && (
              <div className="roster-block">
                <h3>Not rated yet</h3>
                <div className="namechips quiet">
                  {unrated.map((m) => (
                    <span key={m.id} className="namechip">
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
