// Small marks the poll draws inline. All of them inherit color where it makes
// sense, so a glyph picks up whatever the surrounding text is doing.

// One place on the teamsheet, as a jersey. Everything here is sized for the
// 29-34px it actually renders at: the art fills its box rather than sitting in
// 14% padding, the torso is narrower than it is tall so it reads as a kit and
// not a t-shirt icon, the hem corners are properly round, and the neckline is
// a scoop you can see rather than a nick. The 2-unit stroke in the kit's own
// colour rounds every remaining corner and, on an empty place, is the shape.
// The collar band is the one interior mark there is room for, and it earns its
// place twice: it keeps the shirt from being a flat silhouette, and it is the
// second thing separating the home row from the away row. A filled shirt is
// painted in the bib colour the caller passes; an empty place has none, and
// is drawn as the same outline whatever the teams are wearing.
export function Shirt({ kit = "empty", color }) {
  return (
    <svg
      className={`shirt kit-${kit}`}
      style={color ? { "--kit": color } : undefined}
      viewBox="0 0 28 28"
      aria-hidden="true"
    >
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

// A banknote, for the way through to the money. It stands alone up there with
// no label beside it, so it carries a dollar sign rather than the plain disc a
// note is usually drawn with: a rounded rectangle with a circle in the middle
// reads as a camera about as readily as it reads as cash, and with no word
// next to it there is nothing to settle the argument. Stroked and inheriting
// its colour, so it sits at the weight of the quiet corner it lives in.
export function CashMark({ size = 20 }) {
  return (
    <svg
      className="cash-mark"
      viewBox="0 0 22 15"
      width={size * (22 / 15)}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="20" height="13" rx="2.6" />
      <path d="M11 3.5v8" strokeWidth="1.3" />
      <path
        d="M12.9 5.7c0-.8-.85-1.4-1.9-1.4s-1.9.6-1.9 1.4.85 1.2 1.9 1.4 1.9.6 1.9 1.4-.85 1.4-1.9 1.4-1.9-.6-1.9-1.4"
        strokeWidth="1.3"
      />
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
