// The Alyeska compass mark. Inherits its color from `currentColor` so it can
// sit on the sand header, inside a teal button, or on the login card.
export default function AlyeskaMark({ className = "h-7 w-7" }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="16"
        cy="16"
        r="14"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.3"
      />
      <path
        d="M16 2.6v2.2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
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
