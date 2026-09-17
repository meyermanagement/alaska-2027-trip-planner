/**
 * The grammar the app's two navigations share.
 *
 * There are two of them and they do not do the same job. The rail and the arc
 * thrown up out of the compass move between routes; the bar across the top of a
 * trip switches a tab in place. Forcing one component to draw both would mean a
 * component that takes a router, a tab setter, an arc stagger seat, a hover
 * label, a model-ranked filter and a way out of a trip, and uses about half of
 * them on each call. That is not one component, it is two with a shared prop
 * bag.
 *
 * What they genuinely share is the grammar: how leaves gather into named doors,
 * which door is holding the screen you are looking at, how many leaves a door
 * says it has, when a door draws a second row, and where a count sits. That was
 * written twice, and the two copies had already drifted -- the trip kept its
 * red count on an open door while you were on a sibling leaf, and the rail
 * dropped it the moment the door opened, which is the worse of the two rules
 * because the number then disappears without anybody having read the thing it
 * was counting.
 *
 * So the grammar lives here and the drawing stays where it was.
 */

/**
 * Gather leaves into their doors, keeping only the leaves this reader may see
 * and only the doors that still hold one.
 *
 * `defs` are `{ id, label, tabs: [leafId] }`. `allowed` is the list of leaf
 * objects that survived whatever permission filter the caller applies -- on a
 * trip a secondary traveler loses Notes and Budget, so their Money door holds
 * Insurance alone and their Trip door is Overview by itself.
 */
export function withLeaves(defs, allowed) {
  return defs
    .map((g) => ({
      ...g,
      leaves: g.tabs
        .map((id) => allowed.find((t) => t.id === id))
        .filter(Boolean),
    }))
    .filter((g) => g.leaves.length > 0);
}

/**
 * The door holding a given leaf, falling back to the first door so a bar always
 * has something lit. Returns undefined only when there are no doors at all.
 */
export function holdingGroup(groups, leafId) {
  return groups.find((g) => g.leaves.some((t) => t.id === leafId)) || groups[0];
}

/**
 * Whether a door draws a second row. A door with one thing behind it draws
 * nothing: a second row that repeats the name you just pressed is a row of
 * furniture. On the trip that keeps Days and Money silent.
 */
export function opensASecondRow(group) {
  return Boolean(group && group.leaves.length > 1);
}

/**
 * Where a count sits.
 *
 * The rule, said once for both navigations: a count belongs on the door while
 * the thing it counts is not the thing you are looking at, and moves onto the
 * leaf once the door is open. A count nobody can see until they open the right
 * door is not a count -- and a count that vanishes the moment the door opens is
 * worse, because it disappears without the reader ever having reached what it
 * was about.
 *
 * `leafCounts` maps leaf id to a number. Returns `{ onDoor, onLeaf }` where
 * `onDoor` is the number to draw on the group and `onLeaf` maps leaf id to the
 * number to draw beside it.
 */
export function countPlacement(group, currentLeafId, leafCounts = {}) {
  const onLeaf = {};
  let onDoor = 0;
  if (!group) return { onDoor, onLeaf };
  for (const leaf of group.leaves) {
    const n = leafCounts[leaf.id] || 0;
    if (n <= 0) continue;
    onLeaf[leaf.id] = n;
    // On the door while you are somewhere other than the leaf it belongs to.
    if (leaf.id !== currentLeafId) onDoor += n;
  }
  return { onDoor, onLeaf };
}

/**
 * The count a shut door carries for leaves that are not in it -- used by the
 * rail, where every door is shut except one and the counts inside the others
 * still have to be visible.
 */
export function shutDoorCount(group, openGroupId, leafCounts = {}) {
  if (!group || group.id === openGroupId) return 0;
  return group.leaves.reduce(
    (sum, leaf) => sum + (leafCounts[leaf.id] || 0),
    0,
  );
}
