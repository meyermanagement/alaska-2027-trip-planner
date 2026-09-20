import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { normalizeLocation, LOCATION_TTL, locationBrief, privateImpact, samePlans } = jiti("../lib/tips/location.js");
const { routingFix, journeyOrigin } = jiti("../lib/travel/locationOrigin.js");
const now = Date.parse("2026-09-20T22:00:00Z");
const fix = { source: "device", latitude: 20.8891344, longitude: -156.477239, accuracy: 23, timestamp: now };
test("location is fresh, validated and coarsened before reaching research", () => {
  assert.deepEqual(normalizeLocation(fix, now), { ...fix, latitude: 20.89, longitude: -156.48, accuracy: 1500 });
  for (const patch of [{ latitude: "20" }, { longitude: 181 }, { latitude: -91 }, { accuracy: -1 },
    { accuracy: 10001 }, { timestamp: now - LOCATION_TTL - 1 }, { timestamp: now + 30001 }, { timestamp: null }, { source: "chat" }])
    assert.throws(() => normalizeLocation({ ...fix, ...patch }, now), /unavailable|out of date/);
  assert.equal(normalizeLocation({ ...fix, timestamp: now - LOCATION_TTL }, now).source, "device");
});
test("typed and itinerary fallback cannot masquerade as verified GPS", () => {
  assert.deepEqual(normalizeLocation({ source: "typed", label: "  Kahului Harbor ", latitude: 12 }), { source: "typed", label: "Kahului Harbor" });
  assert.deepEqual(normalizeLocation({ source: "itinerary", label: "secret" }), { source: "itinerary" });
  assert.throws(() => normalizeLocation({ source: "typed", label: "" }));
  assert.throws(() => normalizeLocation({ source: "typed", label: "a".repeat(161) }));
});
test("routing needs actual opt-in, a precise fresh device fix, and only changes the next leg", () => {
  const here = routingFix(fix, true, now);
  assert.equal(here.lat, 20.8891);
  assert.equal(routingFix(fix, false, now), null);
  assert.equal(routingFix({ ...fix, accuracy: 1001 }, true, now), null);
  assert.equal(routingFix({ ...fix, timestamp: now - LOCATION_TTL }, true, now), null);
  assert.equal(routingFix({ ...fix, source: "manual" }, true, now), null);
  const previous = { lat: 20.7, lon: -156.5 };
  const input = { here, isToday: true, itemId: "ferry", nextId: "ferry", previous };
  assert.equal(journeyOrigin(input).point, here);
  assert.equal(journeyOrigin(input).originLabel, "From your current location");
  for (const patch of [{ here: null }, { isToday: false }, { itemId: "dinner" }]) {
    const result = journeyOrigin({ ...input, ...patch });
    assert.equal(result.point, previous); assert.equal(result.fromHere, false);
  }
});
test("day routing independently checks opt-in and keeps personal origins out of URL and cache", () => {
  const route = readFileSync(new URL("../app/api/day/route.js", import.meta.url), "utf8");
  assert.match(route, /preference\?\.enabled/);
  assert.match(route, /optionalFeatureOn\(supabase, user.id, "location"\)/);
  assert.match(route, /accountAge\(supabase, user.id\)/);
  // Production trips has no archived_at column; selecting it breaks every day.
  assert.doesNotMatch(route, /\.select\("[^"]*archived_at/);
  assert.doesNotMatch(route, /params.get\("(lat|lon|src)"\)/);
  assert.match(route, /if \(!origin.fromHere\) legs.set/);
  const ui = readFileSync(new URL("../components/Itinerary.js", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /readStored|params.set\("(lat|lon)"\)/);
  assert.match(ui, /requestId === dayRequest.current/);
});
test("brief excludes profile secrets and persistence excludes the fix", () => {
  const brief = locationBrief({ destination: "Maui", notes: "SECRET" }, [
    { id: "item", title: "Ferry", item_date: "2026-09-20", passport: "SECRET", notes: "SECRET" },
  ], { today: "2026-09-20", through: "2026-09-21" }, "UTC", normalizeLocation(fix, now), new Date(now));
  assert.doesNotMatch(brief, /SECRET|20\.889/);
  const saved = privateImpact({ title: "Alert", latitude: 20.89, user_id: "other", family_id: "household", raw: "SECRET" });
  assert.doesNotMatch(JSON.stringify(saved), /latitude|household|SECRET|other/);
});
test("changed, removed, canceled and completed plans invalidate research", () => {
  const original = [{ id: "item", title: "Ferry", status: "confirmed", is_done: false }];
  assert.equal(samePlans(original, original), true);
  assert.equal(samePlans(original, []), false);
  for (const patch of [{ title: "Bus" }, { status: "cancelled" }, { is_done: true }, { location: "Elsewhere" }])
    assert.equal(samePlans(original, [{ ...original[0], ...patch }]), false);
});
test("route has independent child, consent, tenant, source and completion gates", () => {
  const source = readFileSync(new URL("../app/api/tips/location/route.js", import.meta.url), "utf8");
  assert.match(source, /CHILD_VIEW_COOKIE/);
  assert.ok(source.indexOf("aiAllowed(client") < source.indexOf('client.from("trips")'));
  assert.match(source, /freshWindow/); assert.match(source, /samePlans/);
  assert.match(source, /p_revision: pref.revision/);
  assert.match(source, /\.eq\("user_id", user.id\).eq\("family_id", trip.family_id\).eq\("endpoint", body.endpoint\)/);
  assert.match(source, /optionalFeatureOn\(client, user.id, "notifications"\)/);
  assert.doesNotMatch(source, /from\("pro_tips"\)|pushTripImpacts|console\./);
  assert.match(source, /consentFor: user.id/);
});
test("UI uses explicit opt-in, foreground-only refresh and no stored coordinates", () => {
  const source = readFileSync(new URL("../components/LocationProTips.js", import.meta.url), "utf8");
  assert.match(source, /permission.state !== "granted"/);
  assert.match(source, /document.visibilityState !== "visible"/);
  assert.match(source, /document.visibilityState === "hidden"/);
  assert.match(source, /state.epoch === epoch/);
  assert.match(source, /maximumAge: 0/);
  assert.doesNotMatch(source, /localStorage|sessionStorage|watchPosition/);
  assert.match(source, /Turn location off|Run again|Clear tip|Restore tip/);
  const itinerary = readFileSync(new URL("../components/Itinerary.js", import.meta.url), "utf8");
  assert.doesNotMatch(itinerary, /askQuietly\(/);
});
