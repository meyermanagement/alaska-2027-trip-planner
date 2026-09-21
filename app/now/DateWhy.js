"use client";

// A date in the band, with its sentence shut until asked for.
//
// Every row in "Dates that will not wait" carries a line saying why the date
// matters: the balance that is due, the fare that reprices, the spend a bonus
// needs. Five rows meant ten lines on a desktop and nearer twenty on a phone,
// where the title wraps and the trip name drops under it, so the band was the
// tallest thing on a home screen whose job is to say what is next.
//
// The line is worth reading once and almost never at a glance, which is the same
// shape as a reminder's description -- so it uses the reminder's own control,
// imported rather than redrawn: the same chevron, the same Details and Hide
// details, the same small caps, and the same rule that nothing is open on
// arrival.
//
// The one difference from a reminder is where the control sits. A reminder gives
// it its own line; here that made the band 60 pixels taller than the sentences
// it was hiding, because a 36-pixel target replaced a 16-pixel line. On the
// title's own line the band is shorter than before on both a desktop and the
// narrowest phone, which was the point.
//
// The title stays a link to the trip, so the control is its own button rather
// than the whole row -- a row that is both a link and a toggle makes a tap
// ambiguous. Rows with nothing behind them get no control.

import { useState } from "react";
import Link from "next/link";
import { DetailsToggle, DetailsText } from "@/components/TaskDetail";

export function DateWhy({
  title,
  href = null,
  scope = null,
  why = null,
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-w-0 flex-1">
      {/* The trip drops under the line rather than beside it on a narrow
          screen: a name and a title competing for the same row leaves one word
          per line. */}
      <span className="flex flex-wrap items-baseline justify-between gap-x-3">
        {/* The control wraps under the title on a narrow screen rather than
            squeezing it: held on one line it pushed the title to a word a line
            and hung off the edge of the card at 320. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm font-medium text-ink">
          {href ? (
            <Link
              className="underline decoration-line-strong underline-offset-2"
              href={href}
            >
              {title}
            </Link>
          ) : (
            title
          )}
          {why && (
            <DetailsToggle
              open={open}
              onToggle={() => setOpen((v) => !v)}
              title={title}
              className="-my-2 shrink-0"
            />
          )}
        </span>
        {scope && <span className="text-xs text-ink-soft">{scope}</span>}
      </span>
      {why && <DetailsText text={why} open={open} className="text-xs" />}
    </div>
  );
}
