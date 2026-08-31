// Keeping a trip's packing list honest about who is actually going.
//
// The roster and the packing list have always been two separate facts that
// happened to agree at the moment a trip was created. Add a fourth person a
// month later and nothing of theirs appears; take somebody off and their
// swimsuit is still on the list, counting against the packed total and waiting
// to be ticked by nobody. Both are the kind of wrong that is only noticed while
// standing over a suitcase.
//
// So a roster change carries the packing list with it. The first version of this
// deleted, and so had to be careful: a line somebody had packed or written a note
// on was left behind, because a roster tap should not destroy something the family
// typed. That caution was the right answer to the wrong design. Taking a name off
// a trip is not a statement that their list was a mistake — it is usually a
// question of who is coming, asked twice.
//
// So nothing is deleted now. A person's lines are set aside: still in the table,
// marked with the day and the name they were set aside for, and hidden from the
// list, the filter and the packed count. Add them back and every line returns
// exactly as it was, packed state and notes and all. That is what makes it safe
// to take the packed ones too, which is what people actually mean by "remove
// their items".

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
  // A line that is only there because it was set aside is not a line they have.
  // The restore puts those back; this is for topping up whatever the base list
  // names them for and they have never had.

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
      // The template's answer, kept. Somebody joining a trip late gets the same
      // list the trip was built from, and that includes which of their things
      // cannot go in a bag until the morning.
      last_minute: !!row?.last_minute,
      // Straight off the template, by definition -- this whole function is the
      // template copier for somebody joining a trip late.
      from_template: true,
      sort_order: next++,
    });
    if (items.length >= limit) break;
  }
  return { items, already };
}

/**
 * The lines to set aside when a person comes off a trip.
 *
 * Theirs alone, and all of them — including the ones already packed and the ones
 * with a note on them. That is only defensible because nothing is being
 * destroyed: the rows keep their packed state and their notes while they are set
 * aside, and come back with both intact. Deleting them would not be.
 *
 * "Shared" belongs to the trip rather than to anybody on it, so it never leaves.
 *
 * @returns { setAside, packed, noted } — ids to set aside, and the counts worth
 *   saying out loud, because "3 of them were already packed" is the sentence that
 *   makes somebody trust that the packed count just went down on purpose.
 */
export function itemsToSetAside({ tripItems = [], name }) {
  const who = clean(name);
  if (!who || who === "Shared") return { setAside: [], packed: 0, noted: 0 };

  const setAside = [];
  let packed = 0;
  let noted = 0;
  for (const row of tripItems) {
    if (key(row?.assignee) !== key(who)) continue;
    if (row?.stashed_at) continue;
    if (!row?.id) continue;
    if (row?.is_packed) packed += 1;
    else if (clean(row?.notes)) noted += 1;
    setAside.push(row.id);
  }
  return { setAside, packed, noted };
}

/**
 * The lines to bring back when a person is added to a trip again.
 *
 * Only the ones set aside for that person, matched on the name they were set
 * aside for rather than on the assignee, so a line somebody reassigned in the
 * meantime is not dragged back under the wrong name.
 */
export function itemsToRestore({ tripItems = [], name }) {
  const who = clean(name);
  if (!who || who === "Shared") return [];
  return tripItems
    .filter(
      (row) =>
        row?.id &&
        row?.stashed_at &&
        key(row?.stashed_for || row?.assignee) === key(who),
    )
    .map((row) => row.id);
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
  restored = 0,
  setAside = 0,
  packed = 0,
  noted = 0,
}) {
  const who = clean(name) || "They";
  if (going) {
    if (restored && added)
      return `Put ${count(restored, "item", "items")} back on the list for ${who}, exactly as ${restored === 1 ? "it was" : "they were"}, and added ${count(added, "more", "more")} from the base list.`;
    if (restored)
      return `Put ${count(restored, "item", "items")} back on the list for ${who}, exactly as ${restored === 1 ? "it was" : "they were"} — packed items still packed, notes still there.`;
    if (added)
      return `Added ${count(added, "packing item", "packing items")} for ${who}.`;
    if (already)
      return `${who} was already down for ${already === 1 ? "the one thing" : `all ${already}`} the base list names them for.`;
    return `Nothing on the base list is ${who}'s alone, so the packing list is unchanged.`;
  }

  if (!setAside) return `${who} had nothing of their own on the packing list.`;

  const because = [
    packed ? `${packed} already packed` : "",
    noted ? `${noted} with a note` : "",
  ]
    .filter(Boolean)
    .join(" and ");

  const theirs =
    setAside === 1 ? `${who}'s one item` : `${who}'s ${setAside} items`;
  return `Set ${theirs} aside${because ? ` — including ${because}` : ""}. Everything comes back if you add ${who} to the trip again.`;
}

/**
 * Does it, against whichever Supabase client the caller has. Written to be
 * callable from the trip header and from the Family tab, which are two places
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
    return { message: "", added: 0, removed: 0, restored: 0, kept: [] };

  const { data: tripItems } = await supabase
    .from("packing_items")
    .select(
      "id, item, assignee, is_packed, notes, sort_order, stashed_at, stashed_for",
    )
    .eq("trip_id", tripId);

  if (!going) {
    const { setAside, packed, noted } = itemsToSetAside({
      tripItems: tripItems || [],
      name,
    });
    // Checked, because this used to be fire-and-forget: an update that did not
    // land left the screen saying it had taken things off a list it had not,
    // which is worse than the original problem.
    if (setAside.length) {
      const { error } = await supabase
        .from("packing_items")
        .update({ stashed_at: new Date().toISOString(), stashed_for: name })
        .in("id", setAside);
      if (error)
        return {
          message: `Took ${name} off the trip, but their packing items are still on the list.`,
          added: 0,
          removed: 0,
          restored: 0,
          kept: [],
          error: error.message,
        };
    }
    return {
      message: rosterPackingWords({
        name,
        going: false,
        setAside: setAside.length,
        packed,
        noted,
      }),
      added: 0,
      removed: setAside.length,
      restored: 0,
      kept: [],
    };
  }

  // Added back: their own lines return before anything is copied, so a list the
  // family had edited comes back as they left it rather than being rebuilt from
  // the template with their changes lost.
  const restore = itemsToRestore({ tripItems: tripItems || [], name });
  let restored = 0;
  if (restore.length) {
    const { error } = await supabase
      .from("packing_items")
      .update({ stashed_at: null, stashed_for: null })
      .in("id", restore);
    if (error)
      return {
        message: `Put ${name} on the trip, but their old packing items could not be brought back.`,
        added: 0,
        removed: 0,
        restored: 0,
        kept: [],
        error: error.message,
      };
    restored = restore.length;
  }

  const live = (tripItems || []).map((row) =>
    restore.includes(row.id)
      ? { ...row, stashed_at: null, stashed_for: null }
      : row,
  );

  const { data: tpl } = await supabase
    .from("packing_templates")
    .select("id")
    .eq("family_id", familyId)
    .eq("is_base", true)
    .maybeSingle();
  if (!tpl)
    return {
      message: restored
        ? rosterPackingWords({ name, going: true, restored })
        : "",
      added: 0,
      removed: 0,
      restored,
      kept: [],
    };

  const { data: templateItems } = await supabase
    .from("packing_template_items")
    .select("category, item, assignee, quantity, last_minute")
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
    tripItems: live.filter((row) => !row?.stashed_at),
    tripId,
    name,
  });
  if (items.length) {
    const { error } = await supabase.from("packing_items").insert(items);
    if (error)
      return {
        message: `Put ${name} on the trip${restored ? ` and brought ${restored === 1 ? "their item" : `their ${restored} items`} back` : ""}, but the rest of their packing items could not be copied over.`,
        added: 0,
        removed: 0,
        restored,
        kept: [],
        error: error.message,
      };
  }
  return {
    message: rosterPackingWords({
      name,
      going: true,
      added: items.length,
      restored,
      already,
    }),
    added: items.length,
    removed: 0,
    restored,
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
 * @returns [{ name, remove: ids, packed, noted }] one group per person,
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
    if (!row?.id) continue;
    // Already set aside, so already dealt with: it is not on the list, not in
    // the packed count, and waiting for them to be added back.
    if (row?.stashed_at) continue;
    if (going.has(key(who))) continue;
    // Somebody the family does not have a row for is a guest, not a mistake.
    if (family && !family.has(key(who))) continue;
    if (!groups.has(key(who))) {
      order.push(key(who));
      groups.set(key(who), { name: who, remove: [], packed: 0, noted: 0 });
    }
    const group = groups.get(key(who));
    if (row?.is_packed) group.packed += 1;
    else if (clean(row?.notes)) group.noted += 1;
    group.remove.push(row.id);
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
 * not going" is not something anyone can act on. How many of them are packed or
 * written on is counted in the same breath, so nobody is surprised by the packed
 * total moving.
 */
export function strandedWords(groups = []) {
  if (!groups.length) return "";

  const extra = (group) => {
    const bits = [
      group.packed ? `${group.packed} packed` : "",
      group.noted ? `${group.noted} with a note` : "",
    ].filter(Boolean);
    return bits.length ? ` (${bits.join(", ")})` : "";
  };

  if (groups.length === 1) {
    const group = groups[0];
    const n = group.remove.length;
    return `${group.name} is not on this trip, and ${n === 1 ? "one of their items is" : `${n} of their items are`} still on this list${extra(group)}.`;
  }

  return `${niceList(groups.map((g) => g.name))} are not on this trip. Still on this list: ${niceList(
    groups.map((g) => `${g.remove.length} of ${g.name}'s${extra(g)}`),
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
  if (!supabase || !tripId) return { message: "", removed: 0, error: null };

  const { data: tripItems, error: readError } = await supabase
    .from("packing_items")
    .select("id, item, assignee, is_packed, notes, stashed_at")
    .eq("trip_id", tripId);
  if (readError)
    return {
      message: "Could not read the packing list.",
      removed: 0,
      error: readError.message,
    };

  const groups = strandedGroups({
    tripItems: tripItems || [],
    goingNames,
    familyNames,
  });
  const remove = groups.flatMap((group) => group.remove);
  if (!remove.length)
    return {
      message: "The packing list already matches who is going.",
      removed: 0,
      error: null,
    };

  // Set aside rather than deleted, so this is the same reversible thing a roster
  // tap does. The first version of this button deleted, and a family lost lines
  // the app had written for them; a button that cannot be undone should not be
  // offered for something as ordinary as changing your mind about who is coming.
  const stamped = new Date().toISOString();
  for (const group of groups) {
    if (!group.remove.length) continue;
    const { error } = await supabase
      .from("packing_items")
      .update({ stashed_at: stamped, stashed_for: group.name })
      .in("id", group.remove);
    if (error)
      return {
        message: "Could not take those items off the list.",
        removed: 0,
        error: error.message,
      };
  }

  const who = niceList(groups.map((g) => g.name));
  return {
    message: `Set aside ${remove.length === 1 ? "one item" : `${remove.length} items`} belonging to ${who}. Everything comes back if you add ${groups.length === 1 ? "them" : "them"} to the trip again.`,
    removed: remove.length,
    error: null,
  };
}
