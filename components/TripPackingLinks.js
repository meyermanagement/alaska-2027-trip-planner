import Link from "next/link";
import { tripPath } from "@/lib/trips/route";

// A shortcut, not a section.
//
// This screen is about the templates. But the list somebody actually ticks is
// the one on the trip they are leaving for, and the only route to it was the
// trips board, then the trip, then its Packing tab. So the upcoming trips sit
// above the heading as one quiet line of links -- the way a breadcrumb sits
// above a page rather than the way a panel sits in it.
//
// It was built once as cards with progress bars and it was wrong: it read as the
// subject of the screen and pushed the templates below the fold. Everything that
// belonged to the trip rather than to getting there -- dates, how far away it is,
// how much is packed -- lives on the trip, which is one tap away. What is left
// is the name and a count, because the count is what tells you the list exists.

/**
 * @param {object[]} trips  [{ id, name, public_id, slug, total }], soonest first
 */
export default function TripPackingLinks({ trips = [] }) {
  if (!trips.length) return null;

  return (
    <nav
      className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[0.78rem] text-ink-soft"
      aria-label="Packing lists on upcoming trips"
    >
      <span className="text-ink-soft/80">Packing lists:</span>
      {/* Separated by space rather than by interpuncts. A dot between links
          strands itself at the end of a line as soon as the row wraps, which on a
          narrow phone it does three times. The underline already says where one
          link ends and the next begins. */}
      {trips.map((trip) => (
        <Link
          key={trip.id}
          href={tripPath(trip, "packing")}
          className="py-0.5 underline decoration-[var(--line)] decoration-1 underline-offset-2 transition hover:text-teal hover:decoration-teal"
        >
          {trip.name}
          {trip.total ? (
            <span className="opacity-70"> ({trip.total})</span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
