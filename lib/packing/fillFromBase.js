import { syncPackingForPet } from "@/lib/pets/packing";
import { isComing } from "@/lib/pets/pets";
import { draftPackingWords, packingWaitsForDraft } from "@/lib/packing/draft";

// Copying the base list onto a trip. This used to happen inside trip creation,
// where an 87-item list appeared as an invisible side effect of approving a
// trip; it is now something the family says yes to on its own. What lands here
// is only the floor — the smarter pass that reads the destination and the time
// of year runs afterwards, from the panel.
export async function fillPackingFromBase({ supabase, tripId, familyId }) {
  // Nothing packs for a draft. Checked here rather than only where Aly asks, so
  // that no future caller can route around it.
  const { data: trip } = await supabase
    .from("trips")
    .select("name, status")
    .eq("id", tripId)
    .maybeSingle();
  if (packingWaitsForDraft(trip)) {
    return { error: { message: draftPackingWords(trip?.name) }, copied: 0 };
  }

  const { count } = await supabase
    .from("packing_items")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .is("stashed_at", null);
  if (count) {
    return {
      error: {
        message:
          "That trip already has a packing list, so I left it alone rather than doubling it up.",
      },
    };
  }

  const { data: tpl } = await supabase
    .from("packing_templates")
    .select("id")
    .eq("family_id", familyId)
    .eq("is_base", true)
    .maybeSingle();
  if (!tpl) return { error: null, copied: 0 };

  const { data: items } = await supabase
    .from("packing_template_items")
    .select("category, item, assignee, quantity, sort_order")
    .eq("template_id", tpl.id);
  if (!items?.length) return { error: null, copied: 0 };

  // Who is going is read from the trip's own roster rather than passed in, so
  // this is right whoever asked for it and whenever they asked. Packing for
  // someone who stayed home is noise; shared items belong to the trip rather
  // than to a person, so they are kept either way.
  const { data: rows } = await supabase
    .from("trip_travelers")
    .select("travelers(name)")
    .eq("trip_id", tripId);
  const going = (rows || []).map((r) => r.travelers?.name).filter(Boolean);
  const wanted = going.length
    ? items.filter((i) => {
        const who = String(i.assignee || "").trim();
        return !who || who === "Shared" || going.includes(who);
      })
    : items;
  if (!wanted.length) return { error: null, copied: 0 };

  const { error } = await supabase
    .from("packing_items")
    .insert(wanted.map((i) => ({ ...i, trip_id: tripId })));
  if (error) return { error, copied: 0 };

  // The animals on this trip get their own lines too, from each one's own
  // template. This runs after the insert above on purpose: syncPackingForPet
  // will not start a list from nothing, so there has to be a list first. Every
  // line it writes is owned by a person or Shared and merely tagged with the
  // pet — the dog is not answerable for its own luggage.
  let pets = 0;
  const { data: onTrip } = await supabase
    .from("trip_pets")
    .select(
      "arrangement, pets (id, family_id, name, species, travel_style, medications)",
    )
    .eq("trip_id", tripId);
  for (const link of onTrip || []) {
    if (!link.pets || !isComing(link.arrangement)) continue;
    const outcome = await syncPackingForPet({
      supabase,
      tripId,
      familyId,
      pet: link.pets,
      arrangement: link.arrangement,
    });
    pets += outcome.added || 0;
  }
  return { error: null, copied: wanted.length + pets };
}
