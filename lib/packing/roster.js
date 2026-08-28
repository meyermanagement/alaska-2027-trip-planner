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
    // Checked, because this used to be fire-and-forget: a delete that did not
    // land left the screen saying it had removed things it had not, which is
    // worse than the original problem.
    let failed = null;
    if (remove.length) {
      const { error } = await supabase
        .from("packing_items")
        .delete()
        .in("id", remove);
      failed = error || null;
    }
    if (failed)
      return {
        message: `Took ${name} off the trip, but their packing items could not be removed. They are still on the list.`,
        added: 0,
        removed: 0,
        kept,
        error: failed.message,
      };
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
  if (items.length) {
    const { error } = await supabase.from("packing_items").insert(items);
    if (error)
      return {
        message: `Put ${name} on the trip, but their packing items could not be copied over.`,
        added: 0,
        removed: 0,
        kept: [],
        error: error.message,
      };
  }
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

/**
 * The lines left behind by a roster that changed without the list following it.
 *
 * Two things put them there. A list that diverged before a roster tap carried the
 * packing with it — every trip made before that existed — and any tap whose
 * delete did not land, because a tap is one moment on one device and a list is
 * forever. So the list is also checked against the roster every time it is drawn,
 * which is the only way that cannot be missed.
 *
 * "Shared" is nobody's, so it is never stranded. A name with no traveler row is
 * left alone too: it may be a guest somebody typed in on purpose, and guessing
 * that a typed name is a mistake is how you delete somebody's real list.
 *
 * @param tripItems the trip's packing rows
 * @param goingNames the names on the trip's roster
 * @param familyNames every name the family holds, so a guest is not mistaken for
 *   somebody who was taken off the trip
 * @returns [{ name, remove: ids, kept: [{item, why}] }] one group per person,
 *   in the order they appear on the list
 */
export function strandedGroups({
  tripItems = [],
  goingNames = [],
  familyNames = null,
}) {
  const going = new Set((goingNames || []).map(key).filter(Boolean));
  // Nobody added yet is not the same as nobody going. A trip whose roster has
  // never been filled in would otherwise have its whole packing list called
  // stranded, which is the opposite of helpful on a list somebody just wrote.
  if (!going.size) return [];
  const family = familyNames
    ? new Set((familyNames || []).map(key).filter(Boolean))
    : null;

  const order = [];
  const groups = new Map();
  for (const row of tripItems) {
    const who = clean(row?.assignee);
    if (!who || who === "Shared") continue;
    if (going.has(key(who))) continue;
    // Somebody the family does not have a row for is a guest, not a mistake.
    if (family && !family.has(key(who))) continue;
    if (!groups.has(key(who))) {
      order.push(key(who));
      groups.set(key(who), { name: who, remove: [], kept: [] });
    }
    const group = groups.get(key(who));
    if (row?.is_packed)
      group.kept.push({ item: clean(row?.item), why: "packed" });
    else if (clean(row?.notes))
      group.kept.push({ item: clean(row?.item), why: "note" });
    else if (row?.id) group.remove.push(row.id);
  }
  return order.map((k) => groups.get(k));
}

/** How many rows a tidy would take out, across everybody. */
export function strandedCount(groups = []) {
  return groups.reduce((sum, group) => sum + group.remove.length, 0);
}

/**
 * The sentence above the packing list when somebody's things are still on it.
 *
 * Names the person and the number, because "some items belong to people who are
 * not going" is not something anyone can act on. The kept ones are counted in the
 * same breath so the button's number is never a surprise.
 */
export function strandedWords(groups = []) {
  if (!groups.length) return "";

  const theirs = (group) => {
    const n = group.remove.length;
    const kept = group.kept.length;
    const mine = n
      ? `${n} of ${group.name}'s ${n === 1 ? "items" : "items"}`
      : `${group.name}'s ${kept === 1 ? "item" : "items"}`;
    return kept
      ? `${mine} (and ${kept} more of theirs that ${kept === 1 ? "is" : "are"} packed or written on)`
      : mine;
  };

  if (groups.length === 1) {
    const group = groups[0];
    const n = group.remove.length;
    const kept = group.kept.length;
    const count = n
      ? `${n} of their ${n === 1 ? "items is" : "items are"}`
      : `${kept === 1 ? "one of their items is" : `${kept} of their items are`}`;
    const tail =
      n && kept
        ? ` — plus ${kept} more that ${kept === 1 ? "is" : "are"} packed or written on`
        : "";
    return `${group.name} is not on this trip, and ${count} still on this list${tail}.`;
  }

  return `${niceList(groups.map((g) => g.name))} are not on this trip. Still on this list: ${niceList(
    groups.map(theirs),
  )}.`;
}

function niceList(values) {
  const list = (values || []).filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * Takes the stranded lines out, with the same asymmetry as a roster tap: packed
 * or written-on rows stay, and are reported rather than quietly kept.
 *
 * Safe to call when there is nothing to do.
 */
export async function tidyStranded({
  supabase,
  tripId,
  goingNames = [],
  familyNames = null,
}) {
  if (!supabase || !tripId)
    return { message: "", removed: 0, kept: 0, error: null };

  const { data: tripItems, error: readError } = await supabase
    .from("packing_items")
    .select("id, item, assignee, is_packed, notes")
    .eq("trip_id", tripId);
  if (readError)
    return {
      message: "Could not read the packing list.",
      removed: 0,
      kept: 0,
      error: readError.message,
    };

  const groups = strandedGroups({
    tripItems: tripItems || [],
    goingNames,
    familyNames,
  });
  const remove = groups.flatMap((group) => group.remove);
  const kept = groups.reduce((sum, group) => sum + group.kept.length, 0);
  if (!remove.length)
    return {
      message: kept
        ? `Nothing to take out — the ${kept === 1 ? "one item" : `${kept} items`} left are packed or have a note.`
        : "The packing list already matches who is going.",
      removed: 0,
      kept,
      error: null,
    };

  const { error } = await supabase
    .from("packing_items")
    .delete()
    .in("id", remove);
  if (error)
    return {
      message: "Could not take those items off the list.",
      removed: 0,
      kept,
      error: error.message,
    };

  const who = niceList(
    groups.filter((g) => g.remove.length).map((g) => g.name),
  );
  return {
    message: kept
      ? `Removed ${remove.length} of ${who}'s items. Kept ${kept} that ${kept === 1 ? "is" : "are"} packed or written on.`
      : `Removed ${remove.length} of ${who}'s items.`,
    removed: remove.length,
    kept,
    error: null,
  };
}
