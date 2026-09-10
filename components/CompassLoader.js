"use client";

// The Alyeska compass mark, used as a loader between questions on the interview
// screen and anywhere else a wait needs a shape. Same Housing + Needle the boot
// splash uses, so the wait after answering a question is not a different
// instrument from the one that opened the app.
//
// The Compass here is decorative -- the screen behind it is already doing the
// real work -- so it draws whole and swings on its own. No hold, no cap, no
// fail-safe: this mounts and unmounts with the state that showed it, and if the
// bundle failed the caller is on the hook to show its own error.

const RING_LEN = 94.25;
const BEZEL = [
  ["M16 1 16 3.7", 1.7, 0.72, 3],
  ["M21.74 2.14 21.32 3.16", 1, 0.34, 1.2],
  ["M26.61 5.39 25.83 6.17", 1, 0.34, 1.2],
  ["M29.86 10.26 28.84 10.68", 1, 0.34, 1.2],
  ["M31 16 29 16", 1.4, 0.44, 2.2],
  ["M29.86 21.74 28.84 21.32", 1, 0.34, 1.2],
  ["M26.61 26.61 25.83 25.83", 1, 0.34, 1.2],
  ["M21.74 29.86 21.32 28.84", 1, 0.34, 1.2],
  ["M16 31 16 29", 1.4, 0.44, 2.2],
  ["M10.26 29.86 10.68 28.84", 1, 0.34, 1.2],
  ["M5.39 26.61 6.17 25.83", 1, 0.34, 1.2],
  ["M2.14 21.74 3.16 21.32", 1, 0.34, 1.2],
  ["M1 16 3 16", 1.4, 0.44, 2.2],
  ["M2.14 10.26 3.16 10.68", 1, 0.34, 1.2],
  ["M5.39 5.39 6.17 6.17", 1, 0.34, 1.2],
  ["M10.26 2.14 10.68 3.16", 1, 0.34, 1.2],
];

// The rim's circumference and the sixteen marks' path lengths, exported so a
// screen that wants to draw the mark on rather than fade it in has the numbers
// a stroke-dashoffset animation needs. Nothing else should be duplicating this
// geometry.
export { RING_LEN, BEZEL };

// Exported so the after-welcome next-steps screen can draw the exact same
// mark. `spin` controls whether the needle uses the drifting animation class:
// the loader wants it, the checklist rows do not (they swing to north once,
// via their own class).
export function Needle({ spin = true }) {
  return (
    <g transform="translate(16 16) scale(0.72) translate(-16 -16)">
      <g className={spin ? "boot-drift" : ""}>
        <path
          fillRule="evenodd"
          fill="currentColor"
          d="M16 2.9 28.1 29 16 20.9 3.9 29Z M16 8.84 9.92 21.96 16 17.89 22.08 21.96Z"
        />
        <path
          d="M9.92 21.96 16 17.89 16 8.84Z"
          fill="currentColor"
          opacity="0.28"
        />
      </g>
    </g>
  );
}

export function Housing() {
  return (
    <>
      <circle
        cx="16"
        cy="16"
        r="15"
        stroke="currentColor"
        strokeWidth="1"
        opacity="1"
      />
      {BEZEL.map(([d, w, o]) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth={w}
          strokeLinecap="round"
          opacity={o}
        />
      ))}
    </>
  );
}

/**
 * The mark, at a caller-chosen size, in the caller's own text color. The needle
 * drifts on the same keyframes the boot splash uses, so the wait between
 * questions reads as the same instrument the app opened on.
 *
 * `label` is announced to a screen reader and hidden visually. Callers should
 * pass what the wait is FOR ("Aly is thinking of the next question"), not what
 * the loader is: "Loading" tells nobody anything.
 */
export default function CompassLoader({
  size = 56,
  label = "Working on the next question.",
  className = "",
}) {
  return (
    <div
      className={`compass-spin inline-flex items-center justify-center ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
      >
        <Housing />
        <Needle />
      </svg>
      <span className="sr-only">{label}</span>
    </div>
  );
}
