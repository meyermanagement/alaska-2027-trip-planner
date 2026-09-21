import { sendPush, pushConfigured } from "@/lib/push/send";
import { consentIsCurrent } from "@/lib/beta/consent";
import {
  awardOnewayPoints,
  awardPointsPhrase,
  cashPhrase,
  cheapestAwardOption,
} from "@/lib/deals/award";
import { fareGroupCabinLabel } from "@/lib/deals/cabin";

// What the alert has to earn. A lock screen gets a glance, and "5 new fares came
// in" spends that glance without answering the only question being asked: is this
// worth opening now. So the notification names the place, the cabin, the airports
// it leaves from and the cheapest seat in it -- all of it already known at the
// moment the rows are saved, none of it requiring the app to be opened to see.
//
// Everything here degrades to silence rather than to a wrong claim. A missing
// cabin, an unnamed destination or an unpriced fare drops its own phrase and
// leaves the others standing.

const listOf = (values, limit = 2) => {
  const kept = values.slice(0, limit);
  const rest = values.length - kept.length;
  const joined = kept.length > 1
    ? `${kept.slice(0, -1).join(", ")} and ${kept[kept.length - 1]}`
    : kept[0] || "";
  return rest > 0 ? `${kept.join(", ")} and ${rest} more` : joined;
};

function destinationNames(deals) {
  return [...new Set(deals
    .map((deal) => String(deal?.destination || deal?.destination_code || "").trim())
    .filter(Boolean))];
}

function originCodes(deals) {
  return [...new Set(deals.map((deal) => String(deal?.origin || "").trim()).filter(Boolean))];
}

/** The cheapest seat across every fare in the email, points preferred over cash. */
export function cheapestFarePhrase(deals) {
  const options = deals.flatMap((deal) => deal?.award_pricing?.options || []);
  if (options.length) {
    const best = options.reduce((a, b) => (awardOnewayPoints(a) <= awardOnewayPoints(b) ? a : b));
    const phrase = awardPointsPhrase(cheapestAwardOption([best]));
    return phrase ? `from ${phrase}` : "";
  }
  const priced = deals.filter((deal) => deal?.price != null && Number.isFinite(Number(deal.price)));
  if (!priced.length) return "";
  const best = priced.reduce((a, b) => (Number(a.price) <= Number(b.price) ? a : b));
  return `from ${cashPhrase(best.price, best.price_basis)}`;
}

export function fareArrivalPayload({ messageId, count, deals = [] }) {
  const rows = Array.isArray(deals) ? deals.filter(Boolean) : [];
  const places = destinationNames(rows);
  const place = places.length === 1 ? places[0] : "";
  const title = count === 1
    ? `A new ${place ? `${place} ` : ""}fare came in`
    : `${count} new ${place ? `${place} ` : ""}fares came in`;
  const cabin = rows.length ? fareGroupCabinLabel(rows) : "";
  const origins = originCodes(rows);
  const parts = [
    cabin && cabin !== "Cabin not stated" ? cabin : "",
    places.length > 1 ? listOf(places) : "",
    origins.length ? `out of ${listOf(origins, 3)}` : "",
    cheapestFarePhrase(rows),
  ].filter(Boolean);
  return {
    title,
    body: parts.length ? parts.join(" \u00b7 ") : "Your forwarded fares are ready to review.",
    url: "/someday#fares",
    tag: `fare-arrival-${messageId}`,
  };
}

// Membership and consent are checked at delivery, not just at subscription.
export function allowedFareSubscriptions(subscriptions, members, travelers, consents) {
  const memberIds = new Set(members.map((row) => row.user_id));
  const secondaryIds = new Set(travelers
    .filter((row) => row.is_person && row.access_level === "secondary")
    .map((row) => row.user_id));
  const consenting = new Set(consents
    .filter((row) => consentIsCurrent(row) && row.features?.notifications === true)
    .map((row) => row.user_id));
  return subscriptions.filter((row) => row.enabled && memberIds.has(row.user_id)
    && !secondaryIds.has(row.user_id) && consenting.has(row.user_id));
}

// One source email produces one alert per browser, even if two import workers
// finish together. The database claim is authoritative; the browser tag also
// replaces rather than stacks an alert if the push service repeats delivery.
export async function pushFareArrival({
  supabase, familyId, messageId, count, deals = [],
  deliver = sendPush, configured = pushConfigured(),
}) {
  if (!configured || !familyId || !messageId || !count) return { delivered: 0 };
  const results = await Promise.all([
    supabase.from("push_subscriptions").select("id, user_id, enabled, endpoint, p256dh, auth")
      .eq("family_id", familyId).eq("enabled", true),
    supabase.from("family_members").select("user_id").eq("family_id", familyId),
    supabase.from("travelers").select("user_id, access_level, is_person").eq("family_id", familyId),
  ]);
  if (results.some((result) => result.error)) throw new Error("Fare notification permissions could not be checked.");
  const [subscriptions, members, travelers] = results.map((result) => result.data || []);
  const ids = [...new Set(subscriptions.map((row) => row.user_id).filter(Boolean))];
  if (!ids.length) return { delivered: 0 };
  const { data: consents, error } = await supabase.from("beta_consents")
    .select("user_id, agreement_version, privacy_version, age_confirmed, data_acknowledged, features, withdrawn_at")
    .in("user_id", ids);
  if (error) throw new Error("Fare notification consent could not be checked.");
  const eligible = allowedFareSubscriptions(subscriptions, members, travelers, consents || []);
  let delivered = 0;
  for (const subscription of eligible) {
    const { error: claimError } = await supabase.from("fare_arrival_pushes")
      .insert({ message_id: messageId, subscription_id: subscription.id });
    if (claimError?.code === "23505") continue;
    if (claimError) throw new Error("Fare notification could not be claimed.");
    let result;
    try {
      result = await deliver({ subscription, payload: fareArrivalPayload({ messageId, count, deals }) });
    } catch {
      result = { ok: false, error: "Fare notification delivery failed." };
    }
    if (result.ok) {
      delivered += 1;
      await supabase.from("fare_arrival_pushes").update({ delivered_at: new Date().toISOString() })
        .eq("message_id", messageId).eq("subscription_id", subscription.id);
      await supabase.from("push_subscriptions")
        .update({ last_sent_at: new Date().toISOString(), failures: 0, last_error: null })
        .eq("id", subscription.id);
    } else {
      // Release a failed claim so a later delivery attempt can retry safely.
      await supabase.from("fare_arrival_pushes").delete()
        .eq("message_id", messageId).eq("subscription_id", subscription.id);
      if (result.gone) await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
      else await supabase.from("push_subscriptions").update({ last_error: result.error || "Fare notification failed." })
        .eq("id", subscription.id);
    }
  }
  return { delivered };
}
