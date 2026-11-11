// Kickoff weather, from Open-Meteo: free, keyless, CORS-open, so the browser
// can ask it directly. Only the pitch's coordinates and the game date leave
// the device. Every failure is silent — the line just doesn't appear.
const API = "https://api.open-meteo.com/v1/forecast";

// WMO weather codes, grouped the way a player cares about rather than the way
// a meteorologist would.
export function conditionOf(code) {
  if (code === 0) return { kind: "clear", text: "clear" };
  if (code <= 2) return { kind: "clear", text: "mostly clear" };
  if (code === 3) return { kind: "cloud", text: "overcast" };
  if (code <= 48) return { kind: "cloud", text: "fog" };
  if (code <= 57) return { kind: "rain", text: "drizzle" };
  if (code <= 67) return { kind: "rain", text: "rain" };
  if (code <= 77) return { kind: "snow", text: "snow" };
  if (code <= 82) return { kind: "rain", text: "showers" };
  if (code <= 86) return { kind: "snow", text: "snow showers" };
  return { kind: "rain", text: "thunderstorms" };
}

// The forecast for the hour the game kicks off. Null when the date is outside
// the forecast window (about two weeks) or the API can't be reached.
export async function fetchKickoffWeather({ lat, lon, tz, date, time }, signal) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone: tz,
    start_date: date,
    end_date: date,
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    hourly: "temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m",
  });
  const res = await fetch(`${API}?${params}`, { signal });
  if (!res.ok) return null;
  const { hourly } = await res.json();
  if (!hourly?.time?.length) return null;

  // Hourly rows are local wall-clock strings for `tz`, which is the same clock
  // the kickoff time is written in — so the nearest hour is a string compare.
  const hour = `${date}T${time.slice(0, 2)}:00`;
  const i = hourly.time.indexOf(hour);
  if (i === -1) return null;

  return {
    temp: Math.round(hourly.temperature_2m[i]),
    feels: Math.round(hourly.apparent_temperature[i]),
    rainChance: hourly.precipitation_probability?.[i] ?? 0,
    wind: Math.round(hourly.wind_speed_10m[i]),
    ...conditionOf(hourly.weather_code[i]),
  };
}

// The forecast in three words: what the sky is doing, how cold it will
// actually feel, and which part of the day the game falls in. "Clear cold
// morning", "Rainy mild evening". The mark and the number above it already
// say overcast and 54° — what they cannot say is whether 54° at seven in the
// morning is worth a second layer, which is the thing people actually want
// off this line.
//
// This replaces an advice line that used to live here ("Wet ball — 55% chance
// of rain", "Freezing — gloves and a base layer"). It was withdrawn when the
// hero was cut back, and what went back in its place is description rather
// than instruction: the group has played here for years and would rather be
// told the weather than told what to wear. It is in the history if the
// verdict is ever wanted again.
const SKY = {
  clear: "Clear",
  "mostly clear": "Clear",
  overcast: "Overcast",
  fog: "Foggy",
  drizzle: "Drizzly",
  rain: "Rainy",
  showers: "Showery",
  snow: "Snowy",
  "snow showers": "Snowy",
  thunderstorms: "Stormy",
};

// Bands off the APPARENT temperature, not the reading: wind and damp are most
// of what a 6:45 kickoff in November feels like, and the number beside this
// line is already the plain one.
function howItFeels(f) {
  if (f <= 25) return "freezing";
  if (f <= 38) return "cold";
  if (f <= 50) return "chilly";
  if (f <= 64) return "mild";
  if (f <= 78) return "warm";
  return "hot";
}

// Both slots are named: the Sunday game kicks off at dawn and the Thursday one
// after dark, and "day" would be wrong for either.
function partOfDay(time) {
  const h = Number(time.slice(0, 2));
  if (h < 11) return "morning";
  if (h < 17) return "afternoon";
  if (h < 21) return "evening";
  return "night";
}

export function matchdayBlurb(w, time) {
  if (!w) return null;
  return `${SKY[w.text] || "Cloudy"} ${howItFeels(w.feels)} ${partOfDay(time)}`;
}
