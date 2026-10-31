// The club mark: a teal shield, a ball, one raked orange band. It is drawn
// for the hero at 56px and still has to survive a 16px favicon, so the whole
// budget is three shapes — anything finer turns to mud at that size.
//
// public/favicon.svg is the same drawing with the palette inlined as hex (a
// standalone file can't see the CSS custom properties). Change both.
export default function Crest({ size = 56, className = "" }) {
  return (
    <svg
      className={`crest ${className}`}
      width={(size * 48) / 58}
      height={size}
      viewBox="4 3.4 48 58"
      role="img"
      aria-label="YOLO"
    >
      <defs>
        <clipPath id="crest-shield">
          <path d="M4 7.6C16 3.4 40 3.4 52 7.6V30c0 16.2-10.3 25.8-24 31.2C14.3 55.8 4 46.2 4 30Z" />
        </clipPath>
      </defs>
      <g clipPath="url(#crest-shield)">
        <rect width="56" height="64" fill="var(--teal, #2a6f6b)" />
        {/* Raked, so the mark has a direction rather than sitting flat. */}
        <path d="M0 42.5 56 37.5 56 49.5 0 54.5Z" fill="var(--orange, #b85c1a)" />
      </g>
      <circle cx="28" cy="24" r="10.5" fill="#fff" />
      <path d="m28 17.6 6.1 4.4-2.3 7.2h-7.6L21.9 22Z" fill="var(--teal, #2a6f6b)" />
    </svg>
  );
}
