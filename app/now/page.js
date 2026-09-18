import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import PageHeader from "@/components/PageHeader";
import { SCREEN_INTROS } from "@/lib/screenCopy";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import Reminders from "@/components/Reminders";
import MorningRun from "@/components/MorningRun";
import PushAlerts from "@/components/PushAlerts";
import NowBands from "./NowBands";
import { isPastTrip } from "@/lib/format";
import { todayISO } from "@/lib/reminders";
import { assigneeOptions } from "@/lib/tasks/assignees";
import { remindersDueToday } from "@/lib/tasks/dueToday";
import { tripContradictions } from "@/lib/trips/contradictions";
import { tripRef } from "@/lib/trips/route";

export const metadata = { title: "Now · Alyeska" };

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
        <PageHeader
          title="Now"
          count={tasks.length}
          subtitle={SCREEN_INTROS.now}
        />
        <NowBands
          pressing={pressing}
          clashes={clashes}
          waiting={waiting || 0}
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
