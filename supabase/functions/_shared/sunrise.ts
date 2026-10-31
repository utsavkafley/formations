// Deno copy of lib/sunrise.js — change the two together.
//
// Sunrise for a date and a place, from the NOAA sunrise equations. No
// dependency and accurate to about a minute, which is far finer than a kickoff
// that gets rounded to the quarter hour anyway.
const RAD = Math.PI / 180;

export type SunriseSpot = { lat: number; lon: number; tz: string };

// The UTC instant of sunrise or sunset on a given calendar date. Null inside
// a polar day or night, where the sun never crosses the horizon.
export function solarEventAt(
  year: number,
  month: number,
  day: number,
  lat: number,
  lon: number,
  event: "rise" | "set" = "rise",
): Date | null {
  const jd = Date.UTC(year, month - 1, day) / 86400000 + 2440587.5;
  const n = Math.round(jd - 2451545.0 + 0.0008);
  const mean = n - lon / 360; // mean solar noon, in days since J2000
  const anomaly = (357.5291 + 0.98560028 * mean) % 360;
  const center =
    1.9148 * Math.sin(anomaly * RAD) +
    0.02 * Math.sin(2 * anomaly * RAD) +
    0.0003 * Math.sin(3 * anomaly * RAD);
  const ecliptic = (anomaly + center + 180 + 102.9372) % 360;
  const transit =
    2451545.0 + mean + 0.0053 * Math.sin(anomaly * RAD) - 0.0069 * Math.sin(2 * ecliptic * RAD);
  const sinDec = Math.sin(ecliptic * RAD) * Math.sin(23.4397 * RAD);
  const cosDec = Math.cos(Math.asin(sinDec));
  // -0.833° rather than 0°: the sun's own width plus refraction at the horizon.
  const cosHour =
    (Math.sin(-0.833 * RAD) - Math.sin(lat * RAD) * sinDec) / (Math.cos(lat * RAD) * cosDec);
  if (cosHour > 1 || cosHour < -1) return null;
  const hourAngle = Math.acos(cosHour) / RAD / 360;
  const at = event === "set" ? transit + hourAngle : transit - hourAngle;
  return new Date((at - 2440587.5) * 86400000);
}

export const sunriseAt = (y: number, m: number, d: number, lat: number, lon: number) =>
  solarEventAt(y, m, d, lat, lon, "rise");
export const sunsetAt = (y: number, m: number, d: number, lat: number, lon: number) =>
  solarEventAt(y, m, d, lat, lon, "set");

// Sunrise (or sunset) as the clock reads it where the game is played —
// "07:21". Going through Intl means EST/EDT is handled for us.
export function solarLocalHM(
  year: number,
  month: number,
  day: number,
  { lat, lon, tz }: SunriseSpot,
  event: "rise" | "set" = "rise",
): string | null {
  const at = solarEventAt(year, month, day, lat, lon, event);
  if (!at) return null;
  const hm = at.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  return hm === "24:00" ? "00:00" : hm;
}

export const sunriseLocalHM = (y: number, m: number, d: number, spot: SunriseSpot) =>
  solarLocalHM(y, m, d, spot, "rise");
export const sunsetLocalHM = (y: number, m: number, d: number, spot: SunriseSpot) =>
  solarLocalHM(y, m, d, spot, "set");

const mins = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};
const hm = (n: number) =>
  `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

// Next whole `step` minutes at or after `time`, so kickoff lands on a time
// somebody can actually remember.
export function ceilToStep(time: string, step: number) {
  return hm(Math.ceil(mins(time) / step) * step);
}

export function clampHM(time: string, earliest: string, latest: string) {
  return hm(Math.min(Math.max(mins(time), mins(earliest)), mins(latest)));
}
