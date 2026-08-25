import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import Reminders from "@/components/Reminders";
import { isPastTrip } from "@/lib/format";
import { todayISO } from "@/lib/reminders";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  // Only what is still open, and only for trips that have not happened yet:
  // a reminder about a trip you already took is not a reminder.
  const { data: rows } = await supabase
    .from("predeparture_tasks")
    .select(
      "id, title, detail, assignee, due_date, timing, priority, is_done, trip_id, trips(id, name, slug, start_date, end_date, status)",
    )
    .eq("is_done", false)
    .order("sort_order", { ascending: true });

  const tasks = (rows || [])
    .filter((row) => row.trips && !isPastTrip(row.trips))
    .map(({ trips, ...task }) => ({ ...task, trip: trips }));

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
        <Reminders tasks={tasks} today={todayISO()} userId={user.id} />
      </main>
      <AskAlyGeneral />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
