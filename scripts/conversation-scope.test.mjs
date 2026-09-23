import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("..", import.meta.url)) },
});
const {
  readConversationScope,
  scopeToConversation,
  tripForPanel,
  askTripId,
} = jiti("../lib/agent/conversationScope.js");
const { ensureConversation } = jiti("../lib/agent/thread.js");

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const DISNEY = "fc7c716e-0000-4000-8000-000000000001";
const ALASKA = "a1a5ca00-0000-4000-8000-000000000002";
const ATLANTA_THREAD = "b71a61ee-0000-4000-8000-000000000003";

test("the incident: an Atlanta planning thread opened over the Disney page loses Disney", () => {
  const out = scopeToConversation({
    conversation: { id: ATLANTA_THREAD, trip_id: null, focus: "new_trip" },
    tripId: DISNEY,
    focus: "itinerary",
  });
  assert.deepEqual(out, { tripId: null, focus: "new_trip", rescoped: true });
});

test("a conversation about another trip takes its own trip and focus", () => {
  const out = scopeToConversation({
    conversation: { id: "c", trip_id: ALASKA, focus: "packing" },
    tripId: DISNEY,
    focus: "itinerary",
  });
  assert.deepEqual(out, { tripId: ALASKA, focus: "packing", rescoped: true });
});

test("a conversation about the page's trip is left exactly as sent", () => {
  const out = scopeToConversation({
    conversation: { id: "c", trip_id: DISNEY, focus: "packing" },
    tripId: DISNEY,
    focus: "itinerary",
  });
  assert.deepEqual(out, { tripId: DISNEY, focus: "itinerary", rescoped: false });
});

test("a new conversation, or one that cannot be read, keeps the page", () => {
  assert.deepEqual(
    scopeToConversation({ conversation: null, tripId: DISNEY, focus: "itinerary" }),
    { tripId: DISNEY, focus: "itinerary", rescoped: false },
  );
  assert.deepEqual(
    scopeToConversation({ conversation: null, tripId: undefined, focus: undefined }),
    { tripId: null, focus: null, rescoped: false },
  );
});

test("a trip is never added that the client did not send (the trip builder after its draft)", () => {
  const out = scopeToConversation({
    conversation: { id: "c", trip_id: ALASKA, focus: "new_trip" },
    tripId: null,
    focus: "new_trip",
  });
  assert.deepEqual(out, { tripId: null, focus: "new_trip", rescoped: false });
});

test("a missing conversation focus falls back to none, not to the page's", () => {
  const out = scopeToConversation({
    conversation: { id: "c", trip_id: null, focus: null },
    tripId: DISNEY,
    focus: "budget",
  });
  assert.equal(out.tripId, null);
  assert.equal(out.focus, null);
});

test("the panel gets the page's trip only for a conversation about it", () => {
  const page = { id: DISNEY, name: "Disney Thanksgiving 2026" };
  assert.equal(tripForPanel(page, null), page);
  assert.equal(tripForPanel(page, { id: null, tripId: DISNEY }), page, "started here");
  assert.equal(tripForPanel(page, { id: "x", tripId: DISNEY }), page, "resumed");
  assert.equal(tripForPanel(page, { id: "x", tripId: null }), null, "picked, no trip");
  assert.equal(tripForPanel(page, { id: "x", tripId: ALASKA }), null, "picked, other trip");
  assert.equal(tripForPanel(null, { id: "x", tripId: ALASKA }), null, "no page trip");
});

test("the panel sends the conversation's own trip when the page's is withheld", () => {
  assert.equal(askTripId({ id: DISNEY }, DISNEY), DISNEY);
  assert.equal(askTripId(null, ALASKA), ALASKA);
  assert.equal(askTripId(null, null), null);
  assert.equal(askTripId(undefined, undefined), null);
});

function fakeSupabase(row, { error = null, onQuery } = {}) {
  return {
    from(table) {
      onQuery?.(table);
      const q = {
        select() { return q; },
        eq(col, val) { q.filter = [col, val]; return q; },
        async maybeSingle() {
          return { data: row && q.filter?.[1] === row.id ? row : null, error };
        },
      };
      return q;
    },
  };
}

test("readConversationScope reads only the trip and focus, and fails quietly", async () => {
  const row = { id: ATLANTA_THREAD, trip_id: null, focus: "new_trip" };
  assert.deepEqual(await readConversationScope(fakeSupabase(row), ATLANTA_THREAD), row);
  assert.equal(await readConversationScope(fakeSupabase(row), "someone-else"), null);
  assert.equal(
    await readConversationScope(fakeSupabase(row, { error: { message: "rls" } }), ATLANTA_THREAD),
    null,
  );
  let asked = 0;
  const counting = fakeSupabase(row, { onQuery: () => (asked += 1) });
  assert.equal(await readConversationScope(counting, null), null);
  assert.equal(await readConversationScope(counting, ""), null);
  assert.equal(asked, 0, "no query without an id");
});

test("ensureConversation reuses the row already read, with no second query", async () => {
  const throwing = { from() { throw new Error("should not query"); } };
  const out = await ensureConversation(throwing, "user", {
    conversationId: ATLANTA_THREAD,
    known: { id: ATLANTA_THREAD, trip_id: null, focus: "new_trip" },
  });
  assert.deepEqual(out, { id: ATLANTA_THREAD, created: false, error: null });
});

test("ensureConversation ignores a known row for a different id", async () => {
  let asked = 0;
  const row = { id: ATLANTA_THREAD, trip_id: null };
  const supabase = fakeSupabase(row, { onQuery: () => (asked += 1) });
  const out = await ensureConversation(supabase, "user", {
    conversationId: ATLANTA_THREAD,
    known: { id: "another" },
  });
  assert.equal(out.id, ATLANTA_THREAD);
  assert.equal(asked, 1);
});

test("the chat route scopes before it loads the family record", () => {
  const src = read("app/api/chat/route.js");
  const scopeAt = src.indexOf("scopeToConversation({");
  const loadAt = src.indexOf("loadEverything(supabase, user.id, tripId");
  assert.ok(scopeAt > 0 && loadAt > scopeAt, "scope comes first");
  assert.match(src, /tripId: pageTripId,\s*focus: pageFocus,/);
  assert.match(src, /const tripId = scoped\.tripId;/);
  assert.match(src, /const focus = isKnownFocus\(scoped\.focus\)/);
  assert.equal((src.match(/payload\?\.tripId/g) || []).length, 1, "the page trip is read once");
  assert.match(src, /known: conversationRow,/);
});

test("approved changes land on the conversation's trip, not the page's", () => {
  const src = read("app/api/chat/apply/route.js");
  const scopeAt = src.indexOf("scopeToConversation({");
  const checkAt = src.indexOf('.from("trips")');
  const validateAt = src.indexOf("focusTripId: tripId,");
  assert.ok(scopeAt > 0 && checkAt > scopeAt && validateAt > scopeAt);
  assert.doesNotMatch(src, /const tripId = payload\?\.tripId/);
  assert.match(src, /known: conversationRow,/);
});

test("the drawer and panel no longer hand the page's trip to every conversation", () => {
  const drawer = read("components/AskAlyDrawer.js");
  assert.match(drawer, /const panelTrip = tripForPanel\(trip, current\);/);
  assert.match(drawer, /trip=\{panelTrip\}/);
  assert.doesNotMatch(drawer, /<ChatPanel\s+trip=\{trip\}/);
  assert.match(drawer, /focus: conversation\.focus \|\| null,/);
  const panel = read("components/ChatPanel.js");
  assert.match(panel, /const tripId = askTripId\(trip, conversationTripId\);/);
  assert.match(panel, /pageTripId && \(data\.deletedTripIds \|\| \[\]\)\.includes\(pageTripId\)/);
});
