import { buildContext } from "@/lib/agent/context";
import { sortItinerary } from "@/lib/day/order";

// Everything the family has, in one snapshot. RLS keeps it to their own rows.
//
// Lifted out of the chat route so a second caller can stand in exactly the same
// place Aly stands in. The interview dry run is that caller: a rehearsal is only
// worth running if it sees the same trips, roster, preferences and ledger the
// real conversation sees, and a second loader written to be "close enough" is a
// rehearsal that passes while the real thing fails.
export async function loadEverything(
  supabase,
  userId,
  focusTripId,
  said = "",
  focus = null,
) {
  const rows = await readEverything(supabase, userId);
  return buildContext({ ...rows, focusTripId, focus, message: said });
}

/**
 * The same seventeen reads, handed back as rows rather than as a prompt.
 *
 * The chat route wants the prompt and nothing else. The interview rehearsal
 * wants to build the prompt seven times over, substituting the preferences,
 * facts and ledger it has accumulated in memory, which means it needs the rows
 * once and the builder per turn -- reading the whole family's record seven times
 * for one rehearsal is a hundred and nineteen queries for no new information.
 */
export async function readEverything(supabase, userId) {
  const [
    profile,
    trips,
    itinerary,
    packing,
    tasks,
    notes,
    travelers,
    rosters,
    preferences,
    rewards,
    templates,
    templateItems,
    lessons,
    pets,
    tripPets,
    insights,
    tripTemplates,
    households,
    costs,
    facts,
    slots,
    moments,
  ] = await Promise.all([
    // Who is asking. One more query in a batch of seventeen costs nothing; on
    // its own, in front of them, it cost a whole round trip.
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("trips").select("*").order("start_date", { ascending: true }),
    supabase
      .from("itinerary_items")
      .select("*")
      .order("item_date", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("packing_items")
      .select("*")
      // Rows set aside when somebody came off a roster are not on any list, so
      // they are not part of what Aly is looking at either.
      .is("stashed_at", null)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("predeparture_tasks")
      .select("*")
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_notes")
      .select("*")
      .order("created_at", { ascending: false }),
    supabase
      .from("travelers")
      .select(
        // The three profile groups ride along, because they are what turns
        // Aly's advice from a travel article into advice about these people.
        "id, name, email, user_id, invited_at, date_of_birth, gender, phone_carrier, phone_device, mobility_aids, accessibility_notes, languages, about_me",
      )
      .order("sort_order"),
    supabase.from("trip_travelers").select("trip_id, traveler_id"),
    supabase
      .from("travel_preferences")
      // slot, reason and source came in with the interview and were missing
      // here, which meant every answer the interview saved was invisible to the
      // ledger on the next turn: it reads a preference's slot to decide whether
      // a question has been answered, so Aly would have gone on asking about
      // pace forever with the answer sitting in the same table.
      .select(
        "id, topic, topics, body, traveler_id, traveler_ids, slot, reason, source",
      )
      .order("topic", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("rewards_programs")
      .select("*")
      .eq("is_active", true)
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("packing_templates")
      .select("id, name, description, is_base")
      .order("is_base", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("packing_template_items")
      .select("id, template_id, category, item, assignee, quantity")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true }),
    // Her own notes. Ranked in lib/agent/lessons.js rather than here, because
    // which ones matter depends on the question as much as on the trip.
    supabase
      .from("lessons")
      .select(
        "id, trip_id, subject, body, kind, learned_from, status, times_recalled, created_at",
      )
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("pets")
      .select(
        "id, name, species, breed, date_of_birth, sex, is_sterilized, weight_lb, travel_style, carrier_size, is_service_animal, rabies_expiration, health_certificate_expiration, coggins_expiration, medications, dietary_notes, temperament_notes, notes",
      )
      .order("sort_order", { ascending: true }),
    supabase
      .from("trip_pets")
      .select("trip_id, pet_id, arrangement, arrangement_notes"),
    // What the day view already found out about individual bookings. Loaded so
    // that a question asked out loud gets the same answer as the line on the
    // screen -- and so Aly does not go and search for a dress code the app is
    // already displaying two inches above the chat.
    supabase
      .from("item_insights")
      .select(
        "item_id, trip_id, fingerprint, dress_code, arrive_minutes, arrive_why, heads_up, bring",
      ),
    // Which add-on packing lists each trip says it is built from. Loaded so Aly
    // can see what a trip already claims to be before she proposes a change to
    // it, and so she does not offer to add a list a trip is already using.
    supabase.from("trip_templates").select("trip_id, template_id"),
    // Where they leave from. RLS keeps this to the households they belong to,
    // and the first one is the one every other query here is already about.
    supabase.from("families").select("name, home_address, home_lat, home_lon"),
    // The money a trip spends that is not an event on any day. The itinerary
    // already carries its own costs, so this is the other half of a budget:
    // groceries, gas, bags, the dog sitter.
    supabase
      .from("trip_costs")
      .select(
        "id, trip_id, label, category, cost_estimate, cost_actual, cost_note",
      )
      .order("created_at", { ascending: true }),
    // The constraint layer: allergies, mobility, languages, ages. Read on every
    // turn rather than only on the Family tab, because a rule that is only
    // visible on one screen is a rule that gets broken on the others.
    supabase
      .from("household_facts")
      .select("id, traveler_id, kind, slot, body, source")
      .order("created_at", { ascending: true }),
    // The interview ledger, so a conversation knows what has already been put to
    // this person and what they waved off.
    supabase
      .from("traveler_slots")
      .select("traveler_id, slot, status, asked_count, last_question, note"),
    // A few sentences per person about what they remember loving on past trips.
    // Written in their own voice, read alongside about_me so a question that is
    // already answered by a moment does not get asked.
    supabase
      .from("favorite_moments")
      .select("id, traveler_id, body, sort_order")
      .order("sort_order", { ascending: true }),
  ]);

  return {
    trips: trips.data || [],
    // In the same order the family sees it. Aly reading a day bottom-up is how
    // "what is first tomorrow" comes back as the last thing on it.
    itinerary: sortItinerary(itinerary.data || []),
    packing: packing.data || [],
    tasks: tasks.data || [],
    notes: notes.data || [],
    travelers: travelers.data || [],
    rosters: rosters.data || [],
    preferences: preferences.data || [],
    rewards: rewards.data || [],
    templates: templates.data || [],
    templateItems: templateItems.data || [],
    tripTemplates: tripTemplates.data || [],
    lessons: lessons.data || [],
    pets: pets.data || [],
    tripPets: tripPets.data || [],
    insights: insights.data || [],
    costs: costs.data || [],
    facts: facts.data || [],
    slots: slots.data || [],
    moments: moments.data || [],
    userName: profile?.data?.display_name,
    home: households?.data?.[0] || null,
  };
}
