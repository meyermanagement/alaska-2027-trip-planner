// When a promotion should ask for a picture, and when it should keep quiet.
//
// One function, called by all three places a trip can leave draft, so that the
// rule lives once. The three callers are otherwise nothing like each other --
// a link, a form, and Aly's tool handler -- and the commonest way a rule like
// this rots is three copies of it drifting apart.
//
// It reads and writes nothing. Give it the trip as it stands and the patch about
// to be written, and it hands back either the one extra column to include in
// that same update, or null. That shape matters: the mark rides along on a write
// the caller was already doing, so it cannot fail on its own, cannot be rolled
// back separately, and adds no round trip to the promotion.

/**
 * The statuses that mean a trip is really happening.
 *
 * Not `complete` or `archived`. Moving a draft straight to finished is what
 * somebody does when they are recording a trip they already took, or filing an
 * idea they have decided against -- neither is a trip whose cover is about to be
 * looked at, and drawing one would be spending a picture to decorate the Past
 * tab. Not `draft` either, which is the case this whole module exists to wait
 * for the end of.
 */
export const LIVE_STATUSES = ["planning", "booked", "active"];

/** Does this write move the trip out of draft and into a live status? */
export function leavesDraft(trip, patch) {
  if (trip?.status !== "draft") return false;
  const next = patch?.status;
  return typeof next === "string" && LIVE_STATUSES.includes(next);
}

/**
 * The column to add to a promotion's update, if this promotion earns a picture.
 *
 * @param {object} trip   the row as it stands: status, cover_image_url, cover_image_status
 * @param {object} patch  what is about to be written to it
 * @returns {{cover_image_status: "queued"}|null}
 */
export function coverQueuePatch(trip, patch) {
  if (!leavesDraft(trip, patch)) return null;

  // A trip that already has a picture keeps it. A promotion is not a reason to
  // redraw something the family may have asked for by hand and liked, and
  // "draw another cover" is a button they already have.
  if (trip?.cover_image_url) return null;

  // Already asked for, or already being drawn. Queueing over either would be
  // asking twice for the same picture. A previous `failed` is not in this list:
  // a promotion is a new occasion, and the commonest reason a drawing failed is
  // a model that was busy ten minutes ago.
  const now = trip?.cover_image_status;
  if (now === "queued" || now === "drawing") return null;

  return { cover_image_status: "queued" };
}

/** Is this trip waiting for its picture to be asked for? */
export function coverQueued(trip) {
  return trip?.cover_image_status === "queued";
}
