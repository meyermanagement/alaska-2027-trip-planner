"use client";

import { useState } from "react";
import Link from "next/link";
import { PendingSpark, PendingVeil } from "@/components/LinkPending";
import { formatRange, daysUntil, tripDayNumber } from "@/lib/format";
import { basicsProgress, nextBasic, whenText } from "@/lib/trips/basics";
import PromoteDraft from "@/components/PromoteDraft";
import { tripPath } from "@/lib/trips/route";

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

/**
 * The trip they are on right now, in a panel of its own above everything else.
 *
 * It used to be an ordinary card in Upcoming, which was wrong in a way that only
 * showed up on the day: the trip you are standing in the middle of looked exactly
 * like the two you have not taken yet, and its countdown chip read "0 days away".
 * So it comes out of that list and gets a shape nothing else on the page has —
 * tinted, full width, above the tab switcher rather than inside it, because it is
 * the one thing here that should not be possible to hide behind a tab.
 *
 * Wider than the other cards on purpose. Every other card on this screen is an
 * invitation to plan something; this one is the answer to "what is happening
 * today", so it carries a button rather than only being tappable.
 */
function CurrentCard({ trip, today }) {
  const where = tripDayNumber(trip, today);
  return (
    <section
      aria-label={`${trip.name}, happening now`}
      className="rounded-2xl border border-teal/35 bg-teal-soft p-5 shadow-[0_14px_34px_-26px_rgba(15,95,87,0.55)]"
    >
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="emoji-badge" aria-hidden="true">
          {trip.cover_emoji}
        </span>
        <span className="chip bg-teal text-white">Happening now</span>
        {where && (
          <span className="text-xs font-bold uppercase tracking-[0.09em] text-teal">
            Day {where.day} of {where.of}
          </span>
        )}
      </div>
      <h3 className="font-display mt-3 text-2xl font-semibold text-ink">
        {trip.name}
      </h3>
      <p className="mt-0.5 text-sm font-semibold text-teal">
        {formatRange(trip.start_date, trip.end_date)}
        {trip.destination ? ` · ${trip.destination}` : ""}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          href={tripPath(trip, "itinerary")}
          className="btn btn-primary relative"
        >
          <PendingVeil />
          Open today’s plan
        </Link>
        <Link
          href={tripPath(trip, "packing")}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
        >
          Packing {trip.packed}/{trip.packing}
          <PendingSpark />
        </Link>
        {trip.tasks > trip.tasksDone && (
          <Link
            href={tripPath(trip, "tasks")}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
          >
            {trip.tasks - trip.tasksDone} still to do
            <PendingSpark />
          </Link>
        )}
      </div>
      <p className="mt-3 text-xs font-semibold text-ink-soft">
        {trip.going.length
          ? `Going: ${trip.going.join(", ")}`
          : "Nobody added yet"}
      </p>
    </section>
  );
}

function UpcomingCard({ trip }) {
  const countdown = daysUntil(trip.start_date);
  return (
    <Link
      href={tripPath(trip)}
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

function DraftProgress({ trip }) {
  const { answered, total, complete } = basicsProgress(trip);
  const next = nextBasic(trip);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span>
          {answered} of {total} sketched in
        </span>
        {!complete && next && (
          <span className="font-normal text-ink-faint">
            next: {next.label.toLowerCase()}
          </span>
        )}
      </div>
      <div
        className="mt-1 h-1 w-full overflow-hidden rounded-full bg-sand-deep"
        role="img"
        aria-label={`${answered} of ${total} basics answered`}
      >
        <div
          className="h-full rounded-full bg-teal"
          style={{ width: `${Math.round((answered / total) * 100)}%` }}
        />
      </div>
    </div>
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
          href={tripPath(trip)}
          className="inline-flex items-center gap-2 hover:text-teal"
        >
          {trip.name}
          <PendingSpark className="h-4 w-4" />
        </Link>
      </h3>
      {/* What the family said about when beats a range worked out from it, and a
          range nobody settled says so. A draft is exactly where a guess gets
          mistaken for a decision, because there is nothing else on the card to
          contradict it. */}
      <p className="mt-0.5 text-sm font-medium text-ink-soft">
        {whenText(trip) || "No dates yet"}
        {trip.dates_approximate && trip.start_date && (
          <span className="ml-1.5 text-xs font-normal text-ink-faint">
            approximate
          </span>
        )}
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
        {/* The six baseline components, and how many have an answer. This is the
            number that says whether a draft is nearly a trip or barely an idea --
            "3 plans so far" says neither. */}
        <DraftProgress trip={trip} />
        <div className="mt-2 flex flex-wrap gap-2">
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
          href={tripPath(trip)}
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
      href={tripPath(trip)}
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

export default function TripBoard({
  current = [],
  upcoming,
  drafts,
  past,
  today,
}) {
  // Land on whatever the family most likely came for: their next trips, unless
  // there are none and something is half-written. A trip in progress is above the
  // switcher rather than in it, so it counts as having something to show and the
  // page does not open on Drafts while they are away.
  const [view, setView] = useState(
    upcoming.length === 0 && current.length === 0 && drafts.length > 0
      ? "drafts"
      : "upcoming",
  );

  const tabs = [
    { id: "upcoming", label: "Upcoming", count: upcoming.length },
    { id: "drafts", label: "Drafts", count: drafts.length },
    { id: "past", label: "Past", count: past.length },
  ];

  return (
    <>
      {current.length > 0 && (
        <div className="mb-7 space-y-4">
          {current.map((trip) => (
            <CurrentCard key={trip.id} trip={trip} today={today} />
          ))}
        </div>
      )}

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
              {current.length > 0
                ? "Nothing after this one yet. The trip you are on is above — start the next one whenever you are ready."
                : "No trips coming up. Start one whenever you are ready — or sketch an idea in Drafts and move it here once it is settled."}
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
              Nothing sketched out yet. Press “Trip builder”, say what you have
              in mind, and Aly will build it with you — a place, roughly when,
              and whatever else you feel like telling her. It stays here until
              you move it across.
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
