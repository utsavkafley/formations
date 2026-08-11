import { useEffect, useState } from "react";
import store from "./store.js";
import { CORE_SQUAD } from "./squad.js";
import { aggregateProfiles, skillLabel } from "./feedback.js";
import { STRENGTH_LABEL } from "./strengths.js";

// Read-only view of what the group has volunteered so far. Ratings stay
// anonymous — only blended results are shown, never who said what.
export default function Players({ onNavigate }) {
  const [profiles, setProfiles] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    store
      .fetchAllFeedback()
      .then((rows) => setProfiles(aggregateProfiles(rows)))
      .catch(() => setError(true));
  }, []);

  const rated = [];
  const unrated = [];
  for (const m of CORE_SQUAD) {
    const p = profiles?.[m.id];
    (p ? rated : unrated).push({ ...m, profile: p });
  }
  rated.sort((a, b) => b.profile.ratingsCount - a.profile.ratingsCount || a.name.localeCompare(b.name));

  const totalRatings = profiles
    ? Object.values(profiles).reduce((n, p) => n + p.ratingsCount, 0)
    : 0;

  return (
    <div className="poll">
      <div className="poll-shell">
        <header className="page-head">
          <button className="back" onClick={() => onNavigate("/")}>
            ← Back
          </button>
          <h1 className="hero-title">Players</h1>
          <div className="hero-when">
            {profiles === null
              ? "Loading…"
              : `${totalRatings} rating${totalRatings === 1 ? "" : "s"} from the group so far`}
          </div>
        </header>

        {error && <div className="conn-banner">Couldn’t load ratings — check your connection.</div>}

        {rated.map((m) => (
          <section key={m.id} className="player-card">
            <div className="player-top">
              <span className="player-name">{m.name}</span>
              <span className={`player-skill ${skillLabel(m.profile.skill).toLowerCase()}`}>
                {skillLabel(m.profile.skill)}
              </span>
            </div>
            <div className="player-sub">
              {m.profile.ratingsCount} rating{m.profile.ratingsCount === 1 ? "" : "s"}
              {m.profile.suggestedArea ? ` · plays ${m.profile.suggestedArea}` : ""}
            </div>
            {m.profile.strengths.length > 0 && (
              <div className="namechips">
                {m.profile.strengths.slice(0, 4).map((s) => (
                  <span key={s.key} className="namechip strength">
                    {STRENGTH_LABEL[s.key] || s.key}
                    {s.count > 1 && <b className="tick">{s.count}</b>}
                  </span>
                ))}
              </div>
            )}
          </section>
        ))}

        {profiles !== null && rated.length === 0 && (
          <section className="roster-block">
            <div className="roster-empty">
              No ratings yet. They build up as people RSVP after each game.
            </div>
          </section>
        )}

        {unrated.length > 0 && profiles !== null && (
          <section className="roster-block">
            <h3>Not rated yet</h3>
            <div className="namechips quiet">
              {unrated.map((m) => (
                <span key={m.id} className="namechip">
                  {m.name}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
