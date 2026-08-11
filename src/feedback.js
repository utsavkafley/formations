// Aggregates volunteered peer feedback into per-player profiles. Built now for
// data collection; consumed by balancing + a profile page in Phase 2. Pure
// functions — nothing here renders or fetches.
import { STRENGTH_AREA } from "./strengths.js";

// Performance → skill weight. Chosen to sit alongside the balancer's existing
// FORM_WEIGHT (good = 1, great = 1.8).
export const PERF_WEIGHT = { ok: 1.0, good: 1.5, great: 2.0 };

// rows: [{ subject_id, rater_id, game_date, performance, strengths: [] }]
// → { [subjectId]: { ratingsCount, skill, strengths: [{key,count}] desc, suggestedArea } }
export function aggregateProfiles(rows) {
  const byId = {};
  for (const r of rows || []) {
    const id = r.subject_id;
    const p = (byId[id] ||= { ratingsCount: 0, skillSum: 0, strengthCounts: {} });
    p.ratingsCount += 1;
    p.skillSum += PERF_WEIGHT[r.performance] ?? PERF_WEIGHT.ok;
    for (const s of r.strengths || []) p.strengthCounts[s] = (p.strengthCounts[s] || 0) + 1;
  }

  const out = {};
  for (const [id, p] of Object.entries(byId)) {
    const strengths = Object.entries(p.strengthCounts)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
    out[id] = {
      ratingsCount: p.ratingsCount,
      skill: p.skillSum / p.ratingsCount,
      strengths,
      suggestedArea: suggestArea(strengths),
    };
  }
  return out;
}

// The pitch area with the most strength-votes (excludes GK; keeper is chosen by
// the layout step, not the balance weighting). Null when there's no signal.
function suggestArea(strengths) {
  const tally = { ATT: 0, MID: 0, DEF: 0 };
  for (const { key, count } of strengths) {
    const area = STRENGTH_AREA[key];
    if (area in tally) tally[area] += count;
  }
  const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : null;
}

// Keep only ratings from the last `days`. Rows missing a timestamp are kept
// rather than silently dropped.
export function filterWindow(rows, days) {
  if (!days) return rows || [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return (rows || []).filter((r) => {
    const t = Date.parse(r.created_at);
    return Number.isNaN(t) || t >= cutoff;
  });
}

// Playstyle archetypes — deliberately broad, because this is pickup: nobody
// here is a regista. Each one's `spokes` are the skills that style is *supposed*
// to have, so charting them shows a player what they're not yet applauded for,
// not just what they're already good at. `area` doubles as the comparison group.
export const ARCHETYPES = [
  {
    key: "finisher",
    label: "Finisher",
    area: "ATT",
    blurb: "Plays on the shoulder and puts chances away.",
    spokes: ["finishing", "off_ball", "composure", "first_touch", "pace", "heading"],
  },
  {
    key: "winger",
    label: "Winger",
    area: "ATT",
    blurb: "Takes people on and gets the ball into the box.",
    spokes: ["pace", "dribbling", "crossing", "off_ball", "weak_foot", "work_rate"],
  },
  {
    key: "playmaker",
    label: "Playmaker",
    area: "MID",
    blurb: "Sees the pass before anyone else does.",
    spokes: ["vision", "passing", "long_passing", "first_touch", "composure", "dribbling"],
  },
  {
    key: "engine",
    label: "Engine",
    area: "MID",
    blurb: "Covers every blade of grass and links the game together.",
    spokes: ["stamina", "work_rate", "pressing", "tackling", "passing", "team_player"],
  },
  // Two defensive styles, because stopping people is not one skill: the
  // front-foot duel-winner who steps out and the back-foot reader who covers.
  {
    key: "stopper",
    label: "Stopper",
    area: "DEF",
    blurb: "Steps out, wins the duel, gets there first.",
    spokes: ["tackling", "physical", "heading", "defending", "pressing", "work_rate"],
  },
  {
    key: "sweeper",
    label: "Sweeper",
    area: "DEF",
    blurb: "Reads it early, covers the space, plays out calmly.",
    spokes: ["interceptions", "positioning", "composure", "defending", "passing", "communication"],
  },
];

// Shown until there's enough signal to claim a style. Neutral spread on purpose.
export const ALL_ROUNDER = {
  key: "all_rounder",
  label: "All-Rounder",
  area: null,
  blurb: "Not enough ratings yet to call a style.",
  spokes: ["passing", "defending", "pace", "stamina", "first_touch", "team_player"],
};

// How often a skill gets mentioned per rating this player received. Comparable
// across players regardless of how many ratings they have.
export function rateOf(profile, key) {
  if (!profile?.ratingsCount) return 0;
  const hit = profile.strengths.find((s) => s.key === key);
  return hit ? hit.count / profile.ratingsCount : 0;
}

export function countOf(profile, key) {
  return profile?.strengths.find((s) => s.key === key)?.count ?? 0;
}

// Best-fitting archetype: the share of this player's strength votes that land on
// each style's signature skills. Ties go to the style whose skills they've been
// praised for most broadly, then to declaration order.
export function assignArchetype(profile, { minRatings = 3 } = {}) {
  const totalVotes = (profile?.strengths || []).reduce((n, s) => n + s.count, 0);
  if (!profile || profile.ratingsCount < minRatings || totalVotes === 0) {
    return { ...ALL_ROUNDER, provisional: true };
  }
  const scored = ARCHETYPES.map((a) => {
    let hit = 0;
    let spread = 0;
    for (const key of a.spokes) {
      const c = countOf(profile, key);
      hit += c;
      if (c > 0) spread += 1;
    }
    return { archetype: a, score: hit / totalVotes, spread };
  }).sort((x, y) => y.score - x.score || y.spread - x.spread);

  return { ...scored[0].archetype, provisional: false, fit: scored[0].score };
}

// The line a player is measured against: everyone playing in the same third of
// the pitch. Falls back to the whole squad when that group is too small to mean
// anything — and says so, so the chart never mislabels what it's comparing.
export function baselineRates(profiles, assignments, { area, minPeers = 2 } = {}) {
  const ids = Object.keys(profiles || {});
  const peers = ids.filter((id) => assignments[id]?.area && assignments[id].area === area);
  const useArea = area && peers.length >= minPeers;
  const group = useArea ? peers : ids;

  let totalRatings = 0;
  const totals = {};
  for (const id of group) {
    const p = profiles[id];
    totalRatings += p.ratingsCount;
    for (const s of p.strengths) totals[s.key] = (totals[s.key] || 0) + s.count;
  }
  return {
    scope: useArea ? "area" : "squad",
    size: group.length,
    rate: (key) => (totalRatings ? (totals[key] || 0) / totalRatings : 0),
  };
}

// DORMANT — kept for when we decide where standouts belong on the page.
// The standouts for a window: an honour, not a tier. Deliberately scarce —
// roughly the top 10% of everyone rated in that window.
//
// Guards that keep it meaningful rather than an artefact of thin data:
//   minRatings — one lucky "Great" shouldn't crown anybody
//   minPool    — with almost nobody rated, "top 10%" is noise, so crown no one
export function selectStandouts(profiles, { pct = 0.1, minRatings = 3, minPool = 5 } = {}) {
  const rated = Object.entries(profiles || {});
  if (rated.length < minPool) return [];
  const eligible = rated.filter(([, p]) => p.ratingsCount >= minRatings);
  if (!eligible.length) return [];
  const count = Math.max(1, Math.ceil(rated.length * pct));
  return eligible
    .sort(([, a], [, b]) => b.skill - a.skill || b.ratingsCount - a.ratingsCount)
    .slice(0, count)
    .map(([id]) => id);
}
