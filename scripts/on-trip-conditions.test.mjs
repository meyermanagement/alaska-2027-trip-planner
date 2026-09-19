import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { localDay, onTripWindow, parsePlanImpacts, conditionsBrief } = jiti("../lib/tips/onTrip.js");
const { eligibleImpactSubscriptions, pushTripImpacts } = jiti("../lib/push/tripImpacts.js");
const { resolveGroundingUrls } = jiti("../lib/tips/groundingUrls.js");
const { AGREEMENT_VERSION, PRIVACY_VERSION } = jiti("../lib/beta/agreement.js");
const now = new Date("2026-09-19T15:00:00Z");
const trip = { id: "trip", family_id: "family", status: "planned", start_date: "2026-09-19", end_date: "2026-09-21" };
const items = [{ id: "item", title: "Harbor ferry", item_date: "2026-09-19", status: "confirmed" }];
const window = onTripWindow(trip, "2026-09-19");
const finding = { item_id: "item", kind: "transport", effect: "blocked", affects_plan: true, applies_on: "2026-09-19",
  reported_at: "2026-09-19T14:30:00Z", title: "Ferry service suspended",
  detail: "The harbor ferry operator has suspended this afternoon's sailings.",
  action: "Use the road transfer instead and confirm its departure time.", source_url: "https://example.com/status", evidence: "Sailings suspended today" };
const response = (overrides = {}, fields = {}) => ({ searched: true, sources: [{ title: "Operator", url: finding.source_url }],
  text: JSON.stringify({ impacts: [{ ...finding, ...overrides }] }), ...fields });
test("on-trip scope handles midnight in the traveler's zone, final day and exclusions", () => {
  assert.equal(localDay("America/Chicago", new Date("2026-09-20T01:00Z")), "2026-09-19");
  assert.equal(localDay("bad/zone", now), null);
  assert.deepEqual(window, { today: "2026-09-19", through: "2026-09-20" });
  assert.equal(onTripWindow(trip, "2026-09-21").through, "2026-09-21");
  for (const status of ["draft", "complete", "archived", "cancelled"])
    assert.equal(onTripWindow({ ...trip, status }, "2026-09-19"), null);
  assert.equal(onTripWindow(trip, "2026-09-18"), null);
  assert.equal(onTripWindow(trip, "2026-09-22"), null);
  assert.equal(onTripWindow({ ...trip, end_date: null }, "2026-09-19").through, "2026-09-19");
});
test("only grounded, current, relevant and actionable findings survive", () => {
  assert.equal(parsePlanImpacts(response(), items, trip, window, now).length, 1);
  const invalid = [
    { item_id: "other-household-item" }, { source_url: "https://uncited.example.com" },
    { source_url: "javascript:alert(1)" }, { affects_plan: false }, { kind: "packing" },
    { reported_at: "2026-09-17T01:00Z" }, { reported_at: "2027-01-01T01:00Z" },
    { applies_on: "2026-09-21" }, { evidence: "" }, { action: "" }, { effect: "delay", delay_minutes: 5 },
  ];
  for (const value of invalid) assert.equal(parsePlanImpacts(response(value), items, trip, window, now).length, 0, JSON.stringify(value));
  assert.deepEqual(parsePlanImpacts(response({}, { searched: false }), items, trip, window, now), []);
  assert.throws(() => parsePlanImpacts(response({}, { text: "broken" }), items, trip, window, now));
  assert.equal(parsePlanImpacts(response(), [{ ...items[0], status: "cancelled" }], trip, window, now).length, 0);
});
test("rewording deduplicates while material escalation gets a new key", () => {
  const first = parsePlanImpacts(response(), items, trip, window, now)[0];
  assert.equal(parsePlanImpacts(response({ title: "Today's ferry is canceled" }), items, trip, window, now)[0].fingerprint, first.fingerprint);
  const delay = n => parsePlanImpacts(response({ effect: "delay", delay_minutes: n }), items, trip, window, now)[0].fingerprint;
  assert.equal(delay(30), delay(40)); assert.notEqual(delay(30), delay(120));
});
test("research sends only operational itinerary fields, never private notes or confirmations", () => {
  const brief = conditionsBrief(trip, [{ ...items[0], notes: "SECRET", confirmation: "SECRET", passport: "SECRET" }], window, "UTC", now);
  assert.doesNotMatch(brief, /SECRET/);
});
const consent = user_id => ({ user_id, agreement_version: AGREEMENT_VERSION, privacy_version: PRIVACY_VERSION, age_confirmed: true, data_acknowledged: true, features: { notifications: true } });
test("notifications recheck membership, roster, age and current opt-in", () => {
  const ids = ["primary", "adult", "uninvited", "child", "withdrawn", "stranger"];
  const subs = ids.map(id => ({ id, user_id: id, enabled: true }));
  const members = ids.filter(id => id !== "stranger").map(user_id => ({ user_id }));
  const travelers = ids.map(id => ({ id, user_id: id, is_person: true, access_level: id === "primary" ? "primary" : "secondary",
    date_of_birth: id === "child" ? "2020-01-01" : "1980-01-01" }));
  const consents = ids.map(consent).map(c => c.user_id === "withdrawn" ? { ...c, withdrawn_at: "2026-01-01" } : c);
  const roster = ["adult", "child", "stranger", "withdrawn"].map(traveler_id => ({ traveler_id }));
  assert.deepEqual(eligibleImpactSubscriptions(subs, members, travelers, roster, consents).map(r => r.id), ["primary", "adult"]);
});
test("grounding redirects resolve only the fixed provider host and do not fetch model destinations", async () => {
  const calls = [];
  const fetcher = async url => { calls.push(url); return new Response(null, { status: 302, headers: { location: finding.source_url } }); };
  const sources = await resolveGroundingUrls([{ url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/test", title: "Operator" },
    { url: "https://evil.example/private" }], fetcher);
  assert.equal(calls.length, 1);
  assert.equal(sources[0].url, finding.source_url);
  assert.equal(parsePlanImpacts(response({}, { sources }), items, trip, window, now).length, 1);
});
test("opening UI has no daily cache, prevents overlapping calls and checks again on foreground return", () => {
  const source = readFileSync(new URL("../components/OnTripTips.js", import.meta.url), "utf8");
  assert.match(source, /visibilitychange/); assert.match(source, /running.current/);
  assert.doesNotMatch(source, /lookedToday|localStorage|lastLookedAt/);
  const route = readFileSync(new URL("../app/api/tips/on-trip/route.js", import.meta.url), "utf8");
  assert.ok(route.indexOf("aiAllowed(client") < route.indexOf('admin.rpc("claim_trip_conditions"'));
  assert.ok(route.indexOf('admin.rpc("claim_trip_conditions"') < route.indexOf("await generate("));
  assert.match(route, /existing.status !== "active"/);
  assert.match(route, /unchangedItems.length !== items.length/);
  assert.ok(route.indexOf("const currentWindow") < route.indexOf('client.from("pro_tips")'));
  assert.match(route, /finally/);
});
test("push delivery claims once, retries known failures, and sends a private deep link", async () => {
  const claims = new Set(); let sent = 0, fail = true;
  const data = {
    push_subscriptions: [{ id: "sub", user_id: "primary", enabled: true }],
    family_members: [{ user_id: "primary" }], travelers: [], trip_travelers: [],
    beta_consents: [consent("primary")],
  };
  const supabase = { from(table) {
    let action = "read", payload, filters = {};
    const q = {
      select() { return q; }, eq(k, v) { filters[k] = v; return q; }, in() { return q; },
      insert(p) { action = "insert"; payload = p; return q; },
      update() { action = "update"; return q; }, delete() { action = "delete"; return q; },
      then(resolve) {
        if (table !== "trip_impact_pushes") return Promise.resolve({ data: data[table] || [] }).then(resolve);
        const key = `${payload?.tip_id || filters.tip_id}:${payload?.subscription_id || filters.subscription_id}`;
        let error = null;
        if (action === "insert") { if (claims.has(key)) error = { code: "23505" }; else claims.add(key); }
        if (action === "delete") claims.delete(key);
        return Promise.resolve({ error }).then(resolve);
      },
    }; return q;
  } };
  const deliver = async ({ payload }) => {
    sent++; assert.match(payload.url, /^\/trips\/trip\?/); assert.doesNotMatch(payload.body, /ferry|Harbor/);
    return { ok: !fail };
  };
  const input = { supabase, trip, tips: [{ id: "tip", urgency: "now" }], deliver, configured: true };
  assert.equal((await pushTripImpacts(input)).failed, 1);
  fail = false; assert.equal((await pushTripImpacts(input)).delivered, 1);
  assert.equal((await pushTripImpacts(input)).delivered, 0);
  assert.equal(sent, 2);
});
