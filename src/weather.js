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

// What kind of game to expect, in a few words. The numbers live in the hero's
// forecast block now, so this is only the verdict. Ordered by what would
// actually spoil the game: wet ball first, then cold hands, then heat, wind.
export function matchdayHeadline(w) {
  if (!w) return null;
  const wet = w.kind === "rain" || w.kind === "snow" || w.rainChance >= 55;
  if (w.kind === "snow") return "Snow on the pitch";
  if (wet) return `Wet ball — ${w.rainChance}% chance of ${w.text}`;
  if (w.feels <= 32) return "Freezing — gloves and a base layer";
  if (w.wind >= 18) return `Windy at ${w.wind} mph — nothing long will hold its line`;
  if (w.feels <= 45) return "Cold start, worth a proper warm-up";
  if (w.temp >= 85) return "Hot — bring more water than you think";
  return "Good football weather";
}
