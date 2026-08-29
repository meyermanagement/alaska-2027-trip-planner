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

  const [{ data: profile }, { data: rows }, { data: travelers }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("predeparture_tasks")
        .select(
          "id, title, detail, assignee, due_date, timing, priority, is_done, trip_id, trips(id, name, slug, start_date, end_date, status, family_id)",
        )
        .eq("is_done", false)
        .order("sort_order", { ascending: true }),
      supabase
        .from("travelers")
        .select("id, name, is_person, family_id, sort_order")
        .in("family_id", familyIds)
        .order("sort_order", { ascending: true }),
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

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-7">
        <div className="mb-5">
          <h1 className="font-display text-3xl font-semibold">Reminders</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every open task across every upcoming trip, the urgent ones first.
          </p>
        </div>
        {/* <CalendarLink /> */}
        <Reminders
          readOnly={Boolean(access?.can.isSecondary)}
          tasks={tasks}
          today={todayISO()}
          userId={user.id}
          assigneesByTrip={assigneesByTrip}
        />
      </main>
      <AskAlyGeneral />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
