// Small marks the poll draws inline. All of them inherit color where it makes
// sense, so a glyph picks up whatever the surrounding text is doing.

// The sun, flat: warm amber, no gradient or glow — a solid shape, so it sits
// on the strip as a mark rather than as a picture.
export function SunIcon({ size = 37, className = "" }) {
  return (
    <svg className={className} viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <g fill="#f6ae33">
        {Array.from({ length: 12 }, (_, i) => (
          <path key={i} d="M24 3.4 26 10.2 22 10.2Z" transform={`rotate(${i * 30} 24 24)`} />
        ))}
      </g>
      <circle cx="24" cy="24" r="10.8" fill="#ffc24a" />
    </svg>
  );
}

// The day as a strip: night at one end, daylight at the other, and the sun
// sitting exactly where one turns into the other. Kickoff is ticked where it
// actually falls — so a 6:45 game reads as "just after the light arrives" and
// a 7:30 PM one in November reads as "well into the dark", without anybody
// doing arithmetic. The hour itself is written on the line above.
export function DaylightBar({ sunrise, sunset, kickoff, caption }) {
  const mins = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const kick = mins(kickoff);
  const up = mins(sunrise);
  const down = mins(sunset);

  // Anchor on whichever turn of the light this game is about.
  const morning = Math.abs(kick - up) <= Math.abs(kick - down);
  const anchor = morning ? up : down;
  // Four hours around that turn, widened if kickoff falls outside it.
  const lo = Math.min(anchor - 120, kick - 25);
  const hi = Math.max(anchor + 120, kick + 25);
  const pos = (m) => ((m - lo) / (hi - lo)) * 100;
  const at = (n) => `${Math.max(0, Math.min(100, n))}%`;

  const sun = pos(anchor);
  const kickAt = pos(kick);

  const NIGHT = "#16302e";
  const DUSK = "#24534f";
  const WARM = "#f2d7b6";
  const DAY = "#fcfaf6";
  const stops = morning
    ? `${NIGHT} 0%, ${DUSK} ${at(sun - 22)}, var(--orange) ${at(sun)}, ${WARM} ${at(sun + 14)}, ${DAY} 100%`
    : `${DAY} 0%, ${WARM} ${at(sun - 14)}, var(--orange) ${at(sun)}, ${DUSK} ${at(sun + 22)}, ${NIGHT} 100%`;

  // When kickoff lands on the turn itself, the sun already marks the spot and
  // a tick beside it just looks like a smudge.
  const showTick = Math.abs(kickAt - sun) > 4;

  return (
    <div className="daylight" role="img" aria-label={caption}>
      <div className="dl-bar" style={{ backgroundImage: `linear-gradient(90deg, ${stops})` }}>
        {showTick && <span className="dl-tick" style={{ left: at(kickAt) }} />}
        <span className="dl-sun" style={{ left: at(sun) }}>
          <SunIcon size={37} />
        </span>
      </div>
    </div>
  );
}

// One place on the teamsheet, as a jersey. Everything here is sized for the
// 29-34px it actually renders at: the art fills its box rather than sitting in
// 14% padding, the torso is narrower than it is tall so it reads as a kit and
// not a t-shirt icon, the hem corners are properly round, and the neckline is
// a scoop you can see rather than a nick. The 2-unit stroke in the kit's own
// colour rounds every remaining corner and, on an empty place, is the shape.
// The collar band is the one interior mark there is room for, and it earns its
// place twice: it keeps the shirt from being a flat silhouette, and it is the
// second thing separating the home row from the away row.
export function Shirt({ kit = "empty" }) {
  return (
    <svg className={`shirt kit-${kit}`} viewBox="0 0 28 28" aria-hidden="true">
      <path
        className="kit-body"
        strokeWidth="2"
        strokeLinejoin="round"
        d="M11.6 3 7.2 4 2.2 7.8 5 14.2l3.3-1.6v12a1.2 1.2 0 0 0 1.2 1.2h9a1.2 1.2 0 0 0 1.2-1.2v-12l3.1 1.6 3-6.4-5-3.8-4.4-1a2.8 2.8 0 0 1-4.8 0Z"
      />
      {kit !== "empty" && (
        <path
          className="kit-collar"
          fill="none"
          strokeWidth="1.8"
          strokeLinecap="round"
          d="M11.9 3.9a2.6 2.6 0 0 0 4.2 0"
        />
      )}
    </svg>
  );
}

// Forecast marks, keyed to the buckets in weather.js.
export function WeatherMark({ kind, size = 15 }) {
  const common = {
    className: `wx-mark wx-${kind}`,
    viewBox: "0 0 16 16",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round",
    "aria-hidden": true,
  };
  if (kind === "clear") {
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="3.1" />
        <path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1" />
      </svg>
    );
  }
  const cloud = <path d="M4.6 11.5a3 3 0 0 1 .3-6 4.1 4.1 0 0 1 7.6 1.2 2.4 2.4 0 0 1-.4 4.8Z" />;
  if (kind === "rain") {
    return (
      <svg {...common}>
        {cloud}
        <path d="M5.8 13.1l-.6 1.4M9.4 13.1l-.6 1.4" />
      </svg>
    );
  }
  if (kind === "snow") {
    return (
      <svg {...common}>
        {cloud}
        <path d="M6 13.8h.01M9.4 13.8h.01M7.7 12.9h.01" />
      </svg>
    );
  }
  return <svg {...common}>{cloud}</svg>;
}
