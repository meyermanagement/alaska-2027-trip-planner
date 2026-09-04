import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import PlaceList from "./PlaceList";
import Preferences from "./Preferences";
import { isCurrentTrip, isDraftTrip, isPastTrip } from "@/lib/format";
import { REVIEWABLE_CATEGORIES } from "@/lib/reviews/when";

export const metadata = { title: "Preferences & Reviews · Alyeska" };

// The groups we keep a record of, in the order they show up on the page.
const GROUPS = [
  {
    key: "stays",
    label: "Where we stayed",
    categories: ["lodging"],
    blurb: "Hotels, resorts and rentals, most recent first.",
  },
  {
    key: "doing",
    label: "What we did",
    categories: ["excursion", "activity"],
    blurb: "Tours, excursions and the things worth doing again.",
  },
  {
    key: "eating",
    label: "Where we ate",
    categories: ["dining"],
    blurb: "Restaurants and bars we have eaten at, most recent first.",
  },
];

export default async function HistoryPage() {
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

  // A secondary traveler has no read access to what this screen is made of, so
  // the page would render as a set of empty panels. Sending them somewhere real
  // is kinder than showing them a room they cannot enter.
  const access = await resolveAccess(supabase, user);
  if (access?.can.isSecondary) redirect("/trips");
  const familyId = memberships[0].family_id;

  const [{ data: preferences }, { data: people }] = await Promise.all([
    supabase
      .from("travel_preferences")
      .select("*")
      .order("topic", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("travelers")
      .select("id, name, sort_order")
      .eq("is_person", true)
      .order("sort_order", { ascending: true }),
  ]);

  const [{ data: trips }, { data: rosters }] = await Promise.all([
    supabase
      .from("trips")
      .select(
        "id, name, slug, public_id, destination, start_date, end_date, cover_emoji, status",
      )
      // Scoped to the household this screen is showing. Row-level security
      // already keeps other people's trips out; this keeps the reader's *other*
      // household out, which matters as soon as anybody belongs to two.
      .eq("family_id", familyId),
    supabase.from("trip_travelers").select("trip_id, traveler_id"),
  ]);

  // The trips worth filtering preferences by are the ones still to come, soonest
  // first: the question this answers is "what will Aly plan Alaska with", and a
  // trip already taken cannot be planned.
  const prefTrips = (trips || [])
    .filter((t) => !isPastTrip(t) && !isDraftTrip(t))
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));

  const pastTrips = (trips || [])
    .filter((t) => isPastTrip(t))
    .sort((a, b) => (b.end_date || "").localeCompare(a.end_date || ""));

  // A trip in progress belongs here too, but only for what has already been
  // rated on it. Reviews can now be written from the itinerary the evening
  // something happens, and a note that saved successfully and then could not be
  // found on the page built to hold reviews would be the worst kind of bug --
  // the app quietly losing something somebody wrote. Unrated items from a trip
  // still running stay off, because a record of where we have been should not
  // read as a list of chores.
  const liveTrips = (trips || [])
    .filter((t) => isCurrentTrip(t))
    .sort((a, b) => (b.end_date || "").localeCompare(a.end_date || ""));

  const shownTrips = [...pastTrips, ...liveTrips];
  const tripById = new Map(shownTrips.map((t) => [t.id, t]));

  const { data: rows } = shownTrips.length
    ? await supabase
        .from("itinerary_items")
        .select(
          "id, trip_id, item_date, end_date, title, category, location, notes, rating, review",
        )
        .in(
          "trip_id",
          shownTrips.map((t) => t.id),
        )
        .in("category", REVIEWABLE_CATEGORIES)
    : { data: [] };

  const liveIds = new Set(liveTrips.map((t) => t.id));
  const items = (rows || []).filter(
    (i) => !liveIds.has(i.trip_id) || i.rating || String(i.review || "").trim(),
  );

  // Newest first within each group, so the last trip reads first.
  const sorted = (items || []).slice().sort((a, b) => {
    const cmp = (b.item_date || "").localeCompare(a.item_date || "");
    return cmp !== 0 ? cmp : (a.title || "").localeCompare(b.title || "");
  });

  // A trip often has the same hotel or restaurant on two different days. Show
  // it once, on its most recent date, so the record reads like a list of
  // places rather than a list of calendar entries.
  const placeKey = (i) =>
    `${i.trip_id}|${(i.title || "").trim().toLowerCase()}`;

  // Every row the card stands for, not just the one being shown. Renaming a
  // five-night hotel has to rename all five nights, or the next render would
  // split it into two places.
  const rowsByPlace = new Map();
  for (const i of sorted) {
    const key = placeKey(i);
    if (!rowsByPlace.has(key)) rowsByPlace.set(key, []);
    rowsByPlace.get(key).push(i.id);
  }

  // Which of a place's rows stands for it. Newest wins, except that a row
  // carrying an opinion beats one that does not: the itinerary writes a review to
  // the latest night of a stay, and if this page picked a different night to show
  // the review would exist in the database and appear nowhere. reviewTarget on the
  // other side makes the same choice.
  const opinionated = (i) => Boolean(i.rating || String(i.review || "").trim());
  const byPlace = new Map();
  for (const i of sorted) {
    const key = placeKey(i);
    const held = byPlace.get(key);
    if (!held || (!opinionated(held) && opinionated(i))) byPlace.set(key, i);
  }

  const seen = new Set();
  const unique = sorted.filter((i) => {
    const key = placeKey(i);
    if (seen.has(key)) return false;
    if (byPlace.get(key) !== i) return false;
    seen.add(key);
    return true;
  });

  const groups = GROUPS.map((g) => ({
    ...g,
    items: unique
      .filter((i) => g.categories.includes(i.category))
      .map((i) => ({
        ...i,
        trip: tripById.get(i.trip_id) || null,
        rowIds: rowsByPlace.get(placeKey(i)) || [i.id],
      })),
  })).filter((g) => g.items.length > 0);

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-7">
        <h1 className="mb-6 font-display text-3xl font-semibold">
          Preferences &amp; Reviews
        </h1>

        <div className="mb-6">
          <Preferences
            familyId={familyId}
            travelers={people || []}
            preferences={preferences || []}
            trips={prefTrips}
            rosters={rosters || []}
          />
        </div>

        <h2 className="font-display mb-3 text-xl font-semibold">
          Places we have been
        </h2>

        {shownTrips.length === 0 ? (
          <p className="card p-5 text-sm text-ink-soft">
            Nothing here yet. Rate a hotel, an excursion or a restaurant on a
            trip once it has happened and it will show up here, and everything
            from a finished trip arrives on this page by itself.
          </p>
        ) : total === 0 ? (
          <p className="card p-5 text-sm text-ink-soft">
            No stays, excursions or restaurants were saved on our finished trips
            yet.
          </p>
        ) : (
          <PlaceList groups={groups} trips={shownTrips} />
        )}
      </main>
      <AskAlyGeneral />
    </>
  );
}
