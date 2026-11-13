// Peer ratings → a number the team balancer can weigh players by.
//
// The poll has collected 180 of these over a season: one row per (rater,
// subject, game), each carrying ok / good / great. Most players have five or
// six, a couple have two, five have none at all. That spread is the whole
// problem with using them raw.
//
// A straight average at n=2 is not an opinion about a player, it is an opinion
// about whoever happened to rate them. Two "great"s would put somebody above a
// player with eight ratings averaging well — which is exactly backwards, since
// the second player's figure is the one we actually know something about. So
// each average is pulled toward the group mean by a fixed number of imaginary
// average ratings (PRIOR_N). With four of those, two real ratings carry a third
// of the weight and eight carry two thirds. Nobody's score is confidently
// extreme until the evidence is.
const POINTS = { ok: 0, good: 1, great: 2 };

// Four is a judgement call, not a derivation: it is roughly the median number
// of ratings a player here has, which makes "as much evidence as a typical
// player" the point where someone's own record outweighs the group's.
const PRIOR_N = 4;

// Score (0..2) to balancer weight. The spread is deliberately narrower than
// the scores are: a great player is worth more than a weak one in a kickabout,
// but not three times more, and the balancer divides by these.
export const weightOf = (score) => 0.8 + 0.5 * score;

// Rows as `player_feedback` stores them. Returns the group mean, the weight an
// unrated player gets, and per-subject detail for the UI to show.
export function ratingIndex(rows = []) {
  let sum = 0;
  let count = 0;
  const tally = new Map();
  for (const r of rows) {
    const pts = POINTS[r.performance];
    if (pts == null) continue;
    sum += pts;
    count += 1;
    const t = tally.get(r.subject_id) || { n: 0, sum: 0 };
    t.n += 1;
    t.sum += pts;
    tally.set(r.subject_id, t);
  }
  // With nothing collected at all, everyone sits at "good" and this whole
  // module is a no-op — the balancer behaves exactly as it did before.
  const prior = count ? sum / count : 1;

  const index = new Map();
  for (const [id, t] of tally) {
    const score = (t.sum + PRIOR_N * prior) / (t.n + PRIOR_N);
    index.set(id, { n: t.n, raw: t.sum / t.n, score, weight: weightOf(score) });
  }
  return { prior, index, baseline: weightOf(prior), total: count };
}

/* ------------------------------------------------------------------ *
 * Recent form — the chevrons in the build screen's Form column        *
 * ------------------------------------------------------------------ */

// A month, and three ratings. Both are the rule as asked for, and both are one
// line to change if it turns out to be too strict: at the time this went in,
// nobody in the squad cleared it, because asking had been switched off since
// the end of October and only thirteen ratings had come in over the previous
// month. Turning the asks back on is what fills this.
//
// The same window governs who gets asked about next, further down, and that is
// the point: the asks go to whoever this month knows least about, so the
// column fills in evenly rather than piling onto the same four names.
export const FORM_WINDOW_DAYS = 30;
export const FORM_MIN_RATINGS = 3;

// Where the chevrons start. The squad averages about 1.1 out of 2, so one
// chevron is "clearly above what this group usually says about somebody" and
// two is "nearly every rating was great". Thresholds on the plain average
// inside the window, not the shrunk score: three ratings is already the floor,
// so the sample-size problem the shrinking exists to solve is handled by it.
const ONE_CHEVRON = 1.35;
const TWO_CHEVRONS = 1.7;

const POINTS_IN = { ok: 0, good: 1, great: 2 };

// rows → Map(memberId → 1 | 2). Absent means no mark, which is the normal
// case: ordinary form and too-few-ratings both come back absent on purpose, so
// the Form column stays empty rather than printing a verdict on anybody. Only
// the build screen reads this — it is for the organizer picking sides, not a
// public standing beside people's names.
export function formLevels(rows = [], now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - FORM_WINDOW_DAYS);

  const tally = new Map();
  for (const r of rows) {
    const pts = POINTS_IN[r.performance];
    if (pts == null) continue;
    const at = new Date(r.created_at);
    if (!(at >= cutoff)) continue;
    const t = tally.get(r.subject_id) || { n: 0, sum: 0 };
    t.n += 1;
    t.sum += pts;
    tally.set(r.subject_id, t);
  }

  const levels = new Map();
  for (const [id, t] of tally) {
    if (t.n < FORM_MIN_RATINGS) continue;
    const avg = t.sum / t.n;
    if (avg >= TWO_CHEVRONS) levels.set(id, 2);
    else if (avg >= ONE_CHEVRON) levels.set(id, 1);
  }
  return levels;
}

// How thin each player's recent record is, for deciding who to ask about next.
// Everyone starts at zero, so a player nobody has rated this month sorts ahead
// of one who has three.
export function recentCounts(rows = [], now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - FORM_WINDOW_DAYS);
  const counts = new Map();
  for (const r of rows) {
    if (!(new Date(r.created_at) >= cutoff)) continue;
    counts.set(r.subject_id, (counts.get(r.subject_id) || 0) + 1);
  }
  return counts;
}
