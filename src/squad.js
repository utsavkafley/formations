// The hardcoded core squad, shared by the poll and the formation builder.
export const CORE_SQUAD = [
  "Amir", "Deepen", "Kevin", "Pradin", "Rabin", "Yagya", "Utsav",
  "Anukul", "Ashim", "Avinash", "Ayush", "Bijay", "Bishal", "Chirring",
  "Deeyas", "Dwaipayan", "Eakon", "Govin", "Govinda", "Nabin", "Nirbirodh",
  "Supreme", "Raj", "Rishikesh", "Roshan", "Safal", "Sailesh", "Sajeeb",
  "Salik", "Saman", "Sanjay", "Saroj", "Shobhit", "Sunil", "Suresh", "Vijaya",
].map((name) => ({ id: `core-${name.toLowerCase()}`, name, core: true }));

// How many bodies it takes for even sides at each format. The poll counts up
// this ladder so people can see whether their own yes is the one that makes a
// game happen — and which format it makes.
export const SIDE_LADDER = [
  { players: 10, perSide: 5 },
  { players: 14, perSide: 7 },
  { players: 18, perSide: 9 },
];
