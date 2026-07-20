// Pre-curated strengths for pickup players of varying skill. `key` is stored in
// the DB; `label` is shown on the pills; `area` maps the strength to a pitch
// area (ATT/MID/DEF/GK) so aggregation can later suggest a position.
export const STRENGTHS = [
  { key: "finishing", label: "Finishing", area: "ATT" },
  { key: "pace", label: "Pace", area: "ATT" },
  { key: "dribbling", label: "Dribbling", area: "ATT" },
  { key: "off_ball", label: "Off-the-ball movement", area: "ATT" },
  { key: "passing", label: "Passing", area: "MID" },
  { key: "vision", label: "Vision / IQ", area: "MID" },
  { key: "first_touch", label: "First touch", area: "MID" },
  { key: "work_rate", label: "Work rate", area: "MID" },
  { key: "defending", label: "Defending", area: "DEF" },
  { key: "physical", label: "Physical", area: "DEF" },
  { key: "goalkeeping", label: "Goalkeeping", area: "GK" },
];

export const STRENGTH_LABEL = Object.fromEntries(STRENGTHS.map((s) => [s.key, s.label]));
export const STRENGTH_AREA = Object.fromEntries(STRENGTHS.map((s) => [s.key, s.area]));
