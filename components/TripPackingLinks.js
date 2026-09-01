import Link from "next/link";
import { formatRange, daysUntil } from "@/lib/format";
import { tripPath } from "@/lib/trips/route";

// The way in to the lists people actually tick.
//
// This screen is the templates: the lists every trip *starts* from. The list
// somebody wants at half past ten at night is the one on the trip they are
// leaving for, and the only route to it was the trips board and then the trip
// and then its Packing tab. Three screens to reach the thing this screen is
// about. So the upcoming trips sit above the templates, each with how far
// through its list the family is, because that number is the reason to open it.
//
// Ordered by how soon the trip is, which is also the order of how much the list
// matters. A trip that has no list yet says so rather than showing 0 of 0: the
// difference between "nothing packed" and "nothing to pack from" is the whole
// question of whether somebody needs to press a button.

function Bar({ packed, total }) {
  const pct = total ? Math.round((packed / total) * 100) : 0;
  return (
    <div
      className="mt-2 h-1.5 overflow-hidden rounded-full bg-sand"
      role="presentation"
    >
      <div
        className="h-full rounded-full bg-teal transition-[width]"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// A trip with no start date says nothing rather than "NaN days away", and the
// separator before it disappears with it -- see the render.
function awayText(trip) {
  const days = daysUntil(trip.start_date);
  if (days === null) return "";
  if (days < 0) return "Happening now";
  if (days === 0) return "Leaving today";
  if (days === 1) return "Tomorrow";
  return `${days} days away`;
}

/**
 * @param {object[]} trips  [{ id, name, cover_emoji, start_date, end_date,
 *                             public_id, slug, packed, total }]
 */
export default function TripPackingLinks({ trips = [] }) {
  if (!trips.length) return null;

  return (
    <section className="card mb-5 p-5" aria-label="Upcoming trip packing lists">
      <h2 className="section-label">The lists on your upcoming trips</h2>
      <p className="mt-1.5 text-sm text-ink-soft">
        The templates below are what a new trip starts from. These are the lists
        themselves, on the trips you are actually going on.
      </p>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {trips.map((trip) => (
          /* min-w-0 on the cell, not just on the heading: a grid column sizes
             itself to its content's minimum, and a nowrap truncating heading has
             no minimum smaller than the whole trip name -- so on a 320px phone
             the column grew past the screen and took the card with it rather
             than the name shortening. */
          <li key={trip.id} className="min-w-0">
            <Link
              href={tripPath(trip, "packing")}
              className="block rounded-2xl border border-[var(--line)] bg-white/70 p-3.5 transition hover:-translate-y-px hover:border-teal/40 hover:shadow-[0_10px_24px_-20px_rgba(36,31,24,0.35)]"
            >
              {/* The name is given the whole width and allowed to wrap. It was
                  sharing a line with the days-away chip, and on a 320px phone
                  that left "Walt..." -- the one thing on the card somebody needs
                  to read to know which trip it is. How far away the trip is
                  belongs with the dates, which is what it is a restatement of. */}
              <div className="flex items-start gap-2">
                <span
                  className="mt-0.5 text-base leading-none"
                  aria-hidden="true"
                >
                  {trip.cover_emoji}
                </span>
                <h3 className="font-display min-w-0 flex-1 font-semibold leading-snug">
                  {trip.name}
                </h3>
              </div>

              <p className="mt-1.5 text-[0.78rem] text-ink-soft">
                {formatRange(trip.start_date, trip.end_date)}
                {awayText(trip) && (
                  <>
                    <span className="px-1.5 opacity-55" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-medium text-ink">
                      {awayText(trip)}
                    </span>
                  </>
                )}
              </p>

              {trip.total ? (
                <>
                  <p className="mt-2 text-[0.78rem] font-semibold">
                    {trip.packed === trip.total
                      ? `All ${trip.total} packed`
                      : `${trip.packed} of ${trip.total} packed`}
                  </p>
                  <Bar packed={trip.packed} total={trip.total} />
                </>
              ) : (
                <p className="mt-2 text-[0.78rem] text-ink-soft">
                  No packing list yet — open the trip to build one from these
                  templates.
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
