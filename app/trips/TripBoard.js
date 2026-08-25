"use client";

import { useState } from "react";
import Link from "next/link";
import { PendingSpark, PendingVeil } from "@/components/LinkPending";
import { formatRange, daysUntil } from "@/lib/format";
import PromoteDraft from "@/components/PromoteDraft";

// Three kinds of trip, three shapes of card. Upcoming trips are the reason the
// app exists, so they stay large; drafts are unfinished, so they read as
// sketches; past trips are a record, so they are compact.
//
// They used to be stacked on one page, which meant the finished trips pushed
// everything else down and there was nowhere to put drafts at all. Now one
// group is on screen at a time, behind a switch that shows how many of each
// there are — and printing still lays out all three, since the switch is
// interactive and paper is not.

function Section({ id, view, title, blurb, count, children }) {
  return (
    <section className={view === id ? "" : "hidden print:block"}>
      <div className="flex items-center gap-3">
        <h2 className="font-display text-lg font-semibold text-ink-soft">
          {title}
        </h2>
        <span className="h-px flex-1 bg-[var(--line)]" aria-hidden="true" />
        {/* The tabs already carry the counts on screen; paper has no tabs. */}
        <span className="hidden text-xs font-semibold text-ink-soft print:inline">
          {count}
        </span>
      </div>
      {blurb && <p className="mt-1 text-sm text-ink-soft">{blurb}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function UpcomingCard({ trip }) {
  const countdown = daysUntil(trip.start_date);
  return (
    <Link
      href={`/trips/${trip.slug}`}
      className="card group relative flex flex-col p-5 transition hover:border-teal/40 hover:shadow-md"
    >
      <PendingVeil />
      <div className="flex items-start justify-between gap-3">
        <span className="emoji-badge" aria-hidden="true">
          {trip.cover_emoji}
        </span>
        {countdown !== null && countdown >= 0 && (
          <span className="chip bg-teal-soft text-teal">
            {countdown} days away
          </span>
        )}
      </div>
      <h3 className="font-display mt-3 text-xl font-semibold group-hover:text-teal">
        {trip.name}
      </h3>
      <p className="mt-0.5 text-sm font-medium text-ink-soft">
        {formatRange(trip.start_date, trip.end_date)}
      </p>
      {trip.destination && (
        <p className="mt-2 text-sm text-ink-soft">{trip.destination}</p>
      )}
      {trip.summary && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-soft">
          {trip.summary}
        </p>
      )}
      <div className="mt-4 border-t border-[var(--line)] pt-3 text-xs font-semibold text-ink-soft">
        <div className="flex flex-wrap gap-2">
          <span>
            Packing {trip.packed}/{trip.packing}
          </span>
          <span aria-hidden>·</span>
          <span>
            Tasks {trip.tasksDone}/{trip.tasks}
          </span>
        </div>
        <p className="mt-1.5 font-normal">
          {trip.going.length
            ? `Going: ${trip.going.join(", ")}`
            : "Nobody added yet"}
        </p>
      </div>
    </Link>
  );
}

function DraftCard({ trip }) {
  return (
    <div className="flex flex-col rounded-2xl border border-dashed border-[var(--line-strong)] bg-white/60 p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="emoji-badge" aria-hidden="true">
          {trip.cover_emoji}
        </span>
        <span className="chip bg-sand-deep/60 text-amber">Draft</span>
      </div>
      <h3 className="font-display mt-3 text-xl font-semibold">
        <Link
          href={`/trips/${trip.slug}`}
          className="inline-flex items-center gap-2 hover:text-teal"
        >
          {trip.name}
          <PendingSpark className="h-4 w-4" />
        </Link>
      </h3>
      <p className="mt-0.5 text-sm font-medium text-ink-soft">
        {trip.start_date
          ? formatRange(trip.start_date, trip.end_date)
          : "No dates yet"}
      </p>
      {trip.destination && (
        <p className="mt-2 text-sm text-ink-soft">{trip.destination}</p>
      )}
      {trip.summary && (
        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-ink-soft">
          {trip.summary}
        </p>
      )}
      <div className="mt-4 border-t border-[var(--line)] pt-3 text-xs font-semibold text-ink-soft">
        <div className="flex flex-wrap gap-2">
          <span>
            {trip.stops} {trip.stops === 1 ? "plan" : "plans"} so far
          </span>
          {trip.packing > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{trip.packing} to pack</span>
            </>
          )}
        </div>
        <p className="mt-1.5 font-normal">
          {trip.going.length
            ? `Going: ${trip.going.join(", ")}`
            : "Nobody added yet"}
        </p>
      </div>
      <div className="no-print mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={`/trips/${trip.slug}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
        >
          Keep working on it
          <PendingSpark />
        </Link>
        <PromoteDraft trip={trip} />
      </div>
    </div>
  );
}

function PastCard({ trip }) {
  return (
    <Link
      href={`/trips/${trip.slug}`}
      className="group relative flex flex-col rounded-xl border border-[var(--line)] bg-white/55 p-4 transition hover:-translate-y-px hover:border-teal/30 hover:bg-white hover:shadow-[0_10px_26px_-20px_rgba(20,32,30,0.3)]"
    >
      <PendingVeil />
      <div className="flex items-center gap-2.5">
        <span className="emoji-badge emoji-badge-sm" aria-hidden="true">
          {trip.cover_emoji}
        </span>
        <div className="min-w-0">
          <h3 className="font-display truncate text-base font-semibold group-hover:text-teal">
            {trip.name}
          </h3>
          <p className="text-xs font-medium text-ink-soft">
            {formatRange(trip.start_date, trip.end_date)}
          </p>
        </div>
      </div>
      {trip.destination && (
        <p className="mt-2.5 line-clamp-2 text-xs leading-relaxed text-ink-soft">
          {trip.destination}
        </p>
      )}
      <div className="mt-3 border-t border-[var(--line)] pt-2.5 text-[0.7rem] font-semibold text-ink-soft">
        <div className="flex flex-wrap gap-2">
          <span>
            {trip.stops} {trip.stops === 1 ? "stop" : "stops"}
          </span>
          {trip.packing > 0 && (
            <>
              <span aria-hidden>·</span>
              <span>{trip.packing} things packed</span>
            </>
          )}
        </div>
        {trip.going.length > 0 && (
          <p className="mt-1 font-normal">Went: {trip.going.join(", ")}</p>
        )}
      </div>
    </Link>
  );
}

export default function TripBoard({ upcoming, drafts, past }) {
  // Land on whatever the family most likely came for: their next trips, unless
  // there are none and something is half-written.
  const [view, setView] = useState(
    upcoming.length === 0 && drafts.length > 0 ? "drafts" : "upcoming",
  );

  const tabs = [
    { id: "upcoming", label: "Upcoming", count: upcoming.length },
    { id: "drafts", label: "Drafts", count: drafts.length },
    { id: "past", label: "Past", count: past.length },
  ];

  return (
    <>
      <div
        className="no-print mb-6 inline-flex rounded-full border border-[var(--line)] bg-white p-1"
        role="tablist"
        aria-label="Which trips to show"
      >
        {tabs.map((t) => {
          const on = view === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setView(t.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                on
                  ? "bg-teal text-white shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
              <span
                className={`ml-1.5 text-xs font-semibold ${
                  on ? "text-white/70" : "text-ink-soft/60"
                }`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-12">
        <Section
          id="upcoming"
          view={view}
          title="Upcoming trips"
          count={upcoming.length}
        >
          {upcoming.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {upcoming.map((trip) => (
                <UpcomingCard key={trip.id} trip={trip} />
              ))}
            </div>
          ) : (
            <p className="card p-5 text-sm text-ink-soft">
              No trips coming up. Start one whenever you are ready — or sketch
              an idea in Drafts and move it here once it is settled.
            </p>
          )}

          {drafts.length > 0 && (
            <button
              type="button"
              onClick={() => setView("drafts")}
              className="no-print mt-4 text-sm font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
            >
              {drafts.length === 1
                ? "1 draft in the works"
                : `${drafts.length} drafts in the works`}
            </button>
          )}
        </Section>

        <Section
          id="drafts"
          view={view}
          title="Draft trips"
          blurb="Ideas being worked out. Nothing here is on the family calendar until you move it to Upcoming."
          count={drafts.length}
        >
          {drafts.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {drafts.map((trip) => (
                <DraftCard key={trip.id} trip={trip} />
              ))}
            </div>
          ) : (
            <p className="card p-5 text-sm text-ink-soft">
              Nothing sketched out yet. Press “New trip” and either mark it a
              draft or hand the idea to Aly — she will draft the whole thing and
              leave it here.
            </p>
          )}
        </Section>

        <Section
          id="past"
          view={view}
          title="Past trips"
          blurb="Kept for the record — itineraries, packing lists and notes are all still here."
          count={past.length}
        >
          {past.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {past.map((trip) => (
                <PastCard key={trip.id} trip={trip} />
              ))}
            </div>
          ) : (
            <p className="card p-5 text-sm text-ink-soft">
              Nothing finished yet. Trips move here on their own once the last
              day has gone by.
            </p>
          )}
        </Section>
      </div>
    </>
  );
}
