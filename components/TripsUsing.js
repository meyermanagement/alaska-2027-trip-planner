import Link from "next/link";
import { formatDayYear } from "@/lib/format";

/**
 * Which upcoming trips a packing list reaches, each one a way into that trip's
 * own packing list.
 *
 * The point is the trip you are about to change. Editing a template is nearly
 * always the second half of a thought that started on a trip -- "the cruise list
 * is missing the hooks" -- and until now getting back to the trip meant the trips
 * index and a name you had to recognize.
 *
 * For a family list these are exactly the trips a push would reach, decided by the
 * same function the push button uses, so the screen cannot promise something the
 * button then declines to do. For an animal's list the rule is a different one and
 * belongs to the pets module: the list applies whenever that animal is coming, so
 * the trips here are the upcoming trips the animal is on.
 *
 * A trip already past, or finished, or abandoned is never here: this is about what
 * is still ahead, which is the only thing a list can still affect.
 *
 * @param trips [{ id, name, start_date, href, draft }]
 * @param empty what to say when the list reaches nothing, which is a real answer
 *              and not the same as not knowing.
 */
export default function TripsUsing({ trips, empty, className = "mt-2" }) {
  const list = Array.isArray(trips) ? trips : [];
  if (!list.length)
    return <p className={`${className} text-sm text-ink-soft`}>{empty}</p>;
  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {list.length === 1
          ? "On 1 upcoming trip"
          : `On ${list.length} upcoming trips`}
      </p>
      <ul className="mt-1 flex flex-wrap gap-2">
        {list.map((trip) => (
          <li key={trip.id}>
            <Link
              href={trip.href}
              // Not the chip class: chip sets small caps and letterspacing, which
              // turned a trip's own name into a label. A name should read as one.
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-sm hover:border-teal hover:bg-teal-soft"
            >
              <span className="font-medium text-teal">{trip.name}</span>
              <span className="text-xs text-ink-soft">
                {formatDayYear(trip.start_date)}
                {trip.draft ? " · draft" : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
