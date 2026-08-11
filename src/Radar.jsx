// Skill web: one spoke per skill, two shapes drawn on the same axes —
// the squad's average (baseline) and this player. Where the player's shape
// pulls inside the baseline is a skill the group applauds them for less than
// most, which is the nudge this chart exists to give.
//
// Hand-rolled SVG rather than a chart dependency, in the same spirit as the
// pitch markings in Builder.jsx.

// Wider than tall: the extra horizontal room is for the side spoke labels,
// which would otherwise run past the card edge.
const W = 260;
const H = 200;
const CX = W / 2;
const CY = H / 2;
const R = 58; // radius of the outer ring
const LABEL_R = R + 16;
const RINGS = [0.25, 0.5, 0.75, 1];

// Spokes start at 12 o'clock and go clockwise.
function point(radius, i, n) {
  const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
}

const polygon = (values, max, n) =>
  values
    .map((v, i) => point((Math.min(v, max) / max) * R, i, n).map((k) => k.toFixed(1)).join(","))
    .join(" ");

export default function Radar({ axes, showCounts = false, label }) {
  const n = axes.length;
  // A web needs at least a triangle to say anything.
  if (n < 3) {
    return <div className="radar-empty">Needs ratings on a few more skills to chart.</div>;
  }

  const max = Math.max(...axes.map((a) => Math.max(a.value, a.baseline)), 0.001);

  return (
    <svg className="radar" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <g className="radar-grid">
        {RINGS.map((r) => (
          <polygon
            key={r}
            points={polygon(
              axes.map(() => r * max),
              max,
              n,
            )}
          />
        ))}
        {axes.map((a, i) => {
          const [x, y] = point(R, i, n);
          return <line key={a.key} x1={CX} y1={CY} x2={x} y2={y} />;
        })}
      </g>

      <polygon
        className="radar-baseline"
        points={polygon(
          axes.map((a) => a.baseline),
          max,
          n,
        )}
      />
      <polygon
        className="radar-player"
        points={polygon(
          axes.map((a) => a.value),
          max,
          n,
        )}
      />

      {axes.map((a, i) => {
        const [x, y] = point(LABEL_R, i, n);
        const cos = (x - CX) / LABEL_R;
        const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
        return (
          <text key={a.key} className="radar-label" x={x} y={y} textAnchor={anchor} dominantBaseline="middle">
            {a.label}
            {showCounts && <tspan className="radar-count"> {a.count}</tspan>}
          </text>
        );
      })}
    </svg>
  );
}
