// Decide whether a freshly-parsed message can be filed to a trip without a
// person in the loop.
//
// The rules are deliberately narrow. Auto-filing is a big win when it is
// right (the Delta confirmation is on the trip before the family opens
// /inbox) and a real annoyance when it is wrong (a lookalike hotel address
// or a stale forward planted onto the wrong week). So the bar is: every
// dated item in the parse falls inside exactly one of this family's trips,
// every item's confidence is high, and at least one item is in the future.
// Anything short of that stays pending for a person to file.
//
// The check runs against a fresh read of family trips (so a trip added
// yesterday counts) and the just-inserted parsed items. It does not need
// to be atomic with the parse -- a race where the primary files by hand
// while auto-filing is deciding just loses the auto-file to the file
// route's idempotency (auto-file only files a row still in status='pending').
//
// Returns:
//   { auto: true, tripId }              -> caller should file + approve
//   { auto: false, reason: string }     -> caller should leave it pending

/**
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase - admin client
 * @param {{ messageId: string, familyId: string, todayISO: string }} args
 */
export async function decideAutoFile(supabase, { messageId, familyId, todayISO }) {
  // A message that is not still pending (already filed, deleted, or being
  // auto-filed by a concurrent worker) is out of scope. Only pending
  // messages are candidates.
  const { data: message } = await supabase
    .from("inbox_messages")
    .select("id, status, family_id, parse_status")
    .eq("id", messageId)
    .maybeSingle();
  if (!message) return { auto: false, reason: "message not found" };
  if (message.family_id !== familyId) {
    return { auto: false, reason: "family mismatch" };
  }
  if (message.status !== "pending") {
    return { auto: false, reason: `status ${message.status}` };
  }
  if (message.parse_status !== "succeeded") {
    return { auto: false, reason: `parse ${message.parse_status}` };
  }

  const { data: items } = await supabase
    .from("inbox_parsed_items")
    .select("id, item_date, end_date, confidence")
    .eq("message_id", messageId)
    .eq("status", "pending");

  const rows = items || [];
  if (rows.length === 0) return { auto: false, reason: "no items" };

  // Every item has to be high confidence. Any medium or low, we defer to a
  // person -- the parser said out loud it was uncertain and this is the
  // whole point of a confidence signal.
  if (rows.some((r) => r.confidence !== "high")) {
    return { auto: false, reason: "not all high confidence" };
  }

  // Every item has to be dated. An itinerary row without a date cannot land
  // anyway; if the parser could not date something, a person needs to look.
  const dates = rows
    .flatMap((r) => [r.item_date, r.end_date])
    .filter((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (dates.length === 0) return { auto: false, reason: "no dated items" };

  // At least one item has to be in the future. A confirmation for a trip
  // that has already happened is more likely to be a stale forward than a
  // real booking; a person should look at those.
  if (!dates.some((d) => d >= todayISO)) {
    return { auto: false, reason: "no future items" };
  }

  const minDate = dates.reduce((a, b) => (a < b ? a : b));
  const maxDate = dates.reduce((a, b) => (a > b ? a : b));

  // The candidate trips: family's own, with a start and end date. Draft
  // trips without dates are skipped -- we cannot say a date falls inside a
  // trip that does not know its own dates yet, and a person can file
  // manually if that is what they meant.
  const { data: trips } = await supabase
    .from("trips")
    .select("id, start_date, end_date")
    .eq("family_id", familyId);

  const dated = (trips || []).filter(
    (t) =>
      typeof t.start_date === "string" &&
      typeof t.end_date === "string" &&
      t.start_date <= t.end_date,
  );
  if (dated.length === 0) return { auto: false, reason: "no trips with dates" };

  // A trip matches when every parsed date falls inside its window. Any date
  // outside the window disqualifies it -- a return flight two days after
  // the trip's own return means the trip window is wrong or the flight
  // is on a different trip, and either way is a person's call.
  const matches = dated.filter(
    (t) => minDate >= t.start_date && maxDate <= t.end_date,
  );

  if (matches.length === 0) {
    return { auto: false, reason: "no trip covers the dates" };
  }
  if (matches.length > 1) {
    return { auto: false, reason: "ambiguous: matches multiple trips" };
  }

  return { auto: true, tripId: matches[0].id };
}
