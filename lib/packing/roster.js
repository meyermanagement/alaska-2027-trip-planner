// Keeping a trip's packing list honest about who is actually going.
//
// The roster and the packing list have always been two separate facts that
// happened to agree at the moment a trip was created. Add a fourth person a
// month later and nothing of theirs appears; take somebody off and their
// swimsuit is still on the list, counting against the packed total and waiting
// to be ticked by nobody. Both are the kind of wrong that is only noticed while
// standing over a suitcase.
//
// So a roster change now carries the packing list with it, with one asymmetry
// that matters: adding is generous and removing is careful. Copying a line back
// on costs nothing if it was not wanted, but deleting a line someone has packed,
// or written a note on, destroys something the family typed. Anything touched
// stays, and the screen says it stayed.

import { oneOrShared } from "../people";

// A person's share of a base list, not a whole list. High enough for the real
// base template (87 items across the family) and low enough that a bad match
// cannot flood a trip.
export const MAX_JOIN_ITEMS = 120;

const clean = (value) => String(value || "").trim();
const key = (value) => clean(value).toLowerCase();

/**
 * The lines a person brings with them onto a trip.
 *
 * Only what the base list names them for. "Shared" belongs to the trip rather
 * than to anybody on it, so it is neither copied in when they arrive nor taken
 * away when they leave — one more person going does not mean a second first-aid
 * kit.
 *
 * @param templateItems rows from the family's base packing template
 * @param tripItems the trip's packing list as it stands
 * @param tripId where the new rows go
 * @param name the person joining, as written on their traveler row
 * @returns { items, already } — already counts lines the trip had for them
 */
export function itemsForJoining({
  templateItems = [],
  tripItems = [],
  tripId,
  name,
  limit = MAX_JOIN_ITEMS,
}) {
  const who = clean(name);
  if (!who || who === "Shared" || !tripId) return { items: [], already: 0 };

  // Matched on the item name alone within that person, so a line they already
  // have is not restated because the base list files it under a different
  // category. Someone else's identical line is not a reason to skip: two people
  // going both need a toothbrush.
  const mine = new Set(
    tripItems
      .filter((row) => key(row?.assignee) === key(who))
      .map((row) => key(row?.item))
      .filter(Boolean),
  );

  // Continues the trip's own numbering rather than starting at zero, or the
  // arriving person's things sort above everything already there.
  let next =
    tripItems.reduce((high, row) => Math.max(high, row?.sort_order || 0), 0) +
    1;

  const seen = new Set();
  const items = [];
  let already = 0;
  for (const row of templateItems) {
    const item = clean(row?.item);
    if (!item) continue;
    if (key(row?.assignee) !== key(who)) continue;
    if (mine.has(key(item))) {
      already += 1;
      continue;
    }
    // A base list with the same line twice would otherwise put it on the trip
    // twice, and the duplicate is then theirs to delete by hand.
    if (seen.has(key(item))) continue;
    seen.add(key(item));

    items.push({
      trip_id: tripId,
      // NOT NULL with this default, so an untidy template row still lands
      // somewhere findable rather than failing the whole insert.
      category: clean(row?.category) || "General",
      item,
      assignee: who,
      quantity: row?.quantity || null,
      sort_order: next++,
    });
    if (items.length >= limit) break;
  }
  return { items, already };
}

/**
 * The lines that go when a person comes off a trip.
 *
 * Theirs alone, and only the ones nobody has touched. A packed item is a fact
 * about the real suitcase and a note is something a person wrote; either one
 * outranks a roster tap, so both stay behind and are reported rather than
 * quietly deleted.
 *
 * @returns { remove, kept } — remove is ids, kept is {item, why} for the screen
 */
export function itemsForLeaving({ tripItems = [], name }) {
  const who = clean(name);
  if (!who || who === "Shared") return { remove: [], kept: [] };

  const remove = [];
  const kept = [];
  for (const row of tripItems) {
    if (key(row?.assignee) !== key(who)) continue;
    if (row?.is_packed) {
      kept.push({ item: clean(row?.item), why: "packed" });
      continue;
    }
    if (clean(row?.notes)) {
      kept.push({ item: clean(row?.item), why: "note" });
      continue;
    }
    if (row?.id) remove.push(row.id);
  }
  return { remove, kept };
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * What the screen says afterwards. Written out because a silent list that grows
 * by six lines while you tap a name is unnerving, and because the reason two of
 * somebody's things survived being removed has to be visible to be trusted.
 */
export function rosterPackingWords({
  name,
  going,
  added = 0,
  already = 0,
  removed = 0,
  kept = [],
}) {
  const who = clean(name) || "They";
  if (going) {
    if (added)
      return `Added ${count(added, "packing item", "packing items")} for ${who}.`;
    if (already)
      return `${who} was already down for ${already === 1 ? "the one thing" : `all ${already}`} the base list names them for.`;
    return `Nothing on the base list is ${who}'s alone, so the packing list is unchanged.`;
  }

  const packed = kept.filter((k) => k.why === "packed").length;
  const noted = kept.length - packed;
  const because = [
    packed ? `${packed} already packed` : "",
    noted ? `${noted} with a note` : "",
  ]
    .filter(Boolean)
    .join(" and ");

  const theirs =
    removed === 1 ? `one of ${who}'s items` : `${removed} of ${who}'s items`;
  if (removed && kept.length) return `Removed ${theirs}. Kept ${because}.`;
  if (removed) return `Removed ${theirs}.`;
  if (kept.length)
    return `Left ${who}'s ${count(kept.length, "item", "items")} alone — ${because}.`;
  return `${who} had nothing of their own on the packing list.`;
}

/**
 * Does it, against whichever Supabase client the caller has. Written to be
 * callable from the trip header and from the People tab, which are two places
 * asking the same question, and to be safe to call twice: joining skips what is
 * there and leaving has nothing left to delete.
 */
export async function syncPackingForTraveler({
  supabase,
  tripId,
  familyId,
  person,
  going,
}) {
  const name = clean(person?.name);
  // "Shared" is a traveler row so things can be assigned to nobody in
  // particular. It is not a person and never joins or leaves a trip.
  if (!supabase || !tripId || !name || name === "Shared")
    return { message: "", added: 0, removed: 0, kept: [] };

  const { data: tripItems } = await supabase
    .from("packing_items")
    .select("id, item, assignee, is_packed, notes, sort_order")
    .eq("trip_id", tripId);

  if (!going) {
    const { remove, kept } = itemsForLeaving({
      tripItems: tripItems || [],
      name,
    });
    if (remove.length)
      await supabase.from("packing_items").delete().in("id", remove);
    return {
      message: rosterPackingWords({
        name,
        going: false,
        removed: remove.length,
        kept,
      }),
      added: 0,
      removed: remove.length,
      kept,
    };
  }

  const { data: tpl } = await supabase
    .from("packing_templates")
    .select("id")
    .eq("family_id", familyId)
    .eq("is_base", true)
    .maybeSingle();
  if (!tpl) return { message: "", added: 0, removed: 0, kept: [] };

  const { data: templateItems } = await supabase
    .from("packing_template_items")
    .select("category, item, assignee, quantity")
    .eq("template_id", tpl.id);

  // Settled against the whole family's names, not just the arriving person's, so
  // "Ste" on a base list resolves to Stephanie exactly as it does everywhere else
  // rather than falling to the one name in hand. A name nobody holds any more
  // reads as "Shared", which means it stays with the trip.
  const { data: family } = await supabase
    .from("travelers")
    .select("name")
    .eq("family_id", familyId);
  const travelerNames = (family || []).map((row) => row?.name).filter(Boolean);
  if (!travelerNames.some((n) => key(n) === key(name)))
    travelerNames.push(name);
  const settled = (templateItems || []).map((row) => ({
    ...row,
    assignee: oneOrShared(row?.assignee, travelerNames),
  }));

  const { items, already } = itemsForJoining({
    templateItems: settled,
    tripItems: tripItems || [],
    tripId,
    name,
  });
  if (items.length) await supabase.from("packing_items").insert(items);
  return {
    message: rosterPackingWords({
      name,
      going: true,
      added: items.length,
      already,
    }),
    added: items.length,
    removed: 0,
    kept: [],
  };
}
