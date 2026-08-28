// Keeping a pet's things on the packing list in step with whether that pet is
// actually coming.
//
// This deliberately borrows the roster machinery rather than inventing a second
// one. `packing_items.assignee` is free text, so a pet's name sits in it exactly
// as a person's does, which means the set-aside and bring-back behavior the
// family already knows from adding and removing travelers works for animals
// without a line of new logic: take Biscuit off Alaska and her four lines are
// stashed, not deleted; put her back and the same rows return, including
// anything that had been ticked or written on.

import { itemsToRestore, itemsToSetAside } from "../packing/roster";
import { isComing, packingItemsFor } from "./pets";

const key = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

function idle() {
  return { message: "", added: 0, removed: 0, restored: 0 };
}

/**
 * Bring one trip's packing list into line with one pet's arrangement.
 * Returns what changed, in words, so a receipt can say it.
 */
export async function syncPackingForPet({
  supabase,
  tripId,
  pet,
  arrangement,
}) {
  const name = String(pet?.name || "").trim();
  if (!supabase || !tripId || !name) return idle();

  const { data: tripItems, error: readError } = await supabase
    .from("packing_items")
    .select("id, item, assignee, is_packed, notes, stashed_at, stashed_for")
    .eq("trip_id", tripId);
  if (readError) return { ...idle(), error: readError.message };

  // A list that does not exist yet is left alone. Writing a pet's four lines
  // onto an empty trip would put a packing list where the family has not asked
  // for one, and it would look like the app had started the list for them.
  const hasList = (tripItems || []).some((row) => !row?.stashed_at);

  if (!isComing(arrangement)) {
    const { setAside, packed, noted } = itemsToSetAside({
      tripItems: tripItems || [],
      name,
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
  const restore = itemsToRestore({ tripItems: tripItems || [], name });
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
      .filter((row) => key(row?.assignee) === key(name))
      .map((row) => key(row?.item)),
  );
  const wanted = packingItemsFor(pet).filter((row) => !live.has(key(row.item)));

  let added = 0;
  if (wanted.length) {
    const { error } = await supabase.from("packing_items").insert(
      wanted.map((row) => ({
        trip_id: tripId,
        category: row.category,
        item: row.item,
        assignee: name,
        quantity: 1,
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
