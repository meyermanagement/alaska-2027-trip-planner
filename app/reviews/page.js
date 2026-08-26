import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TopBar from "@/components/TopBar";
import FooterBar from "@/components/FooterBar";
import AskAlyGeneral from "@/components/AskAlyGeneral";
import PlaceList from "./PlaceList";
import Preferences from "./Preferences";
import { isPastTrip } from "@/lib/format";

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
    blurb: "Restaurants and bars from past trips.",
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
  const familyId = memberships[0].family_id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

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

  const { data: trips } = await supabase
    .from("trips")
    .select(
      "id, name, slug, destination, start_date, end_date, cover_emoji, status",
    );

  const pastTrips = (trips || [])
    .filter((t) => isPastTrip(t))
    .sort((a, b) => (b.end_date || "").localeCompare(a.end_date || ""));
  const tripById = new Map(pastTrips.map((t) => [t.id, t]));

  const { data: items } = pastTrips.length
    ? await supabase
        .from("itinerary_items")
        .select(
          "id, trip_id, item_date, end_date, title, category, location, notes, rating, review",
        )
        .in(
          "trip_id",
          pastTrips.map((t) => t.id),
        )
        .in("category", ["lodging", "excursion", "activity", "dining"])
    : { data: [] };

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

  const seen = new Set();
  const unique = sorted.filter((i) => {
    const key = placeKey(i);
    if (seen.has(key)) return false;
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
        <div className="mb-6">
          <h1 className="font-display text-3xl font-semibold">
            Preferences &amp; Reviews
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            How we like to travel in general, and what we thought of everywhere
            we have stayed and everything we have done on past trips. Rate a
            place and leave a line about it, and it will be here the next time
            we are deciding.
          </p>
        </div>

        <div className="mb-6">
          <Preferences
            familyId={familyId}
            travelers={people || []}
            preferences={preferences || []}
          />
        </div>

        <h2 className="font-display mb-3 text-xl font-semibold">
          Places we have been
        </h2>

        {pastTrips.length === 0 ? (
          <p className="card p-5 text-sm text-ink-soft">
            Nothing here yet. Once a trip&apos;s last day has passed, its
            hotels, excursions and restaurants show up on this page.
          </p>
        ) : total === 0 ? (
          <p className="card p-5 text-sm text-ink-soft">
            No stays, excursions or restaurants were saved on our past trips
            yet.
          </p>
        ) : (
          <PlaceList groups={groups} trips={pastTrips} />
        )}
      </main>
      <AskAlyGeneral />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
