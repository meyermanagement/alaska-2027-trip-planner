import { redirect } from "next/navigation";
import {
  preloadMenu,
  requestAccess,
  requestClient,
  requestUnreadFares,
  requestWho,
} from "@/lib/request/shared";
import { loadNow } from "@/lib/now/load";
import TopBar from "@/components/TopBar";
import NowGreeting from "./NowGreeting";
import NowTrips from "./NowTrips";
import LocationProTips from "@/components/LocationProTips";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import Reminders from "@/components/Reminders";
import MorningRun from "@/components/MorningRun";
import PushAlerts from "@/components/PushAlerts";
import NowBands from "./NowBands";
import NowAhead from "./NowAhead";
import NowEmpty from "./NowEmpty";
import {
  formatDay,
  formatTime,
  isPastTrip,
  tripDayNumber,
  HOME_ZONE,
} from "@/lib/format";
import {
  departureSaid,
  greetingFor,
  progressOf,
  todaysPlan,
} from "@/lib/now/home";
import {
  aheadDates,
  seasonAhead,
  seasonReason,
} from "@/lib/now/ahead";
import { draftsWaiting } from "@/lib/now/drafts";
import { monthsSaid } from "@/lib/someday/months";
import { farePriceLabel } from "@/lib/deals/award";
import { fareHasExpired } from "@/lib/deals/deadline";
import { offerEnded } from "@/lib/rewards-offers";
import { todayISO } from "@/lib/reminders";
import { assigneeOptions } from "@/lib/tasks/assignees";
import { remindersDueToday } from "@/lib/tasks/dueToday";
import { tripContradictions } from "@/lib/trips/contradictions";
import { tripPath, tripRef } from "@/lib/trips/route";

export const metadata = { title: "Now · Alyeska" };

/** The hour where the family lives, for the greeting. */
function homeHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: HOME_ZONE,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
}

// The screen the menu opens on the question a family actually has on a Tuesday:
// what needs me. It is the old Reminders screen with the lines today is about
// lifted out of the list and put above it -- what is late or due, what on a trip
// cannot all be true at once, and what mail has arrived and not been filed.
//
// Reminders is not a second screen beside this one. /reminders redirects here, so
// the count in the menu and the list under these bands are the same number about
// the same rows, whichever address somebody arrives on.

export default async function NowPage() {
  const supabase = await requestClient();
  const user = await requestWho();
  if (!user) redirect("/login");
  // The menu's reads start now, beside this screen's own, instead of after the
  // whole screen has been read. TopBar picks up the same promise when it draws.
  preloadMenu();

  // One access check, shared with the menu. It carries every household this
  // person belongs to, so the memberships are not read a second time here.
  const access = await requestAccess();
  if (!access) redirect("/join");
  const today = todayISO();

  // A secondary traveler is here for the trips they are on. Everything else this
  // screen assembles -- the household's mail, the morning mailer, the saved
  // places, the fares and the card bonuses -- is either refused to them by the
  // database or a door that redirects them back to Trips, so it is not read and
  // not drawn. Two of those reads are family-member-wide rather than
  // secondary-gated in RLS, which is exactly why the gate is in the loader.
  // Every read lives in lib/now/load.js, in two rounds.
  const {
    secondary,
    fareRows,
    tasks,
    taskTrips: trips,
    travelers,
    runs,
    waiting,
    visible,
    current,
    soon,
    ahead,
    emptyHanded,
    longRange,
    upcoming,
    roster,
    packingRows,
    heroTasks,
    planRows,
    itinerary,
    pets,
    petLinks,
    placeRows,
    dealRows,
    offerRows,
  } = await loadNow(supabase, {
    user,
    access,
    today,
    unreadFares: (_client, userId, familyId) =>
      requestUnreadFares(userId, familyId),
  });
  const heroRoster = roster;

  const assigneesByTrip = assigneeOptions({ trips, travelers, roster });

  // One card, built the same way whether the trip is today's or next week's, so
  // the two plates cannot drift apart on what a number means.
  const buildCard = (trip, days = null) => {
    const packing = progressOf(packingRows || [], trip.id);
    const mineTasks = (heroTasks || []).filter((row) => row.trip_id === trip.id);
    const going = (heroRoster || [])
      .filter((row) => row.trip_id === trip.id)
      .map(
        (row) =>
          (travelers || []).find((person) => person.id === row.traveler_id)?.name,
      )
      .filter(Boolean);
    const span = tripDayNumber(trip, today);
    return {
      id: trip.id,
      trip,
      name: trip.name,
      destination: trip.destination || null,
      start_date: trip.start_date,
      end_date: trip.end_date,
      days,
      dayNumber: span?.day || null,
      dayCount: span?.of || null,
      packing: packing.total,
      packed: packing.done,
      todo: mineTasks.length,
      going,
      href: tripPath(trip),
      packingHref: tripPath(trip, "packing"),
      tasksHref: tripPath(trip, "tasks"),
      plan: todaysPlan(
        (planRows || []).filter((row) => row.trip_id === trip.id),
        today,
      ).map((item) => ({
        id: item.id,
        when: item.start_time ? formatTime(item.start_time) : "",
        title: item.title,
        where: item.location || null,
      })),
      // Only the few a folded card can carry, and the soonest first.
      tasks: mineTasks.slice(0, 3).map((task) => ({
        id: task.id,
        title: task.title,
        due: task.due_date ? `due ${formatDay(task.due_date)}` : null,
      })),
    };
  };

  const currentCards = current.map((trip) => buildCard(trip));
  const soonCards = soon.map((one) => buildCard(one.trip, one.days));

  // The two long-range states share the saved places and the open deadlines;
  // the loader reads them only at those ranges.

  // Deadlines worked out against today rather than trusting the stored status:
  // a row is only written to expired when a pass runs, and this screen can be
  // read in between.
  const liveDeals = (dealRows || []).filter(
    (deal) => deal.book_by && !fareHasExpired(deal, today),
  );
  const liveOffers = (offerRows || []).filter(
    (offer) => offer.offer_ends_on && !offerEnded(offer, today),
  );

  // The dates band: every dated thing in view, across every trip, plus the fares
  // and card bonuses that run out. One band, because when something is running
  // out a family thinks in the order the dates land, not in trips.
  const aheadCard = ahead ? buildCard(ahead.trip, ahead.days) : null;
  if (aheadCard) {
    if (!secondary) aheadCard.budgetHref = tripPath(ahead.trip, "budget");
    aheadCard.needs = (heroTasks || [])
      .filter((row) => row.trip_id === ahead.trip.id && row.due_date)
      .slice(0, 3)
      .map((row) => ({ id: row.id, on: row.due_date, title: row.title }));
  }
  const aheadRows = ahead
    ? aheadDates(
        [
          ...tasks
            .filter((task) => task.due_date)
            .map((task) => ({
              id: `task-${task.id}`,
              on: task.due_date,
              title: task.title,
              why: task.detail || null,
              scope: task.trip?.name || null,
              href: task.trip ? tripPath(task.trip, "tasks") : null,
            })),
          ...liveDeals.map((deal) => ({
            id: `fare-${deal.id}`,
            on: deal.book_by,
            title: `${deal.destination} · ${farePriceLabel(deal)}`,
            why: deal.book_by_inferred
              ? `${deal.source_name || "The sender"} expects this fare to go around then.`
              : "Last day to book at that price.",
            scope: "Fares",
            href: "/someday",
          })),
          ...liveOffers.map((offer) => ({
            id: `offer-${offer.id}`,
            on: offer.offer_ends_on,
            title: `${offer.card_name} bonus ends`,
            why: offer.bonus_text || offer.issuer || null,
            scope: "Wallet",
            href: "/wallet",
          })),
        ],
        today,
      )
    : [];

  // The saved places whose season comes round next. One of them at this range,
  // chosen rather than listed; all of them on the empty screen, where there is
  // nothing else to decide.
  const seasons = longRange ? seasonAhead(placeRows || [], today) : [];
  // The reason is always the season, because that is why this place and not one
  // of the others is on the screen. It used to be the family's own note when a
  // place had one, which explained why they want to go and left why the app
  // brought it up today unsaid.
  const pick = seasons[0]
    ? {
        title: seasons[0].place.place,
        why: seasonReason(seasons[0], seasons.length),
        note: seasons[0].place.why || null,
        planHref: `/trips/new?from=${seasons[0].place.id}`,
      }
    : null;

  // The empty-handed screen. No trip on the calendar at all, so it asks for a
  // week rather than a destination, then shows what is already being watched and
  // what the family has done before.
  const emptySeason = seasons.length
    ? {
        heading: "In season before spring",
        rows: seasons.slice(0, 4).map((one) => ({
          id: one.place.id,
          months: monthsSaid(one.months),
          place: one.place.place,
          why: one.place.why || null,
        })),
        planHref: `/trips/new?from=${seasons[0].place.id}`,
        more: Math.max(0, seasons.length - 4),
        total: seasons.length,
      }
    : null;
  const watching = emptyHanded
    ? {
        chips: [
          { count: liveDeals.length, label: liveDeals.length === 1 ? "fare" : "fares" },
          {
            count: liveOffers.length,
            label: liveOffers.length === 1 ? "card bonus" : "card bonuses",
          },
          { count: waiting || 0, label: "emails to file" },
        ],
        sentence:
          "Forward a fare alert or a booking to your inbox address and Aly reads it against the places you have saved.",
      }
    : null;
  // A draft is deliberately kept off the calendar, so it never leads the screen
  // -- but on the screen with nothing else on it, an unfinished trip is the most
  // useful thing the app is holding.
  const drafts = emptyHanded ? draftsWaiting(visible) : null;
  const pastTrips = emptyHanded
    ? visible
        .filter((trip) => isPastTrip(trip, today))
        .sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))
        .slice(0, 2)
        .map((trip) => ({
          id: trip.id,
          name: trip.name,
          when: trip.start_date ? formatDay(trip.start_date) : "",
          note: trip.destination || null,
          href: tripPath(trip),
        }))
    : [];

  // What the morning email would send right now, worked out with the rules the
  // run itself uses, so the band above cannot disagree with the mail.
  const batches = remindersDueToday({
    tasks,
    travelers: travelers || [],
    today,
  });
  const dueCount = batches.length;

  // The same items, one entry each rather than one per person who would be
  // emailed about them: this is a band on a screen the whole household shares,
  // not somebody's own morning mail.
  const seen = new Set();
  const pressing = [];
  for (const batch of batches) {
    for (const item of batch.items) {
      if (item.soon) continue;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      pressing.push({
        id: item.id,
        title: item.title,
        tripName: item.tripName,
        // The note is the stage a dateless task was placed by -- "Week before",
        // "Day before" -- which is worth saying, because it explains why the
        // task landed on today. "Book now" is not: it is the stage that always
        // means today, so under a band headed "Needs attention today" it repeats
        // the heading, and on a task that is not a booking it instructs somebody
        // to do the wrong thing.
        note: item.now ? null : item.note || null,
        href: item.tripRef ? `/trips/${item.tripRef}?tab=tasks` : null,
      });
    }
  }

  // The sentence under the greeting, written from what the screen is already
  // showing rather than from a query of its own: where today is, what is next,
  // and how much is waiting.
  const sentence = (() => {
    const parts = [];
    const lead = currentCards[0];
    const next = soonCards[0];
    if (lead) {
      parts.push(
        lead.dayNumber
          ? `Day ${lead.dayNumber}${lead.dayCount ? ` of ${lead.dayCount}` : ""} of ${lead.name}`
          : `On ${lead.name}`,
      );
      if (next) {
        parts.push(`${next.name} ${departureSaid(next.days).toLowerCase()}`);
      }
    } else if (next) {
      parts.push(`${next.name} ${departureSaid(next.days).toLowerCase()}`);
      if (next.packing === 0) parts.push("no packing list yet");
      else if (next.packed < next.packing) {
        parts.push(`${next.packed} of ${next.packing} packed`);
      }
    }
    if (pressing.length) {
      parts.push(
        pressing.length === 1
          ? "one thing needs you today"
          : `${pressing.length} things need you today`,
      );
    }
    if (!parts.length) return null;
    // "A, B and C" -- the last comma replaced, because three clauses in a row
    // separated by commas reads like a list of nouns.
    const said =
      parts.length > 1
        ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
        : parts[0];
    return `${said.charAt(0).toUpperCase()}${said.slice(1)}.`;
  })();

  // Contradictions, for the trips still ahead of us. The itinerary, the animals
  // and the links saying which animals go on which trip were read with the rest
  // of the second round; the rule runs here, trip by trip.
  const clashes = [];
  {
    for (const trip of upcoming) {
      const found = tripContradictions({
        trip,
        itinerary: itinerary.filter((i) => i.trip_id === trip.id),
        pets,
        petLinks: petLinks.filter((l) => l.trip_id === trip.id),
        today,
      });
      const ref = tripRef(trip);
      for (const one of found) {
        // Only the things that cannot be true at once. Drift and cautions have
        // their own place on the trip, and a band that carried every shade of
        // warning would stop meaning anything.
        if (one.severity && one.severity !== "contradiction") continue;
        clashes.push({
          ...one,
          id: `${trip.id}-${one.id}`,
          headline: `${trip.name}: ${one.headline}`,
          href: ref ? `/trips/${ref}` : null,
        });
      }
    }
  }

  return (
    <>
      <TopBar />
      <main className="screen px-5 pb-16 pt-7">
        <NowGreeting
          greeting={greetingFor(homeHour())}
          name={access?.travelerName || null}
          today={today}
          sentence={sentence}
        />
        {/* What is due or contradictory today goes above the trip, unless a trip
            is being lived: on that one day the plan for the day is the more
            urgent thing, and the two bands follow it. */}
        {!currentCards.length && (
          <NowBands part="today" pressing={pressing} clashes={clashes} />
        )}
        <NowTrips current={currentCards} soon={soonCards} />
        {ahead && (
          <NowAhead card={aheadCard} dates={aheadRows} pick={pick} />
        )}
        {emptyHanded && (
          <NowEmpty
            secondary={secondary}
            drafts={drafts}
            season={emptySeason}
            watching={watching}
            log={pastTrips}
          />
        )}
        {/* Only the trip being lived, and only one of them: the prompt asks to
            use where the phone is, and a question about two places at once has
            no answer. */}
        {currentCards[0] && (
          <LocationProTips
            key={`${currentCards[0].id}:${user.id}`}
            trip={currentCards[0].trip}
          />
        )}
        {currentCards.length > 0 && (
          <NowBands part="today" pressing={pressing} clashes={clashes} />
        )}
        <NowBands
          part="queue"
          secondary={secondary}
          pressing={pressing}
          clashes={clashes}
          waiting={waiting || 0}
          fares={fareRows.length}
        />
        {/* Said once, where the household's queue and mailer would have been, so
            that what is missing reads as somebody else's job rather than a screen
            that failed to load. */}
        {secondary && (
          <p className="mt-4 max-w-prose text-sm text-ink-soft">
            Bookings, fares and the household&rsquo;s reminders are looked after by
            whoever is planning these trips. Ask Aly if you need something that
            isn&rsquo;t here.
          </p>
        )}
        {/* The loud version above the band; the calm one-line version inside
            it. See the note on MorningRun. */}
        {!secondary && (
          <MorningRun
            runs={runs || []}
            today={today}
            dueCount={dueCount}
            only="loud"
          />
        )}
        <PushAlerts
          morning={
            secondary ? null : (
              <MorningRun
                runs={runs || []}
                today={today}
                dueCount={dueCount}
                only="calm"
              />
            )
          }
        />
        <Reminders
          readOnly={Boolean(access?.can.isSecondary)}
          tasks={tasks}
          today={today}
          userId={user.id}
          assigneesByTrip={assigneesByTrip}
        />
      </main>
      <AskAlyGeneral />
    </>
  );
}
