import Link from "next/link";
import { tripPath } from "@/lib/trips/route";

// The way out of this screen to the list somebody actually ticks.
//
// This page is the templates -- the lists a new trip starts from. The list
// somebody wants the night before leaving is the one on the trip itself, and the
// only route to it used to be the trips board, then the trip, then its Packing
// tab. Three screens to reach the thing this screen is about.
//
// It has been built twice and both were wrong in opposite directions. As cards
// with progress bars it read as the subject of the page and pushed the templates
// below the fold. As a bare line of underlined names it was so quiet it looked
// like a mistake. So it asks a question instead: a small box, a sentence naming
// exactly what somebody who took a wrong turn is looking for, and the trips
// under it as chips big enough for a thumb. Soonest first, since that is the
// order of how likely each one is to be the answer.
//
// The line count stays and nothing else does. Dates, how far away the trip is
// and how much is packed all belong to the trip, which is now one tap away; the
// count is only here because it is what says whether the list exists yet.

/**
 * @param {object[]} trips  [{ id, name, public_id, slug, total }], soonest first
 */
export default function TripPackingLinks({ trips = [] }) {
  if (!trips.length) return null;

  return (
    <nav
      /* Teal rather than sand. On the sand ground of this page a sand box is
         nearly the page itself, and the one thing on the templates screen that
         is not a template read as part of the furniture. The teal is the
         colour the app already uses for the way onward -- links, the primary
         button, the pro tips due soon -- so this reads as a door rather than
         as a warning. */
      className="mb-6 rounded-2xl border border-teal/30 bg-teal-soft/70 px-4 py-3.5"
      aria-label="Packing lists on upcoming trips"
    >
      <p className="text-sm font-semibold text-teal">
        Looking for a trip&rsquo;s packing list?
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {trips.map((trip) => (
          <Link
            key={trip.id}
            href={tripPath(trip, "packing")}
            /* Its own pill rather than .chip: a chip is uppercase and 0.675rem,
               which is a label for a fact, not something a thumb aims at with a
               trip's name in it. Nothing forces the name onto one line either:
               a household with a long trip name on a 320px phone should get a
               two-line pill rather than one that runs off the side of the box. */
            className="rounded-full border border-teal/25 bg-white max-w-full px-3 py-1.5 text-[0.82rem] font-medium transition hover:border-teal hover:text-teal"
          >
            {trip.name}
            {trip.total ? (
              <span className="pl-1.5 opacity-55">{trip.total}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
