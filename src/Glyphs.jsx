// Small marks the poll draws inline. All of them inherit color where it makes
// sense, so a glyph picks up whatever the surrounding text is doing.

// The sky at kickoff, used as the separator between where and when. Both a
// moon and a sun are always drawn, with the one that applies lit and the
// other left faint — a lone crescent would be a riddle, the pair reads as
// "this line is about light". `elevation` is 0 at the horizon and 1 when the
// sun is well clear of it, so a 7:15 winter morning shows a sun barely up
// while the same game in June shows one riding high.
export function SkyMark({ elevation = 1, dark = false, title }) {
  const horizon = 14;
  // Never fully below the line: even at sunrise the disc should read as a
  // sun, not a sliver. 0 puts about two thirds of it above the horizon.
  const cy = horizon - 1.2 - Math.max(0, Math.min(1, elevation)) * 6;
  return (
    <svg
      className="sky-mark"
      viewBox="0 0 34 18"
      width="34"
      height="18"
      role="img"
      aria-label={title}
    >
      {title && <title>{title}</title>}
      <clipPath id="sky-above">
        <rect x="0" y="0" width="34" height={horizon} />
      </clipPath>
      <g className={`sky-body ${dark ? "on" : "off"}`}>
        <circle className="sky-halo moon" cx="9" cy="8.5" r="6.2" />
        {/* Crescent: a disc with a second, larger disc bitten out of its right. */}
        <path
          className="sky-moon"
          transform="rotate(-18 9 8.5)"
          d="M9 4.1a4.4 4.4 0 1 0 0 8.8 5.5 5.5 0 0 1 0-8.8Z"
        />
      </g>
      <g className={`sky-body ${dark ? "off" : "on"}`} clipPath="url(#sky-above)">
        <circle className="sky-halo sun" cx="25" cy={cy} r="6.4" />
        <circle className="sky-sun" cx="25" cy={cy} r="4.2" />
      </g>
      <line className="sky-horizon" x1="2" y1={horizon} x2="32" y2={horizon} />
    </svg>
  );
}

// One shirt per place on the teamsheet — filled once somebody has claimed it.
export function Shirt({ className = "" }) {
  return (
    <svg className={`shirt ${className}`} viewBox="0 0 14 14" width="14" height="14" aria-hidden="true">
      <path d="M5.6 1.6 4 2.2 1.8 4.6 3.6 6.4 4.4 5.7V12.4h5.2V5.7l.8.7 1.8-1.8L10 2.2 8.4 1.6a1.5 1.5 0 0 1-2.8 0Z" />
    </svg>
  );
}

// Forecast marks, keyed to the buckets in weather.js.
export function WeatherMark({ kind }) {
  const common = {
    className: "wx-mark",
    viewBox: "0 0 16 16",
    width: 15,
    height: 15,
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
