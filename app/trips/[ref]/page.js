import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { sortItinerary } from "@/lib/day/order";
import { resolveAccess } from "@/lib/travelers/access";
import TopBar from "@/components/TopBar";
import DraftView from "@/components/DraftView";
import TripView from "@/components/TripView";
import { todayISO } from "@/lib/reminders";
import { isDraftTrip } from "@/lib/format";
import { parseTripRef, tripRef, needsCanonical } from "@/lib/trips/route";
import TripFares from "@/components/TripFares";
import { inboxAddressFor } from "@/lib/inbox/address";
import { judged, readDealWorld } from "@/lib/deals/world";
import {
  circumstanceSnapshot,
  changesBetween,
} from "@/lib/trips/circumstances";
import { tripContradictions } from "@/lib/trips/contradictions";

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

  const user = await whoIs(supabase);
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
    costs,
    travelers,
    roster,
    tips,
    facts,
    templates,
    templateItems,
    tripTemplates,
    pets,
    petLinks,
    basicHistory,
    dayPack,
    deals,
    household,
    limits,
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
    // The money that is not an event on any day. Everything else the Budget tab
    // adds up is already on the itinerary above.
    supabase
      .from("trip_costs")
      .select("*")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("travelers")
      .select(
        "id, name, color, is_person, sort_order, date_of_birth, mobility_aids, accessibility_notes",
      )
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
      .select("checked_at, looked_at")
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
      .select(
        "id, name, species, color, weight_lb, travel_style, family_id, is_service_animal, rabies_expiration, health_certificate_expiration",
      )
      .eq("family_id", trip.family_id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("trip_pets")
      .select("pet_id, arrangement")
      .eq("trip_id", trip.id),
    // Every change to one of the six things a trip is made of. A text column
    // remembers only its latest value, and the answer it replaced is often the
    // more interesting one: "one apartment in Lisbon, we do not want to move"
    // says something the two hotels that overtook it do not.
    supabase
      .from("trip_basic_history")
      .select("id, basic, previous_value, new_value, created_at")
      .eq("trip_id", trip.id)
      .order("created_at", { ascending: false })
      .limit(40),
    // What is carried on a given day, which is a different question from what is
    // in the case. Read in the same breath as everything else: the itinerary
    // draws a day's pack inside the day, so fetching it on the client would mean
    // the bag arriving after the morning it belongs to.
    supabase
      .from("day_pack_items")
      .select("*")
      .eq("trip_id", trip.id)
      .order("item_date", { ascending: true })
      .order("sort_order", { ascending: true }),
    // Fares forwarded in from the family's deal newsletters. Read here, and not
    // only on the bucket list, because a fare that matched this trip is acted on
    // where the dates and the budget it was judged against live.
    supabase
      .from("flight_deals")
      .select("*")
      .eq("family_id", trip.family_id)
      .order("created_at", { ascending: false }),
    // The household's forwarding address, so a trip with flights still to buy
    // can hand it over without a trip to /inbox first.
    supabase
      .from("families")
      .select("inbox_local_part, home_address")
      .eq("id", trip.family_id)
      .maybeSingle(),
    // What anybody on this trip cannot do, each row filed against one person or
    // against the whole household. Read here because a limit added after the trip
    // was planned is one of the things the trip has to notice.
    supabase
      .from("household_facts")
      .select("id, traveler_id, slot, body")
      .eq("family_id", trip.family_id)
      .eq("slot", "limits"),
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

  // Only a household who has forwarded a fare pays for the eight reads behind a
  // verdict, and the verdicts are worked out here on every load rather than
  // stored: a fare that was under this trip's budget in September is not under it
  // after the hotel goes on.
  const dealWorld = deals.data?.length
    ? await readDealWorld(supabase, trip.family_id)
    : null;
  const fares = dealWorld ? judged(deals.data, dealWorld) : [];
  // A seat still to buy is the reason to set forwarding up, so the instructions
  // appear while any flight on the trip is unconfirmed -- including the common
  // case of a trip with no flight rows at all.
  const flightRows = orderedItinerary.filter(
    (item) => item.category === "flight",
  );
  const flightsToBuy = flightRows.every((item) => item.status !== "confirmed");
  const faresPanel = (
    <TripFares
      trip={trip}
      deals={fares}
      address={inboxAddressFor(household.data?.inbox_local_part)}
      unbooked={flightsToBuy}
    />
  );

  // What the family has changed since this trip was last planned, and what on it
  // cannot be true at all. Both worked out here on every load rather than stored:
  // the first is two sorted lists compared, the second is arithmetic on dates, and
  // neither can go stale because neither is written down. A trip that has never
  // been stamped has no assumption to have broken, so its drift list is empty.
  const nowCircumstances = circumstanceSnapshot({
    people: travelers.data || [],
    going: (roster.data || []).map((r) => r.traveler_id),
    pets: pets.data || [],
    petLinks: petLinks.data || [],
    facts: limits.data || [],
    home: household.data?.home_address || null,
  });
  const drift = changesBetween(trip.circumstances, nowCircumstances);
  const contradictions = tripContradictions({
    trip,
    itinerary: orderedItinerary,
    pets: pets.data || [],
    petLinks: petLinks.data || [],
    today: todayISO(),
  });

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
          pets={pets.data || []}
          petLinks={petLinks.data || []}
          basicHistory={basicHistory.data || []}
          readOnly={access?.can?.isSecondary === true}
          today={todayISO()}
          fares={faresPanel}
        />
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
        initialDayPack={dayPack.data || []}
        initialTasks={tasks.data || []}
        initialNotes={notes.data || []}
        initialCosts={costs.data || []}
        travelers={(travelers.data || []).map((t) => t.name)}
        people={(travelers.data || []).filter((t) => t.is_person)}
        initialGoing={(roster.data || []).map((r) => r.traveler_id)}
        pets={pets.data || []}
        initialPetLinks={petLinks.data || []}
        tips={tips.data || []}
        everLooked={Boolean(facts.data?.checked_at || facts.data?.looked_at)}
        lastLookedAt={facts.data?.looked_at || facts.data?.checked_at || null}
        packingTemplates={templates.data || []}
        packingTemplateItems={templateItems.data || []}
        tripTemplateIds={(tripTemplates.data || []).map((r) => r.template_id)}
        templatesChosen={Boolean(trip.templates_chosen_at)}
        today={todayISO()}
        userId={user.id}
        userName={profile?.display_name || "Family member"}
        fares={faresPanel}
        changes={drift}
        contradictions={contradictions}
      />
    </>
  );
}
