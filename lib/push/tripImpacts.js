import { sendPush, pushConfigured } from "@/lib/push/send";
import { consentIsCurrent } from "@/lib/beta/consent";
import { isMinorTraveler } from "@/lib/beta/accountAge";

export function eligibleImpactSubscriptions(subs, members, travelers, roster, consents) {
  const memberIds = new Set(members.map(r => r.user_id));
  const onTrip = new Set(roster.map(r => r.traveler_id));
  const accepted = new Set(consents.filter(c => consentIsCurrent(c) &&
    c.features?.notifications === true).map(c => c.user_id));
  return subs.filter(sub => {
    const seats = travelers.filter(t => t.user_id === sub.user_id && t.is_person);
    return sub.enabled && memberIds.has(sub.user_id) && accepted.has(sub.user_id) &&
      !seats.some(t => isMinorTraveler(t)) &&
      (!seats.some(t => t.access_level === "secondary") ||
        seats.some(t => t.access_level === "secondary" && onTrip.has(t.id)));
  });
}

export async function pushTripImpacts({ supabase, trip, tips, deliver = sendPush, configured = pushConfigured() }) {
  if (!tips.length || !configured) return { delivered: 0, available: configured };
  const results = await Promise.all([
    supabase.from("push_subscriptions").select("id,user_id,enabled,endpoint,p256dh,auth")
      .eq("family_id", trip.family_id).eq("enabled", true),
    supabase.from("family_members").select("user_id").eq("family_id", trip.family_id),
    supabase.from("travelers").select("id,user_id,is_person,access_level,date_of_birth").eq("family_id", trip.family_id),
    supabase.from("trip_travelers").select("traveler_id").eq("trip_id", trip.id),
  ]);
  if (results.some(r => r.error)) throw new Error("Notification permissions could not be checked.");
  const [subs, members, travelers, roster] = results.map(r => r.data || []);
  if (!subs.length) return { delivered: 0, available: true };
  const { data: consents, error } = await supabase.from("beta_consents").select("*")
    .in("user_id", [...new Set(subs.map(s => s.user_id).filter(Boolean))]);
  if (error) throw new Error("Notification consent could not be checked.");
  const eligible = eligibleImpactSubscriptions(subs, members, travelers, roster, consents || []);
  let delivered = 0, failed = 0;
  for (const tip of tips) for (const subscription of eligible) {
    // Claim before sending. A unique key is shared across users, processes and opens.
    const { error: claim } = await supabase.from("trip_impact_pushes")
      .insert({ tip_id: tip.id, subscription_id: subscription.id });
    if (claim?.code === "23505") continue;
    if (claim) throw new Error("Notification could not be recorded.");
    let result;
    try {
      result = await deliver({ subscription, payload: {
        title: "A change may affect your plans",
        body: "Aly found a current disruption. Open the trip to review the impact and suggested action.",
        url: `/trips/${trip.id}?tab=itinerary`,
        tag: `trip-impact-${tip.id}`, urgent: tip.urgency === "now",
      } });
    } catch { result = { ok: false }; }
    if (result.ok) {
      delivered++;
      await supabase.from("trip_impact_pushes").update({ delivered_at: new Date().toISOString() })
        .eq("tip_id", tip.id).eq("subscription_id", subscription.id);
    } else {
      failed++;
      // Definite failures can retry next open. A crash after provider acceptance
      // leaves its claim in place to favor no duplicate over at-least-once delivery.
      await supabase.from("trip_impact_pushes").delete()
        .eq("tip_id", tip.id).eq("subscription_id", subscription.id);
      if (result.gone) await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
    }
  }
  return { delivered, failed, available: true };
}
