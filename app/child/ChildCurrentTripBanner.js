"use client";
import { tripDayNumber } from "@/lib/format";

// Same visual band as the regular app, but a local action rather than an adult
// route. Its trip comes exclusively from the authorized child projection.
export default function ChildCurrentTripBanner({ trip, today, onOpen }) {
  const where = tripDayNumber(trip, today);
  if (!where) return null;
  return <header className="no-print sticky top-0 z-20">
    <div className="trip-band border-b border-teal/30 bg-teal text-on-accent">
      <button type="button" onClick={onOpen}
        aria-label={`${trip.name}, day ${where.day} of ${where.of}: open today's itinerary`}
        className="mx-auto flex w-full max-w-5xl items-center gap-2.5 py-2 pl-5 pr-4 text-left transition hover:bg-on-accent/10">
        <span className="shrink-0 whitespace-nowrap text-xs font-bold uppercase tracking-[0.09em] text-on-accent/80">
          Day {where.day} of {where.of}
        </span>
        <span className="min-w-0 flex-1 truncate text-base font-semibold">{trip.name}</span>
        <span className="hidden shrink-0 whitespace-nowrap text-sm font-semibold sm:inline">Today’s plan →</span>
        <span aria-hidden="true" className="shrink-0 text-2xl leading-none sm:hidden">→</span>
      </button>
    </div>
  </header>;
}
