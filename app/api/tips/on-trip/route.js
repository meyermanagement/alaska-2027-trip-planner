import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAccess } from "@/lib/travelers/access";
import { aiAllowed } from "@/lib/beta/consent";
import { generate } from "@/lib/agent/llm";
import { localDay, onTripWindow, conditionsBrief, ON_TRIP_SYSTEM, parsePlanImpacts } from "@/lib/tips/onTrip";
import { pushTripImpacts } from "@/lib/push/tripImpacts";
import { resolveGroundingUrls } from "@/lib/tips/groundingUrls";

export const runtime = "nodejs";
export const maxDuration = 120;
const reply = (data, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request) {
  const started = Date.now();
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return reply({ error: "Sign in first." }, 401);
  let body;
  try { body = await request.json(); } catch { return reply({ error: "Invalid request." }, 400); }
  if (!/^[0-9a-f-]{36}$/i.test(body?.tripId || "") || typeof body.timeZone !== "string")
    return reply({ error: "Send the trip and your time zone." }, 400);
  const today = localDay(body.timeZone);
  if (!today) return reply({ error: "Your time zone could not be read." }, 400);
  const access = await resolveAccess(client, user);
  // Do not widen secondary writes or inherit a parent's AI permission.
  if (!access?.can.editTrips || !await aiAllowed(client, user.id))
    return reply({ error: "A primary traveler with Ask Aly enabled needs to run this check." }, 403);
  const { data: trip, error: tripError } = await client.from("trips").select("*")
    .eq("id", body.tripId).eq("family_id", access.familyId).maybeSingle();
  if (tripError) return reply({ error: "The trip could not be read." }, 503);
  if (!trip) return reply({ error: "Trip not found." }, 404);
  const window = onTripWindow(trip, today);
  if (!window) return reply({ error: "This check is for a trip in progress." }, 409);
  const admin = createAdminClient();
  if (!admin) return reply({ error: "Conditions checks are not configured yet." }, 503);
  const token = randomUUID();
  const { data: claimed, error: lockError } = await admin.rpc("claim_trip_conditions", { p_trip: trip.id, p_token: token });
  if (lockError) return reply({ error: "Conditions checks are not available yet." }, 503);
  if (!claimed) return reply({ error: "This trip is already being checked. Try again when that check finishes." }, 409);
  try {
    const { data: rows, error } = await client.from("itinerary_items")
      .select("id,item_date,start_time,end_time,title,category,location,status")
      .eq("trip_id", trip.id).gte("item_date", window.today).lte("item_date", window.through)
      .neq("status", "cancelled").order("item_date").order("start_time");
    if (error) throw new Error("Today's plans could not be read.");
    const nowHM = new Intl.DateTimeFormat("en-GB", { timeZone: body.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    const items = (rows || []).filter(i => !(i.item_date === today && i.end_time && String(i.end_time).slice(0, 5) < nowHM));
    if (!items.length) return reply({ found: 0, note: "No remaining plans today or tomorrow to check." });
    const result = await generate({
      feature: "tips.on-trip", system: ON_TRIP_SYSTEM,
      messages: [{ role: "user", text: conditionsBrief(trip, items, window, body.timeZone) }],
      grounded: true, temperature: 0.1, thinking: "low", deadline: started + 85000,
    });
    if (!result.searched) return reply({ error: "Current sources could not be checked. This is not an all-clear; please try again." }, 502);
    result.sources = await resolveGroundingUrls(result.sources);
    // Research can take a while. Never attach its answer to a moved, cancelled
    // or edited plan, or to a trip that ended while the check was running.
    const [{ data: currentTrip, error: currentTripError }, { data: currentItems, error: currentItemsError }] = await Promise.all([
      client.from("trips").select("*").eq("id", trip.id).eq("family_id", access.familyId).maybeSingle(),
      client.from("itinerary_items").select("id,item_date,start_time,end_time,title,category,location,status")
        .eq("trip_id", trip.id).in("id", items.map(i => i.id)),
    ]);
    if (currentTripError || currentItemsError) throw new Error("The latest plans could not be checked.");
    const currentWindow = onTripWindow(currentTrip, localDay(body.timeZone));
    if (!currentTrip || !currentWindow || currentTrip.destination !== trip.destination ||
        currentWindow.today !== window.today || currentWindow.through !== window.through) {
      return reply({ error: "The trip or date changed during this check. Open it again to check the latest plans." }, 409);
    }
    const fields = ["item_date", "start_time", "end_time", "title", "category", "location", "status"];
    const unchangedItems = items.filter(original => (currentItems || []).some(current =>
      current.id === original.id && fields.every(field => current[field] === original[field])));
    if (unchangedItems.length !== items.length) {
      return reply({ error: "The itinerary changed during this check. Please check the updated plans again." }, 409);
    }
    const impacts = parsePlanImpacts(result, unchangedItems, currentTrip, currentWindow);
    const saved = [];
    for (const impact of impacts) {
      // Read/update with the caller's RLS session, never the elevated client.
      const { data: existing, error: readError } = await client.from("pro_tips")
        .select("id,status,urgency").eq("trip_id", trip.id).eq("fingerprint", impact.fingerprint).maybeSingle();
      if (readError) throw new Error("Existing alerts could not be checked.");
      if (existing && existing.status !== "active") continue;
      const operation = existing
        ? client.from("pro_tips").update(impact).eq("id", existing.id).eq("status", "active")
        : client.from("pro_tips").insert(impact);
      const { data: tip, error: writeError } = await operation.select("id,urgency").maybeSingle();
      if (writeError) throw new Error("The conditions were checked, but an alert could not be saved.");
      if (tip) saved.push(tip);
    }
    let notification;
    try { notification = await pushTripImpacts({ supabase: admin, trip, tips: saved }); }
    catch { notification = { failed: true }; }
    return reply({
      found: saved.length, checkedAt: new Date().toISOString(), notification,
      note: saved.length
        ? `${saved.length} current ${saved.length === 1 ? "impact" : "impacts"} saved beside the affected plans.${notification.failed ? " Push delivery did not finish." : ""}`
        : "No new verified impact found for today or tomorrow. This is not an all-clear.",
    });
  } catch (error) {
    console.error("[tips/on-trip]", error?.message);
    return reply({ error: "The conditions check did not finish. Please try again; this is not an all-clear." }, 502);
  } finally {
    await admin.from("trip_conditions_locks").delete().eq("trip_id", trip.id).eq("token", token);
  }
}
