import { countNeedingAttention } from "@/lib/reminders";
import { loadHeaderNotices } from "@/lib/tips/load";
import { loadSetupState } from "@/lib/setup/state";
import { unreadFares as readUnreadFares } from "@/lib/deals/unread";
import { tripMenuCounts } from "@/lib/trips/menuCounts";
import { messagesNeedingTrip } from "@/lib/inbox/newTrip";

/**
 * Everything the menu bar reads, in two rounds instead of five.
 *
 * It used to ask the sign-in server who was asking, then read, then read the
 * fares, then read the trips and the setup checklist, then read the parsed mail
 * -- each waiting for the one before, and all of it starting only after the
 * screen underneath had finished its own reads. Who is asking now comes from the
 * token (see lib/supabase/who.js), the access check is shared with the screen,
 * and everything that only needs the household goes in one round.
 *
 * `access` is a promise so the first round can start while it is still being
 * worked out; the reads in that round do not need it.
 */
export async function loadMenu(supabase, { who, access, today, unreadFares = readUnreadFares }) {
  // The passport and tip bands take two rounds of their own (the trips, then
  // the passports of the people on them). Nothing else waits for them: they are
  // started here and collected with the second round.
  const noticesRead = loadHeaderNotices(supabase, today);
  const [{ data: rows }, resolved, inboxPending] = await Promise.all([
    supabase
      .from("predeparture_tasks")
      .select("due_date, timing, priority, trips(start_date, end_date, status)")
      .eq("is_done", false),
    access,
    // Ids rather than a head count: the banner also says when one of these
    // messages is a booking for a trip the family has not entered, and that
    // needs the messages' dates. RLS scopes the rows to this person's family.
    supabase.from("inbox_messages").select("id").eq("status", "pending"),
  ]);

  const secondary = Boolean(resolved?.can?.isSecondary);
  const familyId = resolved?.familyId || null;
  const inboxMessages = inboxPending?.data || [];

  // The second round: every read here needs the household or the pending ids,
  // and none needs another. The parsed mail is still read only when there is
  // mail waiting, so the usual render makes no extra query.
  const [notices, fareRows, setup, tripRows, itemRows] = await Promise.all([
    noticesRead,
    familyId && !secondary ? unreadFares(supabase, who?.id, familyId) : [],
    loadSetupState(supabase, {
      familyId,
      travelerId: resolved?.travelerId,
      today,
      secondary,
    }),
    familyId && !secondary
      ? supabase
          .from("trips")
          .select("status, start_date, end_date")
          .eq("family_id", familyId)
      : Promise.resolve({ data: [] }),
    inboxMessages.length > 0 && !secondary
      ? supabase
          .from("inbox_parsed_items")
          .select("message_id, item_date, end_date")
          .in(
            "message_id",
            inboxMessages.map((m) => m.id),
          )
          .eq("status", "pending")
      : Promise.resolve({ data: [] }),
  ]);

  const fareCount = fareRows.length;
  const inboxNeedsTrip =
    inboxMessages.length > 0 && !secondary
      ? messagesNeedingTrip({
          messages: inboxMessages,
          items: itemRows?.data || [],
          trips: tripRows?.data || [],
          todayISO: today,
        }).size
      : 0;

  return {
    access: resolved,
    secondary,
    notices,
    fareCount,
    attention: countNeedingAttention(rows || [], today) + fareCount,
    inboxCount: inboxMessages.length,
    inboxNeedsTrip,
    setup,
    tripCounts: tripMenuCounts(tripRows?.data || [], today),
  };
}
