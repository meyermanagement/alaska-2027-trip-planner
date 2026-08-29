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
 */

const ICON = {
  walk: "\ud83d\udeb6",
  transit: "\ud83d\ude87",
  drive: "\ud83d\ude97",
};

function Option({ option, first }) {
  const said = minutesSaid(option);
  const estimate = option.source === "estimate";

  return (
    <li
      className={`flex items-baseline gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] ${
        first
          ? "border-teal/40 bg-white text-ink"
          : "border-[var(--line)] bg-white/70 text-ink-soft"
      }`}
    >
      <span aria-hidden="true">{ICON[option.mode]}</span>
      <span className="font-semibold">
        {option.label || MODE_LABEL[option.mode]}
      </span>
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
