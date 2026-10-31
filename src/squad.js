// The hardcoded core squad, shared by the poll and the formation builder.
export const CORE_SQUAD = [
  "Amir", "Deepen", "Kevin", "Pradin", "Rabin", "Yagya", "Utsav",
  "Anukul", "Ashim", "Avinash", "Ayush", "Bijay", "Bishal", "Chirring",
  "Deeyas", "Dwaipayan", "Eakon", "Govin", "Govinda", "Nabin", "Nirbirodh",
  "Supreme", "Raj", "Rishikesh", "Roshan", "Safal", "Sailesh", "Sajeeb",
  "Salik", "Saman", "Sanjay", "Saroj", "Shobhit", "Sunil", "Suresh", "Vijaya",
].map((name) => ({ id: `core-${name.toLowerCase()}`, name, core: true }));
