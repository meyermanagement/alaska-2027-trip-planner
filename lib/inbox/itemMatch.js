/**
 * Deciding whether a freshly parsed booking is a NEW itinerary row or an
 * UPDATE to one the trip already has.
 *
 * Booking systems love to resend. Holland America emails the same excursion
 * every time the tour time moves, Marriott resends the confirmation when
 * the room type changes, a rental car company sends an update when the
 * pickup location shifts. Every one of those looks like a new email to the
 * inbox and, without this file, produced a duplicate itinerary row on top
 * of the one already there. Multiplied over months of a real trip that got
 * unreadable fast.
 *
 * The rule is:
 *
 *   1. If the parsed row has a confirmation_number, and an existing row on
 *      the same trip has the SAME confirmation_number (case-insensitive,
 *      whitespace trimmed), the two are the same booking. This is the
 *      strongest signal we ever get -- booking systems' own primary keys
 *      do not accidentally collide. Category and date are not required to
 *      match, because a hotel resend with a new check-in date is still an
 *      update, not a new booking.
 *
 *   2. Failing a confirmation match, an existing row on the same trip with
 *      the same category, the same item_date, and a fuzzy-matching title is
 *      the same booking. Fuzzy title matching normalises casing, whitespace,
 *      and stray punctuation before comparing, because "White Pass Summit
 *      Scenic Railroad" and "White Pass & Summit Scenic Railroad" should
 *      collapse. A dedupe on same category + same day + same title is safe
 *      because a real trip does not have two of the same excursion on the
 *      same day; the rare exception is worth a false merge that the family
 *      can split by hand, versus the common case of every reservation
 *      silently duplicating.
 *
 *   3. Nothing matches: the row is new. Insert.
 *
 * When a match is found, the caller updates the fields the resend might
 * legitimately change and leaves the rest alone. Never overwrites a filled
 * field with null: an update email is often less detailed than the original
 * confirmation, and losing a location because the second email did not
 * repeat it would make the app worse. Never touches title, because titles
 * come from the parser and rewriting one under a family that has renamed
 * it would be worse than a mismatched title.
 */

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeConfirmation(conf) {
  return String(conf || "").trim().toLowerCase();
}

/**
 * Find the existing itinerary_items row on `tripId` that `parsed` should be
 * merged into, or null if there isn't one. `parsed` is a subset of the
 * inbox_parsed_items shape: { category, item_date, title, confirmation_number }.
 * Reads through the same supabase client the caller uses.
 */
export async function findExistingItineraryItem(supabase, tripId, parsed) {
  if (!tripId || !parsed) return null;

  const conf = normalizeConfirmation(parsed.confirmation_number);
  if (conf) {
    const { data: rows } = await supabase
      .from("itinerary_items")
      .select(
        "id, title, item_date, start_time, end_date, location, confirmation_number, notes",
      )
      .eq("trip_id", tripId)
      .not("confirmation_number", "is", null);
    for (const row of rows || []) {
      if (normalizeConfirmation(row.confirmation_number) === conf) {
        return row;
      }
    }
  }

  if (!parsed.item_date || !parsed.category) return null;
  const titleKey = normalizeTitle(parsed.title);
  if (!titleKey) return null;

  const { data: sameDay } = await supabase
    .from("itinerary_items")
    .select(
      "id, title, item_date, start_time, end_date, location, confirmation_number, notes",
    )
    .eq("trip_id", tripId)
    .eq("item_date", parsed.item_date)
    .eq("category", parsed.category);
  for (const row of sameDay || []) {
    if (normalizeTitle(row.title) === titleKey) {
      return row;
    }
  }
  return null;
}

/**
 * Build the patch to send to an itinerary_items row when merging a resend
 * into it. Only fields that the resend could legitimately have changed are
 * included, and only when the resend actually has a value: a resend that
 * omits a field never blanks the trip's copy of it.
 *
 * Returns an object suitable for supabase.from(...).update(...). Empty
 * object means the resend added nothing, which the caller can treat as a
 * no-op update and skip the round-trip.
 */
export function buildItineraryMergePatch(existing, parsed) {
  const patch = {};
  if (parsed.start_time && parsed.start_time !== existing.start_time) {
    patch.start_time = parsed.start_time;
  }
  if (parsed.end_date && parsed.end_date !== existing.end_date) {
    patch.end_date = parsed.end_date;
  }
  if (parsed.location && parsed.location !== existing.location) {
    patch.location = parsed.location;
  }
  if (
    parsed.confirmation_number &&
    normalizeConfirmation(parsed.confirmation_number) !==
      normalizeConfirmation(existing.confirmation_number)
  ) {
    patch.confirmation_number = parsed.confirmation_number;
  }
  if (parsed.notes && parsed.notes !== existing.notes) {
    patch.notes = parsed.notes;
  }
  return patch;
}
