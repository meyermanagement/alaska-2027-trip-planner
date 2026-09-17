/**
 * The mark on something that opens.
 *
 * A chevron in a tinted disc, turning over when the thing it belongs to is open.
 * It exists as its own file because the app now shuts several kinds of card by
 * default -- a live tip on the Tips tab, a tip the household has already cleared,
 * a day pack, a band -- and every one of them has to invite the same tap. A bare
 * 16px stroke in the body's own gray reads as punctuation rather than a control,
 * which is the whole reason for the disc: it is the shape the day-pack band and
 * the menu dial already use for something that opens, at a size the eye finds
 * while scanning past a column of titles.
 *
 * Purely decorative. The header it sits in is the button, and that button carries
 * the aria-expanded, so this is hidden from a screen reader entirely rather than
 * announced as a second thing to press.
 */
export function ChevronDisc({
  // Whether the thing this belongs to is open. Turns the chevron over.
  open = false,
  // A record rather than an invitation: the same shape in the line color and the
  // softer ink, for lists of things already dealt with. A cleared tip should not
  // compete with live advice above it for the same eye, and five accent discs
  // down the side of a record is exactly that competition.
  quiet = false,
}) {
  return (
    <span
      aria-hidden="true"
      className={`no-print grid size-8 shrink-0 place-items-center rounded-full border transition-transform ${
        quiet
          ? "border-[var(--line)] bg-ink/5 text-ink-soft"
          : "border-teal/30 bg-teal-soft text-teal"
      } ${open ? "rotate-180" : ""}`}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
        <path
          d="M4 6.5L8 10.5L12 6.5"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
