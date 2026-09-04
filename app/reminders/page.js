import { redirect } from "next/navigation";
// Parked, not gone. The calendar subscription block is hidden for now — Mark
// wants to come back to it, so the component and its route stay in the repo.
// import CalendarLink from "@/components/CalendarLink";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import Reminders from "@/components/Reminders";
import { isPastTrip } from "@/lib/format";
import { todayISO } from "@/lib/reminders";
import { assigneeOptions } from "@/lib/tasks/assignees";
import MorningRun from "@/components/MorningRun";
import { remindersDueToday } from "@/lib/tasks/dueToday";

export const metadata = { title: "Reminders · Alyeska" };

export default async function RemindersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  if (!memberships || memberships.length === 0) redirect("/join");

  // The name and the tasks are asked for together, not one after the other.
  // Only what is still open, and only for trips that have not happened yet:
  // a reminder about a trip you already took is not a reminder.
  const access = await resolveAccess(supabase, user);
  const familyIds = memberships.map((m) => m.family_id);

  const [
    { data: profile },
    { data: rows },
    { data: travelers },
    { data: runs },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
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
    // What happened to the morning email, most recent first. Six is enough to
    // find the last scheduled run and the last test behind a run of tests.
    supabase
      .from("reminder_runs")
      .select("ran_for, ran_at, source, considered, sent, failed, error")
      .order("ran_at", { ascending: false })
      .limit(6),
  ]);

  const tasks = (rows || [])
    .filter((row) => row.trips && !isPastTrip(row.trips))
    .map(({ trips, ...task }) => ({ ...task, trip: trips }));

  // Reassigning from this page means offering the right names for each row, and
  // the right names are whoever is actually going on that trip. One roster query
  // for the trips still on the list, rather than one per row.
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

  // How many people the morning run would email right now, worked out with the
  // same rules the run itself uses. Only there to catch the one case worth
  // catching: a run that reported nothing to send while this screen is showing
  // work that is plainly overdue. One of the two is wrong and the reader should
  // not have to be the one who notices.
  const today = todayISO();
  const dueCount = remindersDueToday({
    tasks,
    travelers: travelers || [],
    today,
  }).length;

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-7">
        <div className="mb-5">
          <h1 className="font-display text-3xl font-semibold">Reminders</h1>
        </div>
        <MorningRun runs={runs || []} today={today} dueCount={dueCount} />
        {/* <CalendarLink /> */}
        <Reminders
          readOnly={Boolean(access?.can.isSecondary)}
          tasks={tasks}
          today={today}
          userId={user.id}
          assigneesByTrip={assigneesByTrip}
        />
      </main>
      <AskAlyGeneral />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
