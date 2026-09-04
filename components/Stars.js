"use client";

/**
 * Five stars, pressable.
 *
 * Lived on the Preferences tab until the itinerary screen needed to rate a place
 * the evening it happened. Copying it would have been quicker and would have left
 * two widgets to keep in step -- and a star that means four on one screen and
 * something slightly different on another is the sort of drift nobody notices
 * until the numbers stop matching.
 *
 * Pressing the star already showing clears the rating, which is the only way back
 * to no opinion once you have given one.
 */
export default function Stars({
  value = 0,
  onPick,
  size = "base",
  // The color of a star nobody has given yet. Sand is right on a cream card and
  // nearly invisible on a tinted one, and a rating widget you cannot see is a
  // rating nobody gives.
  dim = "text-sand-deep",
}) {
  const text = size === "sm" ? "text-sm" : "text-base";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          aria-pressed={value === n}
          className={`${text} leading-none transition hover:scale-110`}
        >
          <span className={n <= value ? "text-amber" : dim}>★</span>
        </button>
      ))}
      {value > 0 && (
        <span className="ml-1.5 text-xs font-semibold text-ink-soft">
          {value}/5
        </span>
      )}
    </div>
  );
}
