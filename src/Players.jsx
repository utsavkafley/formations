import { useEffect, useMemo, useState } from "react";
import store from "./store.js";
import { CORE_SQUAD } from "./squad.js";
import {
  aggregateProfiles,
  filterWindow,
  assignArchetype,
  baselineRates,
  rateOf,
  countOf,
} from "./feedback.js";
import { STRENGTH_LABEL, STRENGTH_SHORT } from "./strengths.js";
import Radar from "./Radar.jsx";

const WINDOWS = [
  { key: "month", label: "Last month", days: 30 },
  { key: "year", label: "Last year", days: 365 },
];

// What the group has volunteered, aggregated. Ratings stay anonymous: only
// blended results are shown, never who said what.
export default function Players({ onNavigate }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const [win, setWin] = useState("month");
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    store
      .fetchAllFeedback()
      .then(setRows)
      .catch(() => setError(true));
  }, []);

  const days = WINDOWS.find((w) => w.key === win).days;

  const { profiles, assignments } = useMemo(() => {
    const p = aggregateProfiles(filterWindow(rows || [], days));
    const a = {};
    for (const [id, prof] of Object.entries(p)) a[id] = assignArchetype(prof);
    return { profiles: p, assignments: a };
  }, [rows, days]);

  const rated = CORE_SQUAD.filter((m) => profiles[m.id]);
  const unrated = CORE_SQUAD.filter((m) => !profiles[m.id]);

  // Derive rather than sync: switching timeframe can drop the picked player out
  // of the window, so fall back instead of leaving a dead selection.
  const activeId = picked && profiles[picked] ? picked : rated[0]?.id || null;
  const profile = activeId ? profiles[activeId] : null;
  const style = activeId ? assignments[activeId] : null;

  const baseline = useMemo(
    () => (style ? baselineRates(profiles, assignments, { area: style.area }) : null),
    [profiles, assignments, style],
  );

  const axes =
    profile && style
      ? style.spokes.map((key) => ({
          key,
          label: STRENGTH_SHORT[key] || key,
          count: countOf(profile, key),
          value: rateOf(profile, key),
          baseline: baseline.rate(key),
        }))
      : [];

  // Skills they've been praised for that aren't part of their style — worth
  // showing so nothing they earned disappears off the chart.
  const otherStrengths = profile
    ? profile.strengths.filter((s) => !style.spokes.includes(s.key))
    : [];

  return (
    <div className="poll">
      <div className="poll-shell wide">
        <header className="page-head">
          <button className="back" onClick={() => onNavigate("/")}>
            ← Back
          </button>
          <h1 className="hero-title">Players</h1>
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
          <aside className="squad-col">
            {rated.map((m) => (
              <button
                key={m.id}
                className={`squad-pick ${activeId === m.id ? "on" : ""}`}
                onClick={() => setPicked(m.id)}
              >
                <span className="pick-name">{m.name}</span>
                <span className="pick-style">{assignments[m.id].label}</span>
              </button>
            ))}
            {unrated.map((m) => (
              <div key={m.id} className="squad-pick off" aria-disabled="true">
                <span className="pick-name">{m.name}</span>
                <span className="pick-style">No ratings yet</span>
              </div>
            ))}
          </aside>

          <div className="profile-detail">
            {!profile ? (
              <section className="player-card">
                <div className="roster-empty">
                  No ratings in this window yet. They build up as people RSVP after each game.
                </div>
              </section>
            ) : (
              <section className="player-card">
                <div className="player-top">
                  <span className="player-name">
                    {CORE_SQUAD.find((m) => m.id === activeId)?.name || activeId}
                  </span>
                  <span className="style-tag">{style.label}</span>
                </div>
                <div className="player-sub">
                  {style.blurb} · {profile.ratingsCount} rating
                  {profile.ratingsCount === 1 ? "" : "s"}
                </div>

                <Radar axes={axes} showCounts label={`${style.label} skill web`} />

                <div className="web-legend">
                  <span>
                    <i /> This player
                  </span>
                  <span>
                    <i className="base" />{" "}
                    {baseline.scope === "area"
                      ? `${style.area} players (${baseline.size})`
                      : `Squad average (${baseline.size})`}
                  </span>
                </div>

                {style.provisional && (
                  <p className="detail-note">
                    Needs 3+ ratings before we can call a playstyle — this is a neutral spread for
                    now.
                  </p>
                )}
                {!style.provisional && (
                  <p className="detail-note">
                    Spokes are what a {style.label} is expected to do. Where the line sits inside
                    the dashed one is what the group hasn’t applauded yet.
                  </p>
                )}

                {otherStrengths.length > 0 && (
                  <>
                    <h3 className="other-title">Also praised for</h3>
                    <div className="namechips">
                      {otherStrengths.map((s) => (
                        <span key={s.key} className="namechip strength">
                          {STRENGTH_LABEL[s.key] || s.key}
                          <b className="tick">{s.count}</b>
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
