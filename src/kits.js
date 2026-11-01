// The bib colours, shared by the poll's sides card and the team builder — so
// the two shirts somebody sees on the poll are the two the builder hands them
// when they go to pick teams.

export const TEAM_COLORS = [
  { name: "Red", value: "#e63946" },
  { name: "Blue", value: "#1d6fe0" },
  { name: "Green", value: "#2a9d3f" },
  { name: "Orange", value: "#f08c00" },
  { name: "Purple", value: "#7048e8" },
  { name: "Teal", value: "#0b8a8a" },
  { name: "Black", value: "#2b2b2b" },
  { name: "Yellow", value: "#f1b000" },
  { name: "Pink", value: "#e64980" },
  { name: "White", value: "#e9ecef" },
];

const by = (name) => TEAM_COLORS.find((c) => c.name === name);

// Black and green, and not by taste. Two teams have to be told apart across a
// pitch in the half-light of a 6:45 kickoff, by people who may be red-green
// colour blind — about one man in twelve. Of every pair in the list above,
// this is the only one that stays above 3:1 under normal vision AND under all
// three kinds of colour blindness: 4.0 normal, 4.5 protanopic, 3.8
// deuteranopic, 3.9 tritanopic. Both also clear 3:1 against the pale pitch the
// sides card draws them on, which rules out yellow and white however good a
// bib they make.
//
// They replace blue and red, which read as the obvious choice and are the
// worst kind of wrong: 1.1:1 against each other. Blue and red are all but the
// same shade by lightness, so two teams in them are told apart by hue alone —
// which is exactly what fails at dusk, on a phone in sunlight, and for those
// one in twelve.
export const DEFAULT_KITS = { home: by("Black"), away: by("Green") };
