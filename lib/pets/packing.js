// Keeping a trip's packing list in step with whether a pet is actually coming.
//
// The first cut of this borrowed the roster machinery wholesale by writing the
// animal's name into `packing_items.assignee`, so a pet's lines behaved exactly
// as a person's did. That was neat and it was wrong: it made the dog the owner
// of its own luggage, and it took away the family's ability to say who is
// actually responsible for the horse's feed. A pet cannot carry anything.
//
// So the pet is now `pet_id` on the line, and `assignee` goes back to meaning a
// person or Shared everywhere in the app. The set-aside and bring-back behavior
// survives and gets better for it: matching an id is exact, where matching a
// name in free text broke the moment somebody renamed a pet or two animals
// shared a name.

import { isComing } from "./pets";
import { ensurePetTemplate } from "./template";

const key = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

function idle() {
  return { message: "", added: 0, removed: 0, restored: 0 };
}

/**
 * The live lines on a trip that are about one pet.
 *
 * Matched on the id, never on the name. Anything already set aside is left
 * alone, because setting aside what is already set aside would overwrite the
 * record of why.
 */
export function petItemsToSetAside({ tripItems = [], petId }) {
  if (!petId) return { setAside: [], packed: 0, noted: 0 };
  const setAside = [];
  let packed = 0;
  let noted = 0;
  for (const row of tripItems) {
    if (!row?.id) continue;
    if (row.pet_id !== petId) continue;
    if (row.stashed_at) continue;
    if (row.is_packed) packed += 1;
    else if (String(row.notes || "").trim()) noted += 1;
    setAside.push(row.id);
  }
  return { setAside, packed, noted };
}

/** The set-aside lines to bring back when that pet rejoins the trip. */
export function petItemsToRestore({ tripItems = [], petId }) {
  if (!petId) return [];
  return tripItems
    .filter((row) => row?.id && row.stashed_at && row.pet_id === petId)
    .map((row) => row.id);
}

/**
 * Bring one trip's packing list into line with one pet's arrangement.
 * Returns what changed, in words, so a receipt can say it.
 */
export async function syncPackingForPet({
  supabase,
  tripId,
  familyId,
  pet,
  arrangement,
}) {
  const name = String(pet?.name || "").trim();
  const petId = pet?.id;
  if (!supabase || !tripId || !petId || !name) return idle();

  const { data: tripItems, error: readError } = await supabase
    .from("packing_items")
    .select("id, item, assignee, pet_id, is_packed, notes, stashed_at")
    .eq("trip_id", tripId);
  if (readError) return { ...idle(), error: readError.message };

  // A list that does not exist yet is left alone. Writing a pet's lines onto an
  // empty trip would put a packing list where the family has not asked for one,
  // and it would look like the app had started the list for them.
  const hasList = (tripItems || []).some((row) => !row?.stashed_at);

  if (!isComing(arrangement)) {
    const { setAside, packed, noted } = petItemsToSetAside({
      tripItems: tripItems || [],
      petId,
    });
    if (!setAside.length) return idle();
    const { error } = await supabase
      .from("packing_items")
      .update({ stashed_at: new Date().toISOString(), stashed_for: name })
      .in("id", setAside);
    if (error)
      return {
        ...idle(),
        error: error.message,
        message: `${name}\u2019s things are still on the packing list.`,
      };
    const caveat = [
      packed ? `${packed} already packed` : null,
      noted ? `${noted} with notes` : null,
    ].filter(Boolean);
    return {
      message: `Set aside ${setAside.length} of ${name}\u2019s packing ${
        setAside.length === 1 ? "line" : "lines"
      }${caveat.length ? ` (${caveat.join(", ")})` : ""} \u2014 they come back untouched if ${name} rejoins the trip`,
      added: 0,
      removed: setAside.length,
      restored: 0,
    };
  }

  // Coming along: their own rows come back before anything new is written, so a
  // list the family has edited returns as they left it.
  const restore = petItemsToRestore({ tripItems: tripItems || [], petId });
  let restored = 0;
  if (restore.length) {
    const { error } = await supabase
      .from("packing_items")
      .update({ stashed_at: null, stashed_for: null })
      .in("id", restore);
    if (error)
      return {
        ...idle(),
        error: error.message,
        message: `${name} is on the trip, but their old packing lines could not be brought back.`,
      };
    restored = restore.length;
  }

  if (!hasList && !restored) return idle();

  const live = new Set(
    (tripItems || [])
      .filter((row) => !row?.stashed_at || restore.includes(row.id))
      .filter((row) => row?.pet_id === petId)
      .map((row) => key(row?.item)),
  );

  // The lines come from the pet's own template, not from a fresh guess, so a
  // family that deleted "Collapsible bowls" does not get it back every time the
  // dog rejoins a trip. The template is made and seeded on first use.
  const tpl = await ensurePetTemplate({
    supabase,
    familyId: familyId || pet?.family_id || null,
    pet,
  });
  const wanted = (tpl.items || []).filter((row) => !live.has(key(row.item)));

  let added = 0;
  if (wanted.length) {
    const { error } = await supabase.from("packing_items").insert(
      wanted.map((row, index) => ({
        trip_id: tripId,
        category: row.category,
        item: row.item,
        // Who packs it. A pet owns nothing, so this is whoever the template
        // says, and Shared when nobody has claimed it.
        assignee: row.assignee || "Shared",
        pet_id: petId,
        quantity: row.quantity || "1",
        sort_order: row.sort_order ?? index,
      })),
    );
    if (error)
      return {
        ...idle(),
        restored,
        error: error.message,
        message: restored
          ? `Brought ${restored} of ${name}\u2019s packing ${restored === 1 ? "line" : "lines"} back, but the rest could not be added.`
          : `${name}\u2019s packing lines could not be added.`,
      };
    added = wanted.length;
  }

  const said = [
    restored
      ? `brought back ${restored} of ${name}\u2019s packing ${restored === 1 ? "line" : "lines"}`
      : null,
    added
      ? `added ${added} packing ${added === 1 ? "line" : "lines"} for ${name}`
      : null,
  ].filter(Boolean);
  return {
    message: said.length ? said.join(" and ") : "",
    added,
    removed: 0,
    restored,
  };
}
