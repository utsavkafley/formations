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
