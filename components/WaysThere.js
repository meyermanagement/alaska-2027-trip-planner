"use client";

import { MODE_LABEL, minutesSaid } from "@/lib/travel/modes";

/**
 * How to get to the next thing, and how long each way takes.
 *
 * The ordering is decided in lib/travel/modes.js from three things: how far it is,
 * whether transit is any good where the family is, and what they wrote down about
 * getting around. This component's only job is to not overstate what it was given.
 *
 * So there are three visibly different states per option, and the difference is
 * the point:
 *
 * - a routed time, printed plain: "12 min"
 * - an estimate from the distance, hedged: "about 12 min", "8-14 min"
 * - no time at all, which still earns its place when transit is good here,
 *   because "the U-Bahn reaches almost everything" is worth knowing even without
 *   a departure board
 *
 * A mode with no time never borrows the look of one with a time.
 *
 * Each chip is also a door. Tapping one opens directions for that mode -- the
 * walking chip a walking route, the driving chip a driving one -- because having
 * worked out that the tour is twelve minutes away, making somebody retype the
 * destination into their phone is the app doing three quarters of a job.
 */

const ICON = {
  walk: "\ud83d\udeb6",
  transit: "\ud83d\ude87",
  drive: "\ud83d\ude97",
};

function Option({ option, first }) {
  const said = minutesSaid(option);
  const estimate = option.source === "estimate";
  const label = option.label || MODE_LABEL[option.mode];

  // Tall enough to be a target for a thumb, which 27 pixels was not, and the
  // same height whether or not it links so the row stays one row.
  const chip = `inline-flex min-h-[2.2rem] items-center gap-1.5 rounded-full border px-3 py-1 text-[0.72rem] ${
    first
      ? "border-teal/40 bg-white text-ink"
      : "border-[var(--line)] bg-white/70 text-ink-soft"
  }`;

  const inside = (
    <>
      <span aria-hidden="true">{ICON[option.mode]}</span>
      <span className="font-semibold">{label}</span>
      {said ? (
        <span className={`tabular ${first ? "text-ink" : "text-ink-soft"}`}>
          {estimate ? "about " : ""}
          {said}
        </span>
      ) : (
        // Not a time, and not dressed as one. "Times vary" is the honest label for
        // a network whose answer depends on when the next one leaves, and it is
        // what appears until the Routes API is switched on.
        <span className="text-ink-faint">times vary</span>
      )}
      {/* Says out loud that this goes somewhere, because a hover state is not a
          thing a phone has. */}
      {option.link && (
        <span aria-hidden="true" className="text-ink-faint">
          &#8599;
        </span>
      )}
    </>
  );

  // A chip that quotes a time for a journey is the natural place to start that
  // journey. It opens directions in the mode it just measured, in a new tab so
  // the day they were reading is still there when they come back. A chip with no
  // link stays a chip: nothing here pretends to be tappable when it is not.
  return (
    <li>
      {option.link ? (
        <a
          href={option.link}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Directions, ${label.toLowerCase()}${said ? `, ${estimate ? "about " : ""}${said}` : ""}`}
          className={`${chip} cursor-pointer underline-offset-2 transition hover:border-teal hover:bg-glacier hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal`}
        >
          {inside}
        </a>
      ) : (
        <span className={chip}>{inside}</span>
      )}
    </li>
  );
}

export default function WaysThere({
  options = [],
  title = null,
  distance = null,
}) {
  const shown = options.filter(Boolean).slice(0, 3);
  if (shown.length === 0) return null;

  // The best option's reason, said once underneath rather than on every chip. Three
  // chips each carrying a clause is a paragraph pretending to be a row.
  const why = shown[0]?.why || null;

  return (
    <div className="mt-2">
      <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-ink-faint">
        {title || "Getting there"}
        {distance ? (
          <span className="normal-case"> &middot; {distance}</span>
        ) : null}
      </p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {shown.map((option, n) => (
          <Option key={option.mode} option={option} first={n === 0} />
        ))}
      </ul>
      {why && <p className="mt-1 text-[0.72rem] text-ink-soft">{why}</p>}
    </div>
  );
}
