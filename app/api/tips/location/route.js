import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiAllowed, optionalFeatureOn } from "@/lib/beta/consent";
import { CHILD_VIEW_COOKIE } from "@/lib/childView/constants";
import { generate } from "@/lib/agent/llm";
import { localDay, onTripWindow, parsePlanImpacts } from "@/lib/tips/onTrip";
import { resolveGroundingUrls } from "@/lib/tips/groundingUrls";
import { LOCATION_NOTICE, UUID, normalizeLocation, locationBrief, LOCATION_SYSTEM, privateImpact, samePlans } from "@/lib/tips/location";
import { sendPush, pushConfigured } from "@/lib/push/send";

export const runtime = "nodejs";
export const maxDuration = 120;
const reply = (data, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const itemFields = "id,item_date,end_date,start_time,title,category,location,status,is_done";
const fail = (message, status = 503) => Object.assign(new Error(message), { status });

async function context(request, tripId) {
  if (request.cookies?.get(CHILD_VIEW_COOKIE)) throw fail("A parent must return to their own account first.", 403);
  if (!UUID.test(tripId || "")) throw fail("Choose a trip.", 400);
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) throw fail("Sign in first.", 401);
  if (!await aiAllowed(client, user.id)) throw fail("This feature requires an adult account with Ask Aly enabled.", 403);
  // RLS is the authoritative trip/roster/household boundary. Never infer a family
  // from a global first row, and never allow secondary travelers to see drafts.
  const { data: trip, error } = await client.from("trips").select("*").eq("id", tripId).maybeSingle();
  if (error) throw fail("Your trip access could not be checked.");
  if (!trip) throw fail("Trip not found.", 404);
  const admin = createAdminClient();
  if (!admin) throw fail("Location Pro tips are not available yet.");
  return { client, admin, user, trip };
}

async function snapshot({ client, user, trip }) {
  const [prefs, tips] = await Promise.all([
    client.from("location_tip_preferences").select("enabled,push_enabled,revision,checked_at,notice_version")
      .eq("user_id", user.id).eq("trip_id", trip.id).maybeSingle(),
    client.from("location_tips").select("id,content,status,checked_at")
      .eq("user_id", user.id).eq("trip_id", trip.id).order("checked_at", { ascending: false }).limit(100),
  ]);
  if (prefs.error || tips.error) throw fail("Location Pro tips are not available yet. Your usual trip tips still work.");
  return { preference: prefs.data, tips: tips.data || [] };
}

async function itemsFor(client, trip, window) {
  const { data, error } = await client.from("itinerary_items").select(itemFields).eq("trip_id", trip.id)
    .lte("item_date", window.through).or(`item_date.gte.${window.today},end_date.gte.${window.today}`)
    .neq("status", "cancelled").order("item_date").order("start_time");
  if (error) throw fail("Today's plans could not be read.");
  return (data || []).filter(i => !i.is_done);
}

export async function GET(request) {
  try {
    const ctx = await context(request, new URL(request.url).searchParams.get("tripId"));
    return reply({ ...await snapshot(ctx), locationAllowed: await optionalFeatureOn(ctx.client, ctx.user.id, "location") });
  } catch (e) { return reply({ error: e.message }, e.status || 503); }
}

export async function POST(request) {
  const started = Date.now();
  let ctx, token;
  try {
    // Reject cross-site cookie-authenticated writes; same-origin browser fetches
    // send Origin, while server harnesses may omit it.
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
      throw fail("Use this action from Alyeska.", 403);
    let body;
    try { body = await request.json(); } catch { throw fail("Invalid request.", 400); }
    ctx = await context(request, body?.tripId);
    const { client, admin, user, trip } = ctx;
    const state = await snapshot(ctx);
    if (body.action === "preference") {
      if (typeof body.enabled !== "boolean" || typeof body.pushEnabled !== "boolean")
        throw fail("Choose your location and notification settings.", 400);
      if (body.enabled && !await optionalFeatureOn(client, user.id, "location"))
        throw fail("Enable device location in your privacy choices first.", 403);
      const { error } = await admin.from("location_tip_preferences").upsert({
        user_id: user.id, trip_id: trip.id, enabled: body.enabled, push_enabled: body.pushEnabled,
        notice_version: LOCATION_NOTICE, revision: randomUUID(), token: null, locked_until: null,
      }, { onConflict: "user_id,trip_id" });
      if (error) throw fail("Your preference could not be saved.");
      return reply(await snapshot(ctx));
    }
    if (body.action === "tip") {
      if (!UUID.test(body.tipId || "") || !["active", "dismissed"].includes(body.status))
        throw fail("Choose a tip to clear or restore.", 400);
      const { data, error } = await admin.from("location_tips").update({ status: body.status })
        .eq("id", body.tipId).eq("user_id", user.id).eq("trip_id", trip.id).select("id").maybeSingle();
      if (error || !data) throw fail("The tip could not be updated.");
      return reply(await snapshot(ctx));
    }
    const today = localDay(body.timeZone);
    const window = onTripWindow(trip, today);
    if (!window) throw fail("Location checks are only available during this trip.", 409);
    if (body.action === "notify") {
      // The visible client never requests a duplicate push. If a foreground
      // check finishes after the tab is hidden, it may request ONE generic push
      // to this device only. No household subscription sweep.
      if (!state.preference?.push_enabled || !pushConfigured() ||
          !await optionalFeatureOn(client, user.id, "notifications")) return reply({ sent: false });
      if (!UUID.test(body.tipId || "") || typeof body.endpoint !== "string") throw fail("Invalid notification.", 400);
      const { data: tip } = await client.from("location_tips").select("id,content,status,checked_at")
        .eq("id", body.tipId).eq("user_id", user.id).eq("trip_id", trip.id).maybeSingle();
      if (!tip || tip.status !== "active" || tip.content.urgency !== "now" ||
          Date.now() - Date.parse(tip.checked_at) > 5 * 60000) return reply({ sent: false });
      const { data: sub, error } = await admin.from("push_subscriptions").select("*")
        .eq("user_id", user.id).eq("family_id", trip.family_id).eq("endpoint", body.endpoint).eq("enabled", true).maybeSingle();
      if (error || !sub) return reply({ sent: false });
      const { error: claimError } = await admin.from("location_tip_pushes").insert({ tip_id: tip.id, subscription_id: sub.id });
      if (claimError) {
        if (claimError.code === "23505") return reply({ sent: false, duplicate: true });
        throw fail("The alert could not be queued.");
      }
      const result = await sendPush({ subscription: sub, ttl: 900, payload: {
        title: "A change may affect your plans", body: "Open Alyeska to review a current Pro tip.",
        url: `/trips/${trip.id}?tab=itinerary#location-tip-${tip.id}`, tag: `location-tip-${tip.id}`,
      } });
      if (!result.ok) await admin.from("location_tip_pushes").delete().eq("tip_id", tip.id).eq("subscription_id", sub.id);
      if (result.gone) await admin.from("push_subscriptions").delete().eq("id", sub.id).eq("user_id", user.id);
      return reply({ sent: result.ok });
    }
    if (body.action !== "check") throw fail("Unknown action.", 400);
    let place;
    try { place = normalizeLocation(body.place); } catch (e) { throw fail(e.message, 400); }
    const pref = state.preference;
    if (!pref || pref.notice_version !== LOCATION_NOTICE) throw fail("Review the location explanation before checking.", 403);
    if (place.source === "device" && (!pref.enabled || !await optionalFeatureOn(client, user.id, "location")))
      throw fail("Location sharing is off.", 403);
    token = randomUUID();
    const { data: claimed, error: claimError } = await admin.rpc("claim_location_tips", {
      p_user: user.id, p_trip: trip.id, p_revision: pref.revision, p_token: token,
      p_auto: body.automatic === true, p_device: place.source === "device",
    });
    if (claimError) throw fail("Location checks are not available yet.");
    if (!claimed) return reply({ ...state, skipped: true, note: "Already checked recently or a check is still running." });
    const items = await itemsFor(client, trip, window);
    let impacts = [];
    if (items.length) {
      const result = await generate({
        feature: "tips.location", consentFor: user.id, system: LOCATION_SYSTEM,
        messages: [{ role: "user", text: locationBrief(trip, items, window, body.timeZone, place) }],
        grounded: true, temperature: 0.1, thinking: "low", deadline: started + 85000,
      });
      if (!result.searched) throw fail("Current sources could not be checked. This is not an all-clear.", 502);
      result.sources = await resolveGroundingUrls(result.sources);
      impacts = parsePlanImpacts(result, items, trip, window);
    }
    // Recheck permission, access, itinerary, date and preference after slow research.
    const fresh = await context(request, trip.id);
    const freshWindow = onTripWindow(fresh.trip, localDay(body.timeZone));
    if (!freshWindow || freshWindow.today !== window.today || freshWindow.through !== window.through ||
        fresh.trip.destination !== trip.destination || !samePlans(items, await itemsFor(client, fresh.trip, freshWindow)))
      throw fail("Your plans changed during the check. Run again for the latest plans.", 409);
    if (place.source === "device" && !await optionalFeatureOn(client, user.id, "location"))
      throw fail("Location permission was turned off.", 403);
    const { data: finished, error: saveError } = await admin.rpc("finish_location_tips", {
      p_user: user.id, p_trip: trip.id, p_revision: pref.revision, p_token: token,
      p_tips: impacts.map(i => ({ fingerprint: i.fingerprint, content: privateImpact(i) })),
    });
    if (saveError) throw fail("The check finished, but its tips could not be saved.");
    if (!finished) throw fail("Your location settings changed. The result was not saved.", 409);
    return reply({ ...await snapshot(ctx), found: impacts.length,
      note: !items.length ? "No remaining plans today or tomorrow to check."
        : impacts.length ? "Current impacts saved below. Your itinerary has not been changed."
          : "No new verified impact found. This is not an all-clear." });
  } catch (e) {
    // Never log request bodies, coordinates, provider errors or model output.
    return reply({ error: e.status ? e.message : "The check did not finish. Please try again; this is not an all-clear." }, e.status || 502);
  } finally {
    if (ctx && token) await ctx.admin.from("location_tip_preferences").update({ token: null, locked_until: null })
      .eq("user_id", ctx.user.id).eq("trip_id", ctx.trip.id).eq("token", token);
  }
}
