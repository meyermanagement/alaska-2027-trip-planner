import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import NowGreeting from "./NowGreeting";
import NowTrips from "./NowTrips";
import LocationProTips from "@/components/LocationProTips";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import Reminders from "@/components/Reminders";
import MorningRun from "@/components/MorningRun";
import PushAlerts from "@/components/PushAlerts";
import NowBands from "./NowBands";
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
  homeTrips,
  progressOf,
  todaysPlan,
} from "@/lib/now/home";
import { BASIC_SELECT } from "@/lib/trips/basics";
import { canSeeTrip, visibleTripIds } from "@/lib/trips/visibility";
import { todayISO } from "@/lib/reminders";
import { assigneeOptions } from "@/lib/tasks/assignees";
import { remindersDueToday } from "@/lib/tasks/dueToday";
import { tripContradictions } from "@/lib/trips/contradictions";
import { tripPath, tripRef } from "@/lib/trips/route";
import { unreadFares } from "@/lib/deals/unread";

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
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  if (!memberships || memberships.length === 0) redirect("/join");

  const access = await resolveAccess(supabase, user);
  const familyIds = memberships.map((m) => m.family_id);
  const today = todayISO();
  const fareRows = access?.familyId && !access.can.isSecondary
    ? await unreadFares(supabase, user.id, access.familyId) : [];

  const [
    { data: rows },
    { data: travelers },
    { data: runs },
    { count: waiting },
  ] = await Promise.all([
    supabase
      .from("predeparture_tasks")
      .select(
        "id, title, detail, assignee, due_date, timing, priority, is_done, trip_id, trips(id, name, slug, public_id, start_date, end_date, status, family_id)",
      )
      .eq("is_done", false)
      .order("sort_order", { ascending: true }),
    supabase
      .from("travelers")
      .select(
        "id, name, is_person, family_id, sort_order, email, wants_reminders",
      )
      .in("family_id", familyIds)
      .order("sort_order", { ascending: true }),
    supabase
      .from("reminder_runs")
      .select("ran_for, ran_at, source, considered, sent, failed, error")
      .order("ran_at", { ascending: false })
      .limit(6),
    // Only the number. The list of what arrived lives on the Inbox screen; a
    // band that reprinted it here would be a second inbox to keep in step.
    supabase
      .from("inbox_messages")
      .select("id", { count: "exact", head: true })
      .in("family_id", familyIds)
      .eq("status", "pending"),
  ]);

  const tasks = (rows || [])
    .filter((row) => row.trips && !isPastTrip(row.trips))
    .map(({ trips, ...task }) => ({ ...task, trip: trips }));

  const trips = [
    ...new Map(tasks.map((task) => [task.trip.id, task.trip])).values(),
  ];
  const { data: roster } = trips.length
    ? await supabase
        .from("trip_travelers")
        .select("trip_id, traveler_id")
        .in(
          "trip_id",
          trips.map((trip) => trip.id),
        )
    : { data: [] };

  const assigneesByTrip = assigneeOptions({
    trips,
    travelers: travelers || [],
    roster: roster || [],
  });

  // The trips this screen leads with. Read from the trips table rather than from
  // the trips that happen to have an outstanding task hanging off them: a trip
  // whose list is finished is still the trip you are on.
  const [{ data: tripRows }, allowedTripIds] = await Promise.all([
    access?.familyId
      ? supabase
          .from("trips")
          .select(
            `id, name, slug, public_id, cover_emoji, status, cover_image_url, cover_image_alt, cover_image_status, lat, lon, family_id, ${BASIC_SELECT}`,
          )
          .eq("family_id", access.familyId)
          .order("start_date", { ascending: true })
      : Promise.resolve({ data: [] }),
    visibleTripIds(supabase, access),
  ]);

  const visible = (tripRows || []).filter((trip) =>
    canSeeTrip(trip, access, allowedTripIds),
  );
  const { current, soon } = homeTrips(visible, today);
  const heroTrips = [...current, ...soon.map((one) => one.trip)];
  const heroIds = heroTrips.map((trip) => trip.id);

  const [
    { data: packingRows },
    { data: heroTasks },
    { data: planRows },
    { data: heroRoster },
  ] = heroIds.length
    ? await Promise.all([
        supabase
          .from("packing_items")
          .select("trip_id, is_packed")
          .in("trip_id", heroIds)
          .is("stashed_at", null),
        supabase
          .from("predeparture_tasks")
          .select("id, trip_id, title, due_date, is_done")
          .in("trip_id", heroIds)
          .eq("is_done", false)
          // Dated first and soonest of those, because a folded card can only
          // carry three and the three worth carrying are the ones with a
          // deadline on them.
          .order("due_date", { ascending: true, nullsFirst: false })
          .order("sort_order", { ascending: true }),
        current.length
          ? supabase
              .from("itinerary_items")
              .select(
                "id, trip_id, item_date, end_date, start_time, sort_order, title, location, status",
              )
              .in(
                "trip_id",
                current.map((trip) => trip.id),
              )
          : Promise.resolve({ data: [] }),
        supabase
          .from("trip_travelers")
          .select("trip_id, traveler_id")
          .in("trip_id", heroIds),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

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
        note: item.note || null,
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

  // Contradictions, for the trips still ahead of us. Three queries for every
  // trip at once rather than three per trip, and the animals are fetched once:
  // the rule wants the pets on a trip, and the link rows are what say which
  // those are.
  const upcoming = [];
  for (const trip of trips) {
    if (!isPastTrip(trip, today)) upcoming.push(trip);
  }
  let clashes = [];
  if (upcoming.length) {
    const ids = upcoming.map((trip) => trip.id);
    const [{ data: itinerary }, { data: pets }, { data: petLinks }] =
      await Promise.all([
        supabase
          .from("itinerary_items")
          .select("*")
          .in("trip_id", ids)
          .order("item_date", { ascending: true })
          .order("sort_order", { ascending: true }),
        supabase
          .from("pets")
          .select(
            "id, name, species, color, weight_lb, travel_style, family_id, is_service_animal, rabies_expiration, health_certificate_expiration",
          )
          .in("family_id", familyIds),
        supabase
          .from("trip_pets")
          .select("trip_id, pet_id, arrangement")
          .in("trip_id", ids),
      ]);

    for (const trip of upcoming) {
      const found = tripContradictions({
        trip,
        itinerary: (itinerary || []).filter((i) => i.trip_id === trip.id),
        pets: pets || [],
        petLinks: (petLinks || []).filter((l) => l.trip_id === trip.id),
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
          count={pressing.length + clashes.length}
        />
        <NowTrips current={currentCards} soon={soonCards} />
        {/* Only the trip being lived, and only one of them: the prompt asks to
            use where the phone is, and a question about two places at once has
            no answer. */}
        {currentCards[0] && (
          <LocationProTips
            key={`${currentCards[0].id}:${user.id}`}
            trip={currentCards[0].trip}
          />
        )}
        <NowBands
          pressing={pressing}
          clashes={clashes}
          waiting={waiting || 0}
          fares={fareRows.length}
        />
        <MorningRun runs={runs || []} today={today} dueCount={dueCount} />
        <PushAlerts />
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
