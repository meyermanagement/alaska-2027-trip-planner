import Link from "next/link";
import { tripDayNumber } from "@/lib/format";

/**
 * The band that appears while the family is actually away.
 *
 * It sits above the logo rather than under it, which is the one placement
 * decision worth explaining. Everything else in the header is navigation — where
 * would you like to go — and this is not that. On the day you leave, the app
 * stops being a planner and becomes a thing you check standing in an airport, and
 * the only question it needs to answer in that moment is "what is happening
 * today". So the answer goes above the name of the app, because for the length of
 * the trip it matters more than the name of the app does.
 *
 * It rides in the sticky header, so it is reachable from any screen at any point
 * in a scroll. That is the "anytime" part: you should never have to go back to
 * Trips, find the trip you are on, and open the itinerary, in order to remember
 * what time the tour leaves.
 *
 * It links at ?tab=itinerary rather than at some new today-only screen, because
 * the itinerary already opens on today whenever the trip is happening. A separate
 * screen would be a second place for the same information to be right or wrong,
 * and you would still want the day either side of it.
 *
 * Solid teal, and quieter than the rose passport band below it, because the order
 * has to be honest: a passport that will not work is a problem, and being on
 * holiday is not.
 */
export default function CurrentTripBanner({ trip, today }) {
  if (!trip?.slug) return null;
  const where = tripDayNumber(trip, today);

  return (
    <div className="no-print border-b border-teal/30 bg-teal text-white">
      <Link
        href={`/trips/${trip.slug}?tab=itinerary`}
        aria-label={`${trip.name} is happening now — open today's plan`}
        className="mx-auto flex max-w-5xl items-center gap-2.5 px-5 py-2 transition hover:bg-white/10"
      >
        <span aria-hidden="true" className="shrink-0 text-base leading-none">
          {trip.cover_emoji || "🧭"}
        </span>
        {/* The day count comes before the trip name and never truncates: on a
            narrow screen the useful half of this band is which day it is. */}
        {where && (
          <span className="shrink-0 whitespace-nowrap text-[0.7rem] font-bold uppercase tracking-[0.09em] text-white/80">
            Day {where.day} of {where.of}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-[0.9rem] font-semibold">
          {trip.name}
        </span>
        {/* Spelled out where there is room, and a chevron where there is not —
            but never nothing, because a band that is a link has to look like one. */}
        <span className="hidden shrink-0 whitespace-nowrap text-[0.8rem] font-semibold text-white/90 sm:inline">
          Today’s plan →
        </span>
        <span
          aria-hidden="true"
          className="shrink-0 text-[0.9rem] font-semibold text-white/90 sm:hidden"
        >
          →
        </span>
      </Link>
    </div>
  );
}
