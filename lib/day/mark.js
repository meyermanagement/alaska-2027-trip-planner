/**
 * Whether a piece of researched advice is still about the thing it was written for.
 *
 * Kept apart from the research itself so that anything wanting to ask "is this
 * still true?" -- the day route, the chat context, a test -- can do so without
 * dragging a model client into its imports.
 */

/**
 * The fields an answer depended on, joined.
 *
 * Moving a dinner from six to half past eight makes yesterday's "arrive fifteen
 * minutes early, the terrace closes at seven" wrong in a way nobody would catch by
 * eye, and stale operational advice is worse than none, because it is acted on.
 */
export function fingerprint(item) {
  return [
    String(item?.title || "")
      .trim()
      .toLowerCase(),
    item?.item_date || "",
    String(item?.start_time || "").slice(0, 5),
    String(item?.location || "")
      .trim()
      .toLowerCase(),
    item?.category || "",
  ].join("|");
}

/** Has the plan moved since this advice was written? */
export function isStale(insight, item) {
  if (!insight) return true;
  return insight.fingerprint !== fingerprint(item);
}
