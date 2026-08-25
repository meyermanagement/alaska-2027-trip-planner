import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import { isDraftTrip, isPastTrip } from "@/lib/format";
import NewTripButton from "./NewTripButton";
import TripBoard from "./TripBoard";
import AskAlyGeneral from "@/components/AskAlyGeneral";

export const metadata = { title: "Trips · Alyeska" };

export default async function TripsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id, families(id, name, invite_code)")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/join");

  const family = memberships[0].families;

  // None of these depend on each other, so they go together rather than one
  // after another: seven round trips to the database stacked end to end is
  // most of the wait people notice when this screen opens.
  const [
    { data: profile },
    { data: trips },
    { data: counts },
    { data: taskRows },
    { data: itineraryRows },
    { data: people },
    { data: rosters },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("trips")
      .select(
        "id, name, slug, destination, start_date, end_date, cover_emoji, summary, status",
      )
      .order("start_date", { ascending: true }),
    supabase.from("packing_items").select("trip_id, is_packed"),
    supabase.from("predeparture_tasks").select("trip_id, is_done"),
    supabase.from("itinerary_items").select("trip_id"),
    supabase
      .from("travelers")
      .select("id, name, sort_order, is_person")
      .eq("is_person", true)
      .order("sort_order", { ascending: true }),
    supabase.from("trip_travelers").select("trip_id, traveler_id"),
  ]);

  function progress(rows, tripId, doneKey) {
    const mine = (rows || []).filter((r) => r.trip_id === tripId);
    return { done: mine.filter((r) => r[doneKey]).length, total: mine.length };
  }

  // Who is on each trip, in the family's usual order.
  function travelerNames(tripId) {
    const ids = (rosters || [])
      .filter((r) => r.trip_id === tripId)
      .map((r) => r.traveler_id);
    return (people || []).filter((p) => ids.includes(p.id)).map((p) => p.name);
  }

  // The cards are drawn on the client, so each one arrives with its numbers
  // already worked out rather than four more lists to filter over there.
  const card = (trip) => {
    const packing = progress(counts, trip.id, "is_packed");
    const tasks = progress(taskRows, trip.id, "is_done");
    return {
      ...trip,
      packing: packing.total,
      packed: packing.done,
      tasks: tasks.total,
      tasksDone: tasks.done,
      stops: (itineraryRows || []).filter((r) => r.trip_id === trip.id).length,
      going: travelerNames(trip.id),
    };
  };

  const all = (trips || []).map(card);
  const drafts = all.filter(isDraftTrip);
  const upcoming = all.filter((t) => !isDraftTrip(t) && !isPastTrip(t));
  // Most recently finished first, so the last trip is the one you see.
  const past = all
    .filter(isPastTrip)
    .sort((a, b) => (b.end_date || "").localeCompare(a.end_date || ""));

  return (
    <>
      {/* No askHref: the button opens the drawer here, in general context. */}
      <TopBar />
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-7">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            {/* The heading used to say "Our trips" over a single list. The
                three groups below are each named now, so the page keeps the
                plain name and "Upcoming trips" labels the list it belongs to. */}
            <h1 className="font-display text-3xl font-semibold">Trips</h1>
            <p className="mt-1 text-sm text-ink-soft">
              Everything here is shared live with everyone in the family group.
            </p>
          </div>
          <NewTripButton familyId={family.id} />
        </div>

        <TripBoard upcoming={upcoming} drafts={drafts} past={past} />
      </main>
      <AskAlyGeneral />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
