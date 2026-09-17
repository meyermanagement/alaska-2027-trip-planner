/**
 * The count the navigation draws beside the thing it counts.
 *
 * There were three of these written out by hand -- one on a trip's door, a
 * smaller one on a trip's leaf, and one on the rail's disc -- and they had
 * drifted apart in exactly the way hand-copied numbers do: different minimum
 * widths, different line heights, two of them tabular and one not. They all say
 * the same thing, so they are one component with a size.
 *
 * The rail's disc badge is deliberately not this: it is positioned onto the
 * corner of a circle with a ring cut out of the disc face behind it, which is a
 * different object that happens to contain a number.
 */
export default function NavCount({ n, what, size = "door", className = "" }) {
  if (!n || n <= 0) return null;
  const box =
    size === "leaf"
      ? "min-w-[1.05rem] px-1 text-2xs leading-[1.05rem]"
      : "min-w-[1.15rem] px-1 text-xs leading-[1.15rem]";
  return (
    <span
      className={`tabular ml-1.5 inline-block rounded-full bg-rose font-bold text-on-accent ${box} ${className}`}
    >
      {n}
      {what ? <span className="sr-only"> {what}</span> : null}
    </span>
  );
}
