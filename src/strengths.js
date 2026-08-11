// Pre-curated strengths for pickup players of varying skill. `key` is stored in
// the DB; `label` is shown on the pills; `area` maps the strength to a pitch
// area (ATT/MID/DEF/GK) so aggregation can later suggest a position. Intangibles
// use area: null — they count as strengths but never sway the position
// suggestion (same treatment as GK). Every player, whatever their level, should
// have at least a few pills here that honestly fit them.
// `short` is used where space is tight (radar spokes); it falls back to `label`.
export const STRENGTHS = [
  { key: "finishing", label: "Finishing", short: "Finishing", area: "ATT" },
  { key: "pace", label: "Pace", short: "Pace", area: "ATT" },
  { key: "dribbling", label: "Dribbling", short: "Dribbling", area: "ATT" },
  { key: "off_ball", label: "Off-the-ball movement", short: "Off-ball", area: "ATT" },
  { key: "passing", label: "Passing", short: "Passing", area: "MID" },
  { key: "vision", label: "Vision / IQ", short: "Vision", area: "MID" },
  { key: "first_touch", label: "First touch", short: "1st touch", area: "MID" },
  { key: "work_rate", label: "Work rate", short: "Work rate", area: "MID" },
  { key: "stamina", label: "Stamina", short: "Stamina", area: "MID" },
  { key: "defending", label: "Defending", short: "Defending", area: "DEF" },
  { key: "positioning", label: "Positioning", short: "Position", area: "DEF" },
  { key: "physical", label: "Physical", short: "Physical", area: "DEF" },
  { key: "goalkeeping", label: "Goalkeeping", short: "Keeping", area: "GK" },
  { key: "communication", label: "Communication", short: "Comms", area: null },
  { key: "team_player", label: "Team player", short: "Team", area: null },
  { key: "energy", label: "Positive energy", short: "Energy", area: null },
];

export const STRENGTH_LABEL = Object.fromEntries(STRENGTHS.map((s) => [s.key, s.label]));
export const STRENGTH_SHORT = Object.fromEntries(STRENGTHS.map((s) => [s.key, s.short || s.label]));
export const STRENGTH_AREA = Object.fromEntries(STRENGTHS.map((s) => [s.key, s.area]));
