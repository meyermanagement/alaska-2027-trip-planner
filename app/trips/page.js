import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import {
  homeToday,
  isCurrentTrip,
  isDraftTrip,
  isPastTrip,
} from "@/lib/format";
import NewTripButton from "./NewTripButton";
import TripBoard from "./TripBoard";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import { ABOUT_SKIP_COOKIE } from "@/lib/travelers/profile";

export const metadata = { title: "Trips · Alyeska" };

export default async function TripsPage() {
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

  const access = await resolveAccess(supabase, user);
  const familyId = memberships[0].family_id;

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
        "id, name, slug, public_id, destination, start_date, end_date, cover_emoji, summary, status",
      )
      // Scoped to the household this screen is showing. Row-level security
      // already keeps other people's trips out; this keeps the reader's *other*
      // household out, which matters as soon as anybody belongs to two.
      .eq("family_id", family.id)
      .order("start_date", { ascending: true }),
    supabase
      .from("packing_items")
      .select("trip_id, is_packed")
      .is("stashed_at", null),
    supabase.from("predeparture_tasks").select("trip_id, is_done"),
    supabase.from("itinerary_items").select("trip_id"),
    supabase
      .from("travelers")
      .select("id, name, sort_order, is_person, user_id, about_me")
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

  // One date, used for all four buckets, so a trip cannot be sorted into two of
  // them because the clock ticked over a midnight between two calls.
  const today = homeToday();
  const all = (trips || []).map(card);
  const drafts = all.filter(isDraftTrip);
  // A trip they are on now is lifted out of Upcoming entirely. It is not upcoming
  // — that is the point — and leaving it in the list meant the trip you were
  // standing in the middle of looked exactly like the two you have not taken yet,
  // with a countdown reading zero days away.
  const current = all.filter((t) => isCurrentTrip(t, today));
  const upcoming = all.filter(
    (t) => !isDraftTrip(t) && !isPastTrip(t, today) && !isCurrentTrip(t, today),
  );
  // Most recently finished first, so the last trip is the one you see.
  const past = all
    .filter((t) => isPastTrip(t, today))
    .sort((a, b) => (b.end_date || "").localeCompare(a.end_date || ""));

  // The About You question used to be a card at the top of this page. It is a
  // screen of its own now: an account with nothing in it needs that paragraph
  // more than it needs anything else here, and a box six lines tall wedged
  // between a heading and a list of trips does not get a paragraph written in it.
  //
  // Matched on the account rather than on the name, because a name is not an
  // identity and two Marks would both be handed the same row. No row at all means
  // an unclaimed seat, and nowhere to save the answer, so the question is not
  // asked.
  const me = (people || []).find((p) => p.user_id === user.id) || null;
  const skipped = (await cookies()).get(ABOUT_SKIP_COOKIE);
  if (me && !String(me.about_me || "").trim() && !skipped) {
    redirect("/about-you?first=1");
  }

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
          {!access?.can.isSecondary && <NewTripButton familyId={familyId} />}
        </div>

        <TripBoard
          current={current}
          upcoming={upcoming}
          drafts={drafts}
          past={past}
          today={today}
        />
      </main>
      <AskAlyGeneral />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
