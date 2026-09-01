/**
 * Approving some of a group of proposed changes rather than all of it.
 *
 * Until now a chunk of changes was one decision: Apply, or Discard. That is the
 * right shape when the chunk is three lines the family asked for by name. It is
 * the wrong shape the moment Aly is asked to propose things -- twenty suggested
 * items, eighteen of them wanted -- because Discard throws away the eighteen and
 * Apply saves the two nobody wants, and the only way out is to save everything
 * and delete the rest one at a time afterwards.
 *
 * So each line in a chunk gets a tick of its own. Everything is ticked when it
 * arrives, because the common case is still that the whole chunk is wanted, and
 * a screen that starts with nothing chosen makes the family do work to get back
 * to where they already were.
 *
 * Two chunks are deliberately left as one decision:
 *
 *  - Removals. Deleting half of what you asked to delete is not a smaller
 *    version of the request, it is a different one, and the confirm wording
 *    ("Yes, delete") is written about all of it.
 *  - Emptying a list. Everything else in that category depends on it.
 *
 * And inside a chunk that can be picked over, whatever CREATES the thing the
 * other lines go into stays ticked and cannot be turned off: unticking "start a
 * Cruise list" while leaving "add door magnets to the Cruise list" ticked asks
 * the server to put items on a list that does not exist.
 */

/**
 * Tools that make the container other lines in the same chunk land inside. They
 * cannot be unticked while anything else in the chunk survives.
 */
const CREATORS = new Set([
  "create_trip",
  "create_template",
  "start_packing_list",
]);

/** Is this chunk one the family can pick over line by line? */
export function pickable(group) {
  if (!group || !Array.isArray(group.actions)) return false;
  if (group.destructive || group.wipes) return false;
  return group.actions.length > 1;
}

/** A line that has to stay, because the rest of the chunk goes inside it. */
export function locked(action, group) {
  if (!pickable(group)) return false;
  return CREATORS.has(action?.tool);
}

const keyFor = (group, index) => `${group?.key || "?"}:${index}`;

/** The stable name for one line's tick, so the set survives a re-render. */
export function tickKey(group, index) {
  return keyFor(group, index);
}

/**
 * Which lines of a chunk are actually going to be saved. `skipped` is a Set of
 * tick keys the family has turned off; anything locked is in regardless, and a
 * chunk that cannot be picked over is always all of it.
 */
export function chosenActions(group, skipped) {
  const actions = group?.actions || [];
  if (!pickable(group)) return actions;
  const off = skipped instanceof Set ? skipped : new Set();
  return actions.filter(
    (a, i) => locked(a, group) || !off.has(keyFor(group, i)),
  );
}

/** How many of the chunk's lines are on. */
export function chosenCount(group, skipped) {
  return chosenActions(group, skipped).length;
}

/**
 * What the Apply button says. It only starts counting once something has been
 * turned off: "Apply 18 of 20" on a chunk nobody has touched would suggest two
 * lines had gone missing.
 */
export function applyLabel(group, skipped) {
  const total = (group?.actions || []).length;
  const on = chosenCount(group, skipped);
  if (!pickable(group) || on === total) return "Apply";
  return `Apply ${on} of ${total}`;
}

/**
 * Turning the last line off should not leave an Apply button that saves nothing
 * and reports "Nothing was saved" as though something had gone wrong.
 */
export function nothingChosen(group, skipped) {
  return pickable(group) && chosenCount(group, skipped) === 0;
}

/**
 * Turning one line on or off. Returns a new Set so React sees the change; a
 * locked line ignores the click rather than silently recording a tick that
 * chosenActions would overrule.
 */
export function toggle(skipped, group, index) {
  const next = new Set(skipped instanceof Set ? skipped : []);
  const action = (group?.actions || [])[index];
  if (locked(action, group)) return next;
  const k = keyFor(group, index);
  if (next.has(k)) next.delete(k);
  else next.add(k);
  return next;
}

/** Every tick belonging to a chunk, cleared once that chunk has been dealt with. */
export function forgetGroup(skipped, group) {
  const next = new Set(skipped instanceof Set ? skipped : []);
  const prefix = `${group?.key || "?"}:`;
  for (const k of next) if (k.startsWith(prefix)) next.delete(k);
  return next;
}
