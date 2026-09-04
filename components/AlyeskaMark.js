// The Alyeska compass mark. Inherits its color from `currentColor` so it can
// sit on the sand header, inside a teal button, or on the login card.
//
// `ring` draws the compass housing. It is on everywhere the mark is a logo, and
// off inside the round menu button, where the button's own rim is already that
// circle: two rings four pixels apart read as a mistake, and the needle has to
// give up room to the inner one to avoid touching it. Without it the needle can
// be drawn nearly the width of the button.
export default function AlyeskaMark({ className = "h-7 w-7", ring = true }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      {ring && (
        <circle
          cx="16"
          cy="16"
          r="14"
          stroke="currentColor"
          strokeWidth="1.4"
          opacity="0.3"
        />
      )}
      {/* The north tick. It reads as a tick because the housing is behind it;
         with the housing gone it is a dot floating off the point of the needle,
         so it leaves with the ring. */}
      {ring && (
        <path
          d="M16 2.6v2.2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.55"
        />
      )}
      <path d="M16 4.6 16 21.5 7.7 26.9Z" fill="currentColor" opacity="0.3" />
      <path
        d="M16 4.6 24.3 26.9 16 21.5 7.7 26.9Z"
        stroke="currentColor"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
