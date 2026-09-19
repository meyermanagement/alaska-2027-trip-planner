import { homeToday } from "@/lib/format";

export const DEADLINE_PASSED = "Deadline passed";

function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// A date-only deadline remains available through that whole household day.
export function fareDeadlinePassed(deal, today = homeToday()) {
  return validDay(deal?.book_by) && validDay(today) && deal.book_by < today;
}

export function fareHasExpired(deal, today = homeToday()) {
  return !deal?.book_by_inferred && fareDeadlinePassed(deal, today);
}

// Keep every reading surface consistent even between scheduled watch runs.
// Saved fares never move automatically. Legacy expired rows share the history.
export function fareForToday(deal, today = homeToday()) {
  if (deal.status === "expired" || (deal.status === "open" && fareHasExpired(deal, today)))
    return { ...deal, status: "dismissed", dismissed_reason: DEADLINE_PASSED, trip_id: null, someday_id: null };
  return deal;
}

// Separate declined offers that can still be reconsidered from expired history.
// Classify legacy status before projection, since it may lack a book-by date.
export function fareListsForToday(deals = [], today = homeToday()) {
  const lists = { open: [], refused: [], expired: [], taken: [] };
  for (const original of deals) {
    const deal = fareForToday(original, today);
    if (deal.status === "open") lists.open.push(deal);
    else if (deal.status === "taken") lists.taken.push(deal);
    else if (deal.status === "dismissed") {
      const expired = original.status === "expired" || fareHasExpired(deal, today);
      lists[expired ? "expired" : "refused"].push(deal);
    }
  }
  return lists;
}

export function fareMatchesTrip(deal, tripId) {
  return deal.status === "taken"
    ? deal.trip_id === tripId
    : deal.status === "open" && deal.verdict?.trip?.id === tripId;
}

// Recheck status, household and deadline at write time, in case somebody saved
// the fare or extended its deadline while the watcher was reading it.
export async function retireFares(supabase, familyId, ids, today) {
  if (!familyId || !ids.length) return { data: [], error: null };
  return supabase.from("flight_deals")
    .update({ status: "dismissed", dismissed_reason: DEADLINE_PASSED, trip_id: null, someday_id: null })
    .eq("family_id", familyId).eq("status", "open")
    .in("id", ids).lt("book_by", today)
    .or("book_by_inferred.is.null,book_by_inferred.eq.false")
    .select("id");
}
