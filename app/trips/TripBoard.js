"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PendingSpark, PendingVeil } from "@/components/LinkPending";
import {
  countdownSaid,
  formatRange,
  daysUntil,
  isArchivedTrip,
} from "@/lib/format";
import { basicsProgress, nextBasic, whenText } from "@/lib/trips/basics";
import PromoteDraft from "@/components/PromoteDraft";
import TripBackdrop from "@/components/TripBackdrop";
import RemoveTrip from "@/components/RemoveTrip";
import ArchiveTrip from "@/components/ArchiveTrip";
import CoverQueue from "@/components/CoverQueue";
import { tripPath } from "@/lib/trips/route";
import BoardSkeleton from "./BoardSkeleton";
import { TRIPS_VIEW_EVENT, TRIP_VIEWS } from "@/lib/trips/viewEvent";

// How long the skeleton stands there when the menu asks for a group. The groups
// are all already here, so this is not a wait for data -- it is long enough to
// read as a screen arriving rather than a flicker, and short enough that nobody
// waits for it. See lib/trips/viewEvent.js for why the menu does this at all.
const SWITCH_MS = 380;

// Three kinds of trip, three shapes of card. Upcoming trips are the reason the
// app exists, so they stay large; drafts are unfinished, so they read as
// sketches; past trips are a record, so they are compact.
//
// They used to be stacked on one page, which meant the finished trips pushed
// everything else down and there was nowhere to put drafts at all. Now one
// group is on screen at a time, behind a switch that shows how many of each
// there are — and printing still lays out all three, since the switch is
// interactive and paper is not.

const VIEWS = TRIP_VIEWS;

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
 * And .plate-invert, which is what actually makes it unmissable. See the rule in
 * globals.css: the panel takes the opposite polarity to the page, so it is a dark
 * card on the three light skins and a light card on the two dark ones. Shape alone
 * was not enough -- on four of the five skins this panel was the same value as
 * every card under it, which is the one thing a "happening now" panel cannot be.
 *
 * Wider than the other cards on purpose. Every other card on this screen is an
 * invitation to plan something; this one is the answer to "what is happening
 * today", so it carries a button rather than only being tappable.
 */
// The trip the family is on. It is the same object as every other card on this
// screen, so it opens the same way: the whole plate is the tap target, and it
// goes to the trip. It used to carry a button into today's plan instead, which
// made the one card you most want to open the only one you had to aim at.
function CurrentCard({ trip }) {
  return (
    <Link
      href={tripPath(trip)}
      aria-label={`${trip.name}, happening now`}
      className="trip-plate plate-invert card on-photo min-h-[248px] justify-end border-transparent transition hover:border-teal/40 hover:shadow-md"
    >
      <TripBackdrop trip={trip} shape="head" plain />
      <PendingVeil href={tripPath(trip)} />
      <div className="relative p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="emoji-badge" aria-hidden="true">
            {trip.cover_emoji}
          </span>
          <span className="chip chip-accent">Happening now</span>
        </div>
        <h3 className="font-display mt-3 text-2xl font-semibold">
          {trip.name}
        </h3>
        <p className="mt-0.5 text-sm font-semibold">
          {formatRange(trip.start_date, trip.end_date)}
          {trip.destination ? ` · ${trip.destination}` : ""}
        </p>
        {/* Said, not linked: the card is the link now, and a second one nested
            inside it would be neither valid nor tappable. */}
        {trip.tasks > trip.tasksDone && (
          <p className="mt-3 text-sm font-semibold">
            {trip.tasks - trip.tasksDone} still to do
          </p>
        )}
      </div>
    </Link>
  );
}

function UpcomingCard({ trip, canRemove = false }) {
  const countdown = daysUntil(trip.start_date);
  return (
    <div className="flex flex-col">
      <Link
        href={tripPath(trip)}
        className="trip-plate card on-photo group min-h-[268px] justify-end transition hover:border-teal/40 hover:shadow-md sm:min-h-[306px]"
      >
        <TripBackdrop trip={trip} />
        <PendingVeil href={tripPath(trip)} />
        {/* Everything the card says sits in the bottom of the picture rather than
            on paper above it. Which is the whole point of the plate: the name of
            the trip is read against the place it is about. */}
        <div className="relative grid gap-2 p-4 pt-8 sm:p-[17px] sm:pt-10">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[1.2rem] leading-none" aria-hidden="true">
              {trip.cover_emoji}
            </span>
            <h3 className="font-display text-xl font-semibold sm:text-[1.32rem]">
              {trip.name}
            </h3>
          </div>
          <p className="text-[0.82rem] font-medium opacity-95">
            {formatRange(trip.start_date, trip.end_date)}
            {trip.destination && (
              <>
                <span className="px-1.5 opacity-55" aria-hidden="true">
                  ·
                </span>
                {trip.destination}
              </>
            )}
          </p>
          {/* Three or four chips, and no paragraph. The summary, the tiles and
              the roster live on the trip's own Overview tab; a card is for
              recognizing a trip and knowing how close it is. */}
          <div className="flex flex-wrap gap-1.5">
            {countdown !== null && countdown >= 0 && (
              <span className="chip chip-shade">
                {countdownSaid(countdown)}
              </span>
            )}
            {trip.going.length > 0 && (
              <span className="chip">{trip.going.join(", ")}</span>
            )}
            {trip.packing > 0 && (
              <span className="chip">
                {trip.packed}/{trip.packing} packed
              </span>
            )}
            {trip.tasks > trip.tasksDone && (
              <span className="chip">{trip.tasks - trip.tasksDone} to do</span>
            )}
          </div>
        </div>
      </Link>
      {/* Outside the card, not inside it. The whole card is one link, and a
          button nested in a link is both invalid and a trap: the press that
          opens the confirm would also navigate away from it. */}
      {canRemove && (
        <div className="mt-2 flex justify-end">
          <RemoveTrip trip={trip} />
        </div>
      )}
    </div>
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

function DraftCard({ trip, canRemove = false }) {
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
        {/* A draft is the thing most likely to have been started by accident, so
            the way out sits beside the way forward. */}
        {canRemove && <RemoveTrip trip={trip} />}
      </div>
    </div>
  );
}

function PastCard({ trip, canArchive = false }) {
  return (
    <div>
      <Link
        href={tripPath(trip)}
        className="trip-plate card on-photo group min-h-[168px] justify-end transition hover:-translate-y-px hover:border-teal/30 hover:shadow-[0_10px_26px_-20px_rgba(36,31,24,0.4)]"
      >
        <TripBackdrop trip={trip} />
        <PendingVeil href={tripPath(trip)} />
        <div className="relative grid gap-1.5 p-3.5 pt-7">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none" aria-hidden="true">
              {trip.cover_emoji}
            </span>
            <h3 className="font-display truncate text-[0.98rem] font-semibold">
              {trip.name}
            </h3>
          </div>
          <p className="text-[0.74rem] font-medium opacity-95">
            {formatRange(trip.start_date, trip.end_date)}
            {trip.destination && (
              <>
                <span className="px-1.5 opacity-55" aria-hidden="true">
                  ·
                </span>
                {trip.destination}
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className="chip">
              {trip.stops} {trip.stops === 1 ? "stop" : "stops"}
            </span>
            {trip.going.length > 0 && (
              <span className="chip">{trip.going.join(", ")}</span>
            )}
          </div>
        </div>
      </Link>
      {/* Outside the link, for the same reason the remove control is: the whole
          plate is one link, and a button nested inside it would navigate away
          from the thing it just did. */}
      {canArchive && (
        <div className="mt-1.5 flex justify-end">
          <ArchiveTrip trip={trip} />
        </div>
      )}
    </div>
  );
}

export default function TripBoard({
  current = [],
  upcoming,
  drafts,
  past,
  today,
  canRemove = false,
}) {
  // Which group is showing lives in the address and nowhere else. The menu's
  // three trip rows are this one screen with a different group open, so arriving
  // from Trip Log while already standing on Drafts changes only the query --
  // React keeps the component mounted, and a group held in state would have sat
  // there on Drafts ignoring the address it was just sent to. Reading the query
  // instead means the menu and the tabs cannot disagree, because there is only
  // one of them.
  const params = useSearchParams();
  const asked = String(params.get("view") || "").toLowerCase();
  const wanted = VIEWS.includes(asked) ? asked : null;

  // A press shows its group at once, before the address has caught up, and is
  // dropped the moment the address says anything -- including the same thing.
  const [picked, setPicked] = useState(null);
  useEffect(() => {
    setPicked(null);
  }, [asked]);

  // A group asked for from the menu, still being drawn.
  const [switching, setSwitching] = useState(null);

  // The archive says "Hide" once it is open, the way the other shut panels in the
  // app do, so it has to be told whether it is.
  const [archivedOpen, setArchivedOpen] = useState(false);

  // With nothing asked for, land on whatever the family most likely came for:
  // their next trips, unless there are none and something is half-written. A trip
  // in progress is above the switcher rather than in it, so it counts as having
  // something to show and the page does not open on Drafts while they are away.
  const view =
    picked ||
    wanted ||
    (upcoming.length === 0 && current.length === 0 && drafts.length > 0
      ? "drafts"
      : "upcoming");

  // Pressing a tab writes the group into the address, so a reload or a shared
  // link lands on the group the reader was actually looking at. Written straight
  // into history rather than through the router: the three groups are all already
  // on this page, so asking the server to render the screen again would be a
  // network wait and a fresh skeleton in exchange for nothing. Next supports this
  // exact case, and useSearchParams above keeps up with it.
  //
  // All three write a group, Upcoming included. Leaving it off would be tidier
  // addresses and a real bug: an empty query means "decide for me", and for a
  // family with drafts and nothing booked that decision is Drafts -- so pressing
  // Upcoming would have bounced straight back.
  const pathname = usePathname();
  const show = (id) => {
    setPicked(id);
    try {
      window.history.replaceState(null, "", `${pathname}?view=${id}`);
    } catch {
      // An address that does not keep up is not worth losing the tab over.
    }
  };

  // The menu's request. The skeleton goes up first and the group is drawn after
  // it, so the press is answered by something changing rather than by nothing.
  const askedRef = useRef(null);
  useEffect(() => {
    function onAsk(e) {
      const id = String(e?.detail?.view || "").toLowerCase();
      if (!VIEWS.includes(id)) return;
      askedRef.current = id;
      setSwitching(id);
    }
    window.addEventListener(TRIPS_VIEW_EVENT, onAsk);
    return () => window.removeEventListener(TRIPS_VIEW_EVENT, onAsk);
  }, []);

  // Drawn as its own step so the skeleton has been painted before the group
  // replaces it, and so a second request landing mid-wait simply wins.
  useEffect(() => {
    if (!switching) return undefined;
    const timer = setTimeout(() => {
      setPicked(switching);
      try {
        window.history.replaceState(null, "", `${pathname}?view=${switching}`);
      } catch {
        // An address that does not keep up is not worth losing the group over.
      }
      setSwitching(null);
    }, SWITCH_MS);
    return () => clearTimeout(timer);
  }, [switching, pathname]);

  // Past trips, split in two. The shelf is what the screen opens on; the archive is
  // what somebody put away. Both are past, so the arithmetic that decides that is
  // done once, upstream -- this only asks which of the two a finished trip is in.
  const archived = past.filter(isArchivedTrip);
  const shelf = past.filter((t) => !isArchivedTrip(t));

  const tabs = [
    { id: "upcoming", label: "Upcoming", count: upcoming.length },
    { id: "drafts", label: "Drafts", count: drafts.length },
    { id: "past", label: "Past", count: shelf.length },
  ];

  if (switching) {
    return (
      <>
        <span className="sr-only" role="status">
          Loading
        </span>
        <BoardSkeleton />
      </>
    );
  }

  return (
    <>
      {/* Headless. A trip promoted from this very page, or from Aly while
          nobody was on the trip screen, gets its picture asked for here --
          one at a time, soonest trip first. */}
      <CoverQueue trips={[...current, ...upcoming]} />
      {current.length > 0 && (
        <div className="mb-7 space-y-4">
          {current.map((trip) => (
            <CurrentCard key={trip.id} trip={trip} />
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
              onClick={() => show(t.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${
                on
                  ? "bg-teal text-on-accent shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
              <span
                className={`ml-1.5 text-xs font-semibold ${
                  on ? "text-on-accent/70" : "text-ink-soft/60"
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
                <UpcomingCard key={trip.id} trip={trip} canRemove={canRemove} />
              ))}
            </div>
          ) : (
            <p className="card p-5 text-sm text-ink-soft">
              {current.length > 0
                ? "Nothing after this one yet. The trip you are on is above — start the next one whenever you are ready."
                : "No trips coming up. Start one whenever you are ready — or sketch an idea in Drafts and move it here once it is settled."}
            </p>
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
                <DraftCard key={trip.id} trip={trip} canRemove={canRemove} />
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
          count={shelf.length}
        >
          {shelf.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shelf.map((trip) => (
                <PastCard key={trip.id} trip={trip} canArchive />
              ))}
            </div>
          ) : (
            <p className="card p-5 text-sm text-ink-soft">
              {archived.length > 0
                ? "Everything finished is in the archive below."
                : "Nothing finished yet. Trips move here on their own once the last day has gone by."}
            </p>
          )}

          {/* Shut, and counted on the outside. The archive is for the trips
              somebody decided they were done looking at, so it opens on being
              asked and not before -- and what it holds still teaches Aly what
              this family likes, still seeds the next packing list, and is one
              press away when somebody wants to remember where they ate. */}
          {archived.length > 0 && (
            <details
              className="no-print card mt-6 px-4 py-3.5"
              open={archivedOpen}
              onToggle={(e) => setArchivedOpen(e.currentTarget.open)}
            >
              <summary className="flex cursor-pointer list-none items-center gap-2">
                <h3 className="font-display text-lg font-semibold text-ink">
                  Archived
                </h3>
                <span className="text-sm text-ink-soft">{archived.length}</span>
                <span className="ml-auto text-xs font-semibold uppercase tracking-[0.09em] text-teal">
                  {archivedOpen ? "Hide" : "Show"}
                </span>
              </summary>
              <p className="mt-2 text-sm text-ink-soft">
                Put away, and still counted. These trips keep teaching Aly what
                the family likes and still seed the packing lists of the trips
                to come.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {archived.map((trip) => (
                  <PastCard key={trip.id} trip={trip} canArchive />
                ))}
              </div>
            </details>
          )}
        </Section>
      </div>
    </>
  );
}
