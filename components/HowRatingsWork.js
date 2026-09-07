"use client";

import { useState } from "react";

/**
 * The one place the rating scale is spelled out, so the meaning of a star does
 * not drift between the two screens that ask for one.
 *
 * The public-review meaning of stars is not what we want here. Google stars
 * average a stranger's night out with a wedding party's, and a four means "was
 * fine" as often as "worth doing again." Aly reads these numbers to shape a
 * recommendation for the family that wrote them, so the numbers have to mean
 * the same thing every time. A five that means "was fine" costs the family a
 * suggestion Aly would otherwise have made, and a two that means "did not love
 * the seating" costs them a restaurant they would have gone back to.
 *
 * Kept small on purpose: a header nobody has to read, opened only if somebody
 * wants to know what a number should mean before they pick one.
 */
export default function HowRatingsWork({
  align = "start",
  className = "",
  compact = false,
}) {
  const [open, setOpen] = useState(false);

  const headerJustify = align === "between" ? "justify-between" : "gap-2";

  return (
    <div
      className={`rounded-xl border border-sand-deep bg-sand-soft/50 ${compact ? "px-3 py-2" : "p-3"} ${className}`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center ${headerJustify} text-left`}
      >
        <span className={`section-label ${compact ? "text-[0.72rem]" : ""}`}>
          How ratings work
        </span>
        <span
          className={`text-xs text-ink-soft ${align === "between" ? "" : "ml-auto"}`}
        >
          {open ? "Close" : "Read"}
        </span>
      </button>
      {open && (
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink">
          <p>
            These ratings are just for your family. Nothing here is shared
            publicly, and they are different from the public reviews you see on
            Google or a booking site. Aly leans on them heavily when suggesting
            somewhere to stay, something to do or a place to eat, so be
            completely honest about what you thought.
          </p>
          <ul className="space-y-1.5">
            <li>
              <span className="font-semibold text-ink">5</span> — a favorite.
              Reserved for the places you love. If Aly sees a five, it will try
              to find something like it on the next trip.
            </li>
            <li>
              <span className="font-semibold text-ink">4</span> — you loved it
              and would return.
            </li>
            <li>
              <span className="font-semibold text-ink">3</span> — indifferent.
              You would check other options first and maybe stay again if
              nothing better turned up.
            </li>
            <li>
              <span className="font-semibold text-ink">2</span> — not your
              favorite. Unlikely to return.
            </li>
            <li>
              <span className="font-semibold text-ink">1</span> — will not
              return.
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
