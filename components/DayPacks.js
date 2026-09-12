"use client";

import { useMemo, useState } from "react";
import { dayPackSummary } from "@/lib/daypack/pack";
import { formatDay } from "@/lib/format";
import DayPack from "./DayPack";
import ZoneBand, { SunIcon } from "./ZoneBand";

/**
 * The day packs as their own list, beside the suitcase.
 *
 * The itinerary is where a day pack is used and this is where it is prepared: the
 * night before, somebody wants to see all of them at once and notice that Thursday
 * is empty. So this is an index -- a row for each day that has anything, with how
 * much of it is already in the bag -- and opening a row shows the same card the day
 * itself shows, writing to the same rows.
 *
 * Nothing is drawn when the trip has no day packs at all. This screen is already
 * long, and an empty section promising a feature is worse than no section.
 */
export default function DayPacks({
  tripId,
  rows = [],
  tips = [],
  people = [],
  userId = null,
  readOnly = false,
  onChange = () => {},
}) {
  const [open, setOpen] = useState(null);
  // The days that have something, worked out from the things themselves rather
  // than from the trip window. A trip is eleven days long and three of them have a
  // bag; the other eight belong on the itinerary, where there is a reason to open
  // an empty day, and not in an index of eleven mostly empty rows.
  const days = useMemo(() => {
    const set = new Set();
    for (const row of rows || []) if (row?.item_date) set.add(row.item_date);
    for (const tip of tips || [])
      if (tip?.for_date && (tip.status || "active") === "active")
        set.add(tip.for_date);
    return Array.from(set).sort();
  }, [rows, tips]);
  const summary = useMemo(
    () => dayPackSummary({ rows, tips, days }),
    [rows, tips, days],
  );

  if (!summary.length) return null;

  return (
    <section className="mb-5">
      {/* A band rather than a label over a subtitle. The sentence it used to
          carry -- "what is carried on the day, not what is in the case" -- was
          explaining a distinction that the two names now make on their own, once
          the suitcase below has a band of its own to be named by. The count is
          in days because that is the unit somebody scans this list in: three of
          eleven days have a bag. */}
      <ZoneBand
        icon={<SunIcon className="h-[15px] w-[15px]" />}
        name="Day packs"
        count={`${summary.length} ${summary.length === 1 ? "day" : "days"}`}
      />

      {/* Held by the band on a hairline, the way the menu holds the pages inside
          a group, so a day row cannot be read as another category of the case. */}
      <ul className="zone-kids space-y-1.5">
        {summary.map((day) => {
          const key = day.date || "every";
          const showing = open === key;
          const share = day.total
            ? Math.round((day.packed / day.total) * 100)
            : 0;
          return (
            <li key={key} className="card overflow-hidden">
              <button
                type="button"
                onClick={() => setOpen(showing ? null : key)}
                aria-expanded={showing}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">
                    {day.everyDay ? "Every day" : formatDay(day.date)}
                  </span>
                  {/* The bar and the count say the same thing twice on purpose:
                      the bar is what you see while scrolling and the count is
                      what a screen reader gets. */}
                  <span
                    aria-hidden="true"
                    className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-sand"
                  >
                    <span
                      className="block h-full rounded-full bg-teal"
                      style={{ width: `${share}%` }}
                    />
                  </span>
                </span>
                <span className="tabular shrink-0 text-xs text-ink-soft">
                  {day.packed} of {day.total}
                </span>
                <span
                  aria-hidden="true"
                  className={`shrink-0 text-xs text-ink-soft transition ${
                    showing ? "rotate-90" : ""
                  }`}
                >
                  ▶
                </span>
              </button>
              {showing && (
                <div className="border-t border-line px-3 pb-3 pt-2">
                  <DayPack
                    date={day.date}
                    dayLabel={day.everyDay ? "" : formatDay(day.date)}
                    heading={null}
                    tripId={tripId}
                    rows={rows}
                    tips={tips}
                    people={people}
                    userId={userId}
                    readOnly={readOnly}
                    onChange={onChange}
                    className="border-0 bg-transparent px-0 py-0"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
