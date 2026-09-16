// The morning list, on the lock screen as well as in the inbox.
//
// An email is the record and the phone is the interruption. A booking window
// that opens at 6am is already half gone by the time somebody sits down with
// their inbox, so the things with a date on them ring the phone too. This is
// deliberately both channels rather than one or the other -- the watch picks a
// channel because a fare warning is news, and news said twice is noise, whereas
// this is a checklist somebody agreed to be nagged about.
//
// What does not push, and why:
//   - Anything overdue. It is in the email every morning until it is ticked off,
//     and a notification that repeats daily forever is the one people turn off,
//     taking the useful ones with it.
//   - Anything a stage guessed at rather than a date. "Due about now" is not
//     worth waking a phone for.
// So: due tomorrow, due today, or asking to be booked now.

import { sendPush } from "@/lib/push/send";
import { consentIsCurrent } from "@/lib/beta/consent";

/** The items worth a notification, out of everything in somebody's morning email. */
export function worthPushing(items) {
  return (items || []).filter(
    (item) => !item.late && (item.soon || item.exact || item.now),
  );
}

/**
 * What one task says on a lock screen.
 *
 * The title is the task, because that is the part somebody reads without
 * unlocking anything. When it lands is the first thing in the body, and the trip
 * follows it, since a household with three trips open needs to know which one.
 */
export function reminderPush({ item, siteUrl }) {
  const when = item.soon ? "Tomorrow" : item.now ? "Book now" : "Today";
  const body = [when, item.tripName || null, item.detail || null]
    .filter(Boolean)
    .join(" · ");
  const url = item.tripRef
    ? `${siteUrl}/trips/${item.tripRef}?tab=tasks`
    : `${siteUrl}/reminders`;
  return {
    title: item.title,
    body,
    url,
    // One tag per task, so tomorrow's heads-up is replaced by the morning-of
    // notice rather than sitting underneath it as a second copy of itself.
    tag: `task-${item.id}`,
    urgent: item.now === true,
  };
}

/**
 * Push one person's due work to that person's own browsers.
 *
 * Their own, not the household's: the email goes to the name on the task, and a
 * notification that went wider would tell a partner about work that is not
 * theirs. The subscription's owner is checked against their consent here rather
 * than trusted to the moment they signed up, because a row outlives the switch
 * that created it.
 *
 * @param {object} input
 * @param {import("@supabase/supabase-js").SupabaseClient} input.supabase
 * @param {string} input.travelerId
 * @param {string} input.siteUrl
 * @param {Array} input.items the same items the email was built from
 * @returns {Promise<{tried: number, delivered: number, browsers: number}>}
 */
export async function pushRemindersTo({
  supabase,
  travelerId,
  siteUrl,
  items,
}) {
  const worth = worthPushing(items);
  const outcome = { tried: worth.length, delivered: 0, browsers: 0 };
  if (!worth.length) return outcome;

  const { data: subRows } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, user_id")
    .eq("traveler_id", travelerId)
    .eq("enabled", true);

  const subs = await stillAllowed(supabase, subRows || []);
  outcome.browsers = subs.length;
  if (!subs.length) return outcome;

  for (const item of worth) {
    const payload = reminderPush({ item, siteUrl });
    let landed = false;
    for (const sub of subs) {
      const result = await sendPush({ subscription: sub, payload });
      if (result.ok) {
        landed = true;
        await supabase
          .from("push_subscriptions")
          .update({
            last_sent_at: new Date().toISOString(),
            failures: 0,
            last_error: null,
          })
          .eq("id", sub.id);
      } else if (result.gone) {
        // The push service says this browser is gone. Deleting the row is the
        // only correct answer; retrying is what turns one stale browser into a
        // permanent column of failures.
        await supabase.from("push_subscriptions").delete().eq("id", sub.id);
      } else {
        await supabase
          .from("push_subscriptions")
          .update({ last_error: result.error || null })
          .eq("id", sub.id);
      }
    }
    if (landed) outcome.delivered += 1;
  }

  return outcome;
}

/**
 * Subscriptions whose owner still allows being interrupted.
 *
 * A row with no `user_id` -- an older subscription from before the column
 * existed -- is dropped rather than assumed. Guessing yes here is how somebody
 * who turned notifications off gets one anyway.
 */
async function stillAllowed(supabase, subs) {
  if (!subs.length) return [];
  const userIds = [...new Set(subs.map((s) => s.user_id).filter(Boolean))];
  if (!userIds.length) return [];

  const { data: rows } = await supabase
    .from("beta_consents")
    .select(
      "user_id, agreement_version, privacy_version, age_confirmed, data_acknowledged, features, withdrawn_at",
    )
    .in("user_id", userIds);

  const on = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const features =
      row.features && typeof row.features === "object" ? row.features : {};
    if (consentIsCurrent(row) && features.notifications === true) {
      on.add(row.user_id);
    }
  }
  return subs.filter((s) => s.user_id && on.has(s.user_id));
}
