import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sortItinerary } from "@/lib/day/order";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import DraftView from "@/components/DraftView";
import FooterBar from "@/components/FooterBar";
import TripView from "@/components/TripView";
import { todayISO } from "@/lib/reminders";
import { isDraftTrip } from "@/lib/format";
import { parseTripRef, tripRef, needsCanonical } from "@/lib/trips/route";

// Finding the trip this URL is talking about.
//
// The address is the trip's readable name followed by a key that never changes:
// /trips/alaska-2027-337jb9. Only the key is used to find it. That is what makes
// renaming a trip free — the readable half can go stale and the link still
// works — and it is what makes the lookup unambiguous once there is more than
// one household, because the slug alone is only unique within a family and would
// come back with two rows and show a Not Found page for a trip that is right
// there.
//
// Links without a key still have to work. Calendar subscriptions and reminder
// emails sent before this change carry the bare slug, and those sit in people's
// phones and inboxes for months. So a slug link falls back to a lookup inside
// the reader's own household, which is unique by constraint, and then the
// address bar is quietly corrected to the permanent form.
async function findTrip(supabase, ref, familyId) {
  const { key, readable } = parseTripRef(ref);

  if (key) {
    const { data } = await supabase
      .from("trips")
      .select("*")
      .eq("public_id", key)
      .maybeSingle();
    if (data) return data;
  }

  // A key that matches nothing is not necessarily a wrong link: a trip could be
  // named so that its slug ends in something key-shaped. Fall through and try
  // the whole thing as a slug before giving up.
  if (!readable && !key) return null;
  const asSlug = readable && key ? `${readable}-${key}` : readable || key;

  // Scoped to one household, so it can never be the two-row lookup this whole
  // change exists to remove. Without a household we would rather find nothing
  // than guess between two trips.
  if (!familyId) return null;
  const { data } = await supabase
    .from("trips")
    .select("*")
    .eq("slug", asSlug)
    .eq("family_id", familyId)
    .maybeSingle();
  return data || null;
}

export async function generateMetadata({ params }) {
  const { ref } = await params;
  const supabase = await createClient();
  const { key, raw } = parseTripRef(ref);
  // This runs outside the signed-in path, so it cannot resolve a household and
  // cannot use the scoped fallback. It takes the first row it is allowed to see
  // rather than maybeSingle, because a title is not worth an error — and if it
  // sees nothing, which is what row-level security gives a stranger, the tab
  // just says Trip.
  const { data } = await supabase
    .from("trips")
    .select("name")
    .eq(key ? "public_id" : "slug", key || raw)
    .limit(1);
  return { title: `${data?.[0]?.name || "Trip"} · Alyeska` };
}

export default async function TripPage({ params, searchParams }) {
  const { ref } = await params;
  const query = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const access = await resolveAccess(supabase, user);

  const trip = await findTrip(supabase, ref, access?.familyId);
  if (!trip) notFound();

  // An old link, or a link whose readable half no longer matches the trip's
  // name. The query string has to survive the correction, because the tab a
  // reminder email or a calendar entry points at lives in it.
  if (needsCanonical(trip, ref)) {
    const rest = new URLSearchParams(
      Object.entries(query || {}).flatMap(([k, v]) =>
        Array.isArray(v) ? v.map((one) => [k, one]) : v == null ? [] : [[k, v]],
      ),
    ).toString();
    redirect(`/trips/${tripRef(trip)}${rest ? `?${rest}` : ""}`);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const [
    itinerary,
    packing,
    tasks,
    notes,
    travelers,
    roster,
    tips,
    facts,
    templates,
    templateItems,
    tripTemplates,
    pets,
    petLinks,
  ] = await Promise.all([
    supabase
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", trip.id)
      // Ordered again below, by the clock. The database order is only a head
      // start: sort_order ties resolve to whichever row was written first, which
      // is how a 3pm check-in ended up above a 10am drive.
      .order("item_date", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("packing_items")
      .select("*")
      .eq("trip_id", trip.id)
      .is("stashed_at", null)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("predeparture_tasks")
      .select("*")
      .eq("trip_id", trip.id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_notes")
      .select("*")
      .eq("trip_id", trip.id)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("travelers")
      .select("id, name, color, is_person, sort_order")
      .eq("family_id", trip.family_id)
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_travelers")
      .select("traveler_id")
      .eq("trip_id", trip.id),
    // Pro tips for this trip, and whether the place has ever been researched.
    // The second one is what lets the screen say "nothing yet" rather than
    // "nothing", which are different claims.
    supabase
      .from("pro_tips")
      .select("*")
      .eq("trip_id", trip.id)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    supabase
      .from("trip_facts")
      .select("checked_at")
      .eq("trip_id", trip.id)
      .maybeSingle(),
    // The packing templates, so an item invented while packing for this trip
    // can be sent to the list every future trip starts from without leaving
    // the suitcase.
    supabase
      .from("packing_templates")
      // pet_id, so the packing screen can leave an animal's own list out of the
      // add-ons a trip is built from: whether the dog is coming is a roster
      // question, not a question about what kind of trip this is.
      .select("id, name, is_base, pet_id")
      .eq("family_id", trip.family_id)
      .order("is_base", { ascending: false })
      .order("name", { ascending: true }),
    // And what those templates already hold, so a packing row can say which one
    // it is kept on. Names and people only — enough to recognize the same item
    // without reading every field of every template. Row-level security limits
    // these to the family's own templates.
    supabase
      .from("packing_template_items")
      .select("template_id, item, assignee"),
    // Which add-on lists this trip says it is built from. A trip can be several
    // things at once -- an Alaska cruise is an Alaska trip and a cruise -- and
    // the packing screen is where that gets corrected.
    supabase
      .from("trip_templates")
      .select("template_id")
      .eq("trip_id", trip.id),
    // The family's animals, and which of them are on this trip. Whether the dog
    // is coming is a fact about the trip, so it is decided here rather than
    // inside the dog's card on the Family tab.
    supabase
      .from("pets")
      .select("id, name, species, color, weight_lb, travel_style, family_id")
      .eq("family_id", trip.family_id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("trip_pets")
      .select("pet_id, arrangement")
      .eq("trip_id", trip.id),
  ]);

  // A draft gets its own screen. The trip screen below is built to answer "what
  // is happening on this trip", and a draft's honest answer to most of that is
  // "nothing yet" -- which read as a trip that had gone wrong rather than an idea
  // that was going fine. What a draft needs on the page is the opposite: the six
  // things it is still missing.
  // The itinerary in reading order: untimed things that frame the day, then
  // everything by the clock. Done here rather than in the query because two rows
  // sharing a sort_order come back in whichever order they were written, and the
  // draft view and the trip view must not disagree about which is first.
  const orderedItinerary = sortItinerary(itinerary.data || []);

  if (isDraftTrip(trip)) {
    return (
      <>
        <TopBar />
        <DraftView
          trip={trip}
          itinerary={orderedItinerary}
          tasks={tasks.data || []}
          packing={packing.data || []}
          travelers={(travelers.data || []).filter((t) => t.is_person)}
          going={(roster.data || []).map((r) => r.traveler_id)}
          today={todayISO()}
        />
        <FooterBar displayName={profile?.display_name} />
      </>
    );
  }

  return (
    <>
      <TopBar />
      <TripView
        level={access?.level}
        trip={trip}
        initialItinerary={orderedItinerary}
        initialPacking={packing.data || []}
        initialTasks={tasks.data || []}
        initialNotes={notes.data || []}
        travelers={(travelers.data || []).map((t) => t.name)}
        people={(travelers.data || []).filter((t) => t.is_person)}
        initialGoing={(roster.data || []).map((r) => r.traveler_id)}
        pets={pets.data || []}
        initialPetLinks={petLinks.data || []}
        tips={tips.data || []}
        everLooked={Boolean(facts.data?.checked_at)}
        packingTemplates={templates.data || []}
        packingTemplateItems={templateItems.data || []}
        tripTemplateIds={(tripTemplates.data || []).map((r) => r.template_id)}
        templatesChosen={Boolean(trip.templates_chosen_at)}
        today={todayISO()}
        userId={user.id}
        userName={profile?.display_name || "Family member"}
      />
      <FooterBar displayName={profile?.display_name} />
    </>
  );
}
