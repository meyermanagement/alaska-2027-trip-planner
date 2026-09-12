// Tying a day pack line to the suitcase line it is the same object as.
//
// The rule is that nothing is carried on a day without also being on the trip's
// packing list. It does not make sense for the binoculars to be on somebody's
// back on Wednesday and not be on the trip at all, and before this the two lists
// could disagree exactly that badly: Aly would offer "carry the rain shell" for a
// morning while the case had a rain shell of its own, and the family had two rows
// for one coat with two different ticks.
//
// So every write into a day pack goes through here. The match is by name inside
// one trip, and when nothing matches, the caller writes the packing row and links
// it. Which means the answer to "is this something we own, or something we have to
// buy" is on the row rather than in somebody's head.
//
// The matching is deliberately dumb -- lowercase, collapsed spaces, and one pass
// that forgives a trailing s -- because a clever matcher that is wrong is worse
// than a plain one that misses. A miss writes a second packing line, which the
// family can see and merge. A false match silently ties the wrong two things
// together, and deleting one would take the other with it.

const text = (value) => (typeof value === "string" ? value.trim() : "");

/** Lowercase, single-spaced, no trailing punctuation. */
export function normalizeItem(value) {
  return text(value)
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/, "");
}

// "rain shells" and "rain shell" are the same coat. Only a trailing s, and only
// when what is left is long enough to still be a word, so "gas" does not become
// "ga".
function loose(value) {
  const base = normalizeItem(value);
  return base.length > 3 && base.endsWith("s") ? base.slice(0, -1) : base;
}

/**
 * The packing row a carried thing belongs to, or null.
 *
 * Somebody's own row beats a Shared one when both match, because "Mark's rain
 * shell" and "the family rain shell" are two coats and the assignee is the only
 * thing that says which one is being carried.
 *
 * @param {Array} rows packing_items for one trip
 * @param {string} item what is being carried
 * @param {string} assignee who carries it, or 'Shared'
 * @returns {object|null} the matching row
 */
export function matchCaseRow(rows = [], item = "", assignee = "Shared") {
  const want = normalizeItem(item);
  if (!want) return null;
  const wantLoose = loose(item);
  const who = normalizeItem(assignee) || "shared";
  // Set aside rows are things belonging to somebody who came off the trip. They
  // are not on the list as far as the family is concerned, so matching one would
  // link a carried thing to a line nobody can see.
  const live = (rows || []).filter((row) => row && !row.stashed_at);
  const rank = (row) => {
    const mine = normalizeItem(row.assignee) === who;
    const shared = normalizeItem(row.assignee) === "shared";
    return mine ? 0 : shared ? 1 : 2;
  };
  // Who it belongs to outranks how exactly the words line up. Steph carrying a
  // rain shell means the family's rain shell, not the one on Mark's line, even
  // when his is spelled the way she said it.
  const score = (row) =>
    rank(row) * 10 + (normalizeItem(row.item) === want ? 0 : 1);
  const candidates = live
    .filter(
      (row) =>
        normalizeItem(row.item) === want || loose(row.item) === wantLoose,
    )
    .sort((a, b) => score(a) - score(b));
  return candidates.length ? candidates[0] : null;
}

/**
 * The same match, run over what Aly has been told rather than over rows.
 *
 * The context gives her ids and names, not whole rows, which is enough to answer
 * "is this already in the case" while the card is still a proposal. It matters
 * that this happens before she writes the summary: the family reads "out of the
 * case" or "and onto the packing list" and decides whether to tick it, so the
 * line has to already know which one it is.
 *
 * @param {object} known context maps: packing_items id->name, rowTrip id->trip
 * @param {object} input
 * @param {string} input.tripId the trip being changed
 * @param {string} input.item what is being carried
 * @returns {string|null} the packing row id
 */
export function matchKnownCaseId(known, { tripId, item }) {
  const want = normalizeItem(item);
  if (!want || !known?.packing_items) return null;
  const wantLoose = loose(item);
  let near = null;
  for (const [id, name] of known.packing_items) {
    if (tripId && known.rowTrip?.get(id) !== tripId) continue;
    if (normalizeItem(name) === want) return id;
    if (!near && loose(name) === wantLoose) near = id;
  }
  return near;
}

/**
 * The packing row for a carried thing, written if it is not there yet.
 *
 * Runs on the browser client and on the server client alike -- both are the same
 * supabase interface, and RLS is what decides whether the write lands, in both
 * places.
 *
 * @param {object} supabase a supabase client
 * @param {object} input
 * @param {string} input.tripId
 * @param {string} input.item
 * @param {string} input.assignee
 * @param {string} input.userId who is asking, for the audit columns
 * @returns {Promise<{id: string|null, created: boolean, error: object|null}>}
 */
export async function ensureCaseRow(
  supabase,
  { tripId, item, assignee = "Shared", userId = null },
) {
  const name = text(item);
  if (!tripId || !name) return { id: null, created: false, error: null };

  const { data, error } = await supabase
    .from("packing_items")
    .select("id, item, assignee, stashed_at")
    .eq("trip_id", tripId);
  if (error) return { id: null, created: false, error };

  const hit = matchCaseRow(data || [], name, assignee);
  if (hit) return { id: hit.id, created: false, error: null };

  // Nothing like it on the trip, so it is a thing the family does not have with
  // them yet. It goes on the list unpacked, which is the honest state: carried on
  // Wednesday, and still not in the case.
  const { data: made, error: writeError } = await supabase
    .from("packing_items")
    .insert({
      trip_id: tripId,
      item: name,
      assignee: text(assignee) || "Shared",
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (writeError) return { id: null, created: false, error: writeError };
  return { id: made?.id || null, created: true, error: null };
}
