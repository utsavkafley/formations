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

// Human label for a skill average, for later profile/roster display.
export function skillLabel(skill) {
  if (skill == null) return "Unrated";
  if (skill >= 1.75) return "Standout";
  if (skill >= 1.3) return "Solid";
  return "Casual";
}
