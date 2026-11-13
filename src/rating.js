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
import { STRENGTH_AREA } from "./strengths.js";

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

/* ------------------------------------------------------------------ *
 * Where somebody plays, guessed from what they are praised for         *
 * ------------------------------------------------------------------ */

// Each strength already carries an area — strengths.js has said so since it was
// written ("aggregation can suggest a position") and nothing ever read it. The
// build screen defaulted every player to MID instead, which put a whole side
// in one line of eight and exported that as the teamsheet.
//
// Counts, not shares. MID has eight strengths to ATT's and DEF's six, so
// dividing by the size of each list looks like the fair correction — but tried
// against the real tags it moved a player with nineteen midfield mentions and
// fifteen attacking ones into attack on a rounding difference, and tipped the
// squad to eighteen defenders. What a rater picked is the signal; how many
// options sat beside it is not.
const AREA_MIN_TAGS = 3;

// rows → Map(memberId → "DEF" | "MID" | "ATT"). Players below the floor are
// left out, and the caller falls back to MID for them: a guess from one tag is
// not a guess, and MID is where an unknown player does least harm.
export function areaGuesses(rows = []) {
  const tally = new Map();
  for (const r of rows) {
    for (const key of r.strengths || []) {
      const area = STRENGTH_AREA[key];
      // GK is a real area but not a line on this pitch, and the intangibles
      // carry null on purpose so they never sway where somebody stands.
      if (!area || area === "GK") continue;
      const t = tally.get(r.subject_id) || { DEF: 0, MID: 0, ATT: 0 };
      t[area] += 1;
      tally.set(r.subject_id, t);
    }
  }

  const guess = new Map();
  for (const [id, t] of tally) {
    const total = t.DEF + t.MID + t.ATT;
    if (total < AREA_MIN_TAGS) continue;
    // Ties go to MID, the same way no data does.
    const best = t.MID >= t.DEF && t.MID >= t.ATT ? "MID" : t.DEF >= t.ATT ? "DEF" : "ATT";
    guess.set(id, best);
  }
  return guess;
}

/* ------------------------------------------------------------------ *
 * Choosing who to ask about                                           *
 * ------------------------------------------------------------------ */

// How badly somebody needs ratings, as a weight rather than a rank.
//
// Ranking was the obvious way and it is wrong here, because of WHEN people
// answer. The link goes into the group chat and a dozen people open it within
// the same couple of minutes, so every phone fetches the same counts before
// any of those answers have landed. A rule that picks the single thinnest
// player hands all of them the same name: simulated over ten players RSVPing
// at once, nine of the ten asks went to one man while the rest stayed at zero
// — the opposite of spreading them out.
//
// Sampling by weight fixes that without a server telling clients what to do.
// Thin players are much likelier, nobody is certain, and two phones reading
// identical counts still land on different names.
export const askWeight = (recent = 0, lifetime = 0) => 1 / (1 + 3 * recent + 0.25 * lifetime);

export function sampleWeighted(items, weightOf, rnd = Math.random) {
  if (!items.length) return null;
  const weights = items.map((it) => Math.max(0, weightOf(it)));
  const total = weights.reduce((n, w) => n + w, 0);
  if (!(total > 0)) return items[Math.floor(rnd() * items.length)];
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
