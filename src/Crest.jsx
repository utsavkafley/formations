// The club mark: a teal shield, a ball, and one orange band. Three shapes is
// the whole budget — anything finer turns to mud at favicon size.
//
// public/favicon.svg is the same drawing with the palette inlined as hex
// (a standalone file can't see the CSS custom properties). Change both.
export default function Crest({ size = 28, className = "" }) {
  return (
    <svg
      className={`crest ${className}`}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="YOLO Formation"
    >
      <defs>
        <clipPath id="crest-shield">
          <path d="M4 5.6C10.4 3.3 21.6 3.3 28 5.6V16c0 7.4-5.4 12.2-12 14.6C9.4 28.2 4 23.4 4 16Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#crest-shield)">
        <rect x="0" y="0" width="32" height="32" fill="var(--teal, #2a6f6b)" />
        {/* The band sits low and slightly raked, so the mark has a direction. */}
        <path d="M0 21.5 32 18.5 32 24.5 0 27.5Z" fill="var(--orange, #b85c1a)" />
      </g>
      <circle cx="16" cy="13" r="5" fill="#fff" />
      <path d="m16 10 2.6 1.9-1 3.1h-3.2l-1-3.1Z" fill="var(--teal, #2a6f6b)" />
    </svg>
  );
}
