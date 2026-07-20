// Pre-curated strengths for pickup players of varying skill. `key` is stored in
// the DB; `label` is shown on the pills; `area` maps the strength to a pitch
// area (ATT/MID/DEF/GK) so aggregation can later suggest a position. Intangibles
// use area: null — they count as strengths but never sway the position
// suggestion (same treatment as GK). Every player, whatever their level, should
// have at least a few pills here that honestly fit them.
export const STRENGTHS = [
  { key: "finishing", label: "Finishing", area: "ATT" },
  { key: "pace", label: "Pace", area: "ATT" },
  { key: "dribbling", label: "Dribbling", area: "ATT" },
  { key: "off_ball", label: "Off-the-ball movement", area: "ATT" },
  { key: "passing", label: "Passing", area: "MID" },
  { key: "vision", label: "Vision / IQ", area: "MID" },
  { key: "first_touch", label: "First touch", area: "MID" },
  { key: "work_rate", label: "Work rate", area: "MID" },
  { key: "stamina", label: "Stamina", area: "MID" },
  { key: "defending", label: "Defending", area: "DEF" },
  { key: "positioning", label: "Positioning", area: "DEF" },
  { key: "physical", label: "Physical", area: "DEF" },
  { key: "goalkeeping", label: "Goalkeeping", area: "GK" },
  { key: "communication", label: "Communication", area: null },
  { key: "team_player", label: "Team player", area: null },
  { key: "energy", label: "Positive energy", area: null },
];

export const STRENGTH_LABEL = Object.fromEntries(STRENGTHS.map((s) => [s.key, s.label]));
export const STRENGTH_AREA = Object.fromEntries(STRENGTHS.map((s) => [s.key, s.area]));
