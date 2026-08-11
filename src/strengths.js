// Pre-curated strengths for pickup players of varying skill. `key` is stored in
// the DB; `label` is shown on the pills; `short` is used where space is tight
// (radar spokes); `area` maps the strength to a pitch area (ATT/MID/DEF/GK) so
// aggregation can suggest a position; `group` sections the rating sheet.
//
// Every skill here has to be observable by a teammate and coachable — a rating
// nobody can see, or nobody can act on, is just noise. Intangibles carry
// area: null so they count as strengths but never sway the position suggestion.
export const STRENGTHS = [
  // ---- Attack ----
  { key: "finishing", label: "Finishing", short: "Finishing", area: "ATT", group: "Attack" },
  { key: "pace", label: "Pace", short: "Pace", area: "ATT", group: "Attack" },
  { key: "dribbling", label: "Dribbling", short: "Dribbling", area: "ATT", group: "Attack" },
  { key: "off_ball", label: "Off-the-ball movement", short: "Off-ball", area: "ATT", group: "Attack" },
  { key: "crossing", label: "Crossing", short: "Crossing", area: "ATT", group: "Attack" },
  { key: "weak_foot", label: "Both feet", short: "Both feet", area: "ATT", group: "Attack" },

  // ---- Midfield ----
  { key: "passing", label: "Passing", short: "Passing", area: "MID", group: "Midfield" },
  { key: "long_passing", label: "Long passing", short: "Long ball", area: "MID", group: "Midfield" },
  { key: "vision", label: "Vision / IQ", short: "Vision", area: "MID", group: "Midfield" },
  { key: "first_touch", label: "First touch", short: "1st touch", area: "MID", group: "Midfield" },
  { key: "composure", label: "Composure", short: "Composure", area: "MID", group: "Midfield" },
  { key: "work_rate", label: "Work rate", short: "Work rate", area: "MID", group: "Midfield" },
  { key: "pressing", label: "Pressing", short: "Pressing", area: "MID", group: "Midfield" },
  { key: "stamina", label: "Stamina", short: "Stamina", area: "MID", group: "Midfield" },

  // ---- Defence ----
  { key: "defending", label: "Defending", short: "Defending", area: "DEF", group: "Defence" },
  { key: "tackling", label: "Tackling", short: "Tackling", area: "DEF", group: "Defence" },
  { key: "interceptions", label: "Interceptions", short: "Reading", area: "DEF", group: "Defence" },
  { key: "positioning", label: "Positioning", short: "Position", area: "DEF", group: "Defence" },
  { key: "heading", label: "Heading", short: "Heading", area: "DEF", group: "Defence" },
  { key: "physical", label: "Physical", short: "Physical", area: "DEF", group: "Defence" },
  { key: "goalkeeping", label: "Goalkeeping", short: "Keeping", area: "GK", group: "Defence" },

  // ---- Intangibles ----
  { key: "communication", label: "Communication", short: "Comms", area: null, group: "Intangibles" },
  { key: "team_player", label: "Team player", short: "Team", area: null, group: "Intangibles" },
  { key: "energy", label: "Positive energy", short: "Energy", area: null, group: "Intangibles" },
];

export const STRENGTH_GROUPS = ["Attack", "Midfield", "Defence", "Intangibles"];

export const STRENGTH_LABEL = Object.fromEntries(STRENGTHS.map((s) => [s.key, s.label]));
export const STRENGTH_SHORT = Object.fromEntries(STRENGTHS.map((s) => [s.key, s.short || s.label]));
export const STRENGTH_AREA = Object.fromEntries(STRENGTHS.map((s) => [s.key, s.area]));
