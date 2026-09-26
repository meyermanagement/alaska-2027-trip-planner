// The confirm step in front of every assistant write (lib/mcp/confirm.js),
// driven through the protocol the way Claude calls it. Invented households
// only, borrowed from mcp-writes.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { readerScope } = jiti("../lib/mcp/scope.js");
const { handleMessage } = jiti("../lib/mcp/protocol.js");
const { issueConfirm, checkConfirm } = jiti("../lib/mcp/confirm.js");
const { AGREEMENT_VERSION, PRIVACY_VERSION } = jiti("../lib/beta/agreement.js");

const TODAY = "2027-03-10";
const A = "fam-a", B = "fam-b";
const consent = (user_id) => ({ user_id, agreement_version: AGREEMENT_VERSION, privacy_version: PRIVACY_VERSION, age_confirmed: true, data_acknowledged: true });

function world() {
  return {
    beta_consents: [consent("u-ann"), consent("u-sam"), consent("u-bob")],
    family_members: [{ family_id: A, user_id: "u-ann" }, { family_id: A, user_id: "u-sam" }, { family_id: B, user_id: "u-bob" }],
    travelers: [
      { id: "ta1", family_id: A, name: "Ann", user_id: "u-ann", is_person: true, access_level: "primary", date_of_birth: "1980-01-01" },
      { id: "ta2", family_id: A, name: "Sam", user_id: "u-sam", is_person: true, access_level: "secondary", date_of_birth: "1982-01-01" },
      { id: "ta3", family_id: A, name: "Kit", user_id: null, is_person: true, access_level: "primary", date_of_birth: "2015-06-01" },
      { id: "tb1", family_id: B, name: "Ann", user_id: null, is_person: true, access_level: "primary", date_of_birth: "1970-01-01" },
      { id: "tb2", family_id: B, name: "Bob", user_id: "u-bob", is_person: true, access_level: "primary", date_of_birth: "1971-01-01" },
    ],
    trips: [
      { id: "trip-a1", family_id: A, name: "Curacao spring", destination: "Willemstad", start_date: "2027-03-09", end_date: "2027-03-15", status: "planning" },
      { id: "trip-b1", family_id: B, name: "Curacao spring", destination: "Willemstad", start_date: "2027-03-09", end_date: "2027-03-12", status: "planning" },
    ],
    trip_travelers: [
      { trip_id: "trip-a1", traveler_id: "ta1" }, { trip_id: "trip-a1", traveler_id: "ta2" }, { trip_id: "trip-a1", traveler_id: "ta3" },
      { trip_id: "trip-b1", traveler_id: "tb1" }, { trip_id: "trip-b1", traveler_id: "tb2" },
    ],
    packing_items: [
      { id: "p1", trip_id: "trip-a1", item: "Hat", assignee: "Ann", is_packed: false },
      { id: "p2", trip_id: "trip-a1", item: "Old towel", assignee: "Ann", is_packed: false, stashed_at: "2027-01-01" },
      { id: "pb", trip_id: "trip-b1", item: "OTHER-HOUSEHOLD", assignee: "Ann", is_packed: false },
    ],
    day_pack_items: [
      { id: "d1", trip_id: "trip-a1", item_date: TODAY, item: "Towel", assignee: "Sam", is_packed: false },
      { id: "d2", trip_id: "trip-a1", item_date: TODAY, item: "Towel", assignee: "Ann", is_packed: false },
      { id: "d3", trip_id: "trip-a1", item_date: TODAY, item: "Kit's goggles", assignee: "Kit", is_packed: false },
      { id: "d4", trip_id: "trip-a1", item_date: TODAY, item: "Inhaler", assignee: "Ann", is_packed: false },
      { id: "d5", trip_id: "trip-a1", item_date: TODAY, item: "Sunscreen", assignee: "Shared", is_packed: false },
      { id: "d6", trip_id: "trip-a1", item_date: "2027-03-11", item: "Towel", assignee: "Sam", is_packed: false },
      { id: "db", trip_id: "trip-b1", item_date: TODAY, item: "Towel", assignee: "Ann", is_packed: false },
    ],
    predeparture_tasks: [
      { id: "r1", trip_id: "trip-a1", title: "Print boarding passes", assignee: "Ann", is_done: false },
      { id: "r2", trip_id: "trip-a1", title: "Refill prescription", assignee: "Ann", is_done: false },
      { id: "r3", trip_id: "trip-a1", title: "Charge Kit's tablet", assignee: "Ann", is_done: false },
      { id: "r4", trip_id: "trip-a1", title: "Hold the mail", assignee: "Shared", is_done: false },
      { id: "r5", trip_id: "trip-a1", title: "Check in online", assignee: "Sam", is_done: false },
      { id: "r6", trip_id: "trip-a1", title: "Check in online", assignee: "Ann", is_done: false },
      { id: "rb", trip_id: "trip-b1", title: "Print boarding passes", assignee: "Ann", is_done: false },
    ],
    someday_places: [
      { id: "s1", family_id: A, place: "Iceland", status: "open" },
      { id: "s2", family_id: A, place: "Peru", status: "retired" },
      { id: "sb", family_id: B, place: "Kyoto", status: "open" },
    ],
    minors: new Set(),
  };
}

// supabase-js reads plus the two writes these tools make, recorded in calls.
function fakeAdmin(db, calls = []) {
  return {
    rpc: async (fn, args) => ({ data: fn === "account_is_minor" ? db.minors.has(args.account_id) : null, error: fn === "account_is_minor" ? null : { message: "no" } }),
    from(table) {
      let rows = [...(db[table] || [])];
      let cols = null;
      const q = {
        select(c) { cols = c.split(",").map((s) => s.trim()); return q; },
        eq(k, v) { rows = rows.filter((r) => r[k] === v); return q; },
        in(k, vs) { rows = rows.filter((r) => vs.includes(r[k])); return q; },
        order() { return q; },
        insert(row) {
          return {
            select() {
              const saved = { id: `new-${(db[table] || []).length + 1}`, ...row };
              (db[table] ||= []).push(saved);
              calls.push({ op: "insert", table, row });
              return Promise.resolve({ data: [{ id: saved.id }], error: null });
            },
          };
        },
        update(patch) {
          const where = [];
          const u = {
            eq(k, v) { where.push([k, v]); return u; },
            select() {
              const hit = (db[table] || []).filter((r) => where.every(([k, v]) => r[k] === v));
              for (const r of hit) Object.assign(r, patch);
              calls.push({ op: "update", table, ids: hit.map((r) => r.id), patch });
              return Promise.resolve({ data: hit.map((r) => ({ id: r.id })), error: null });
            },
          };
          return u;
        },
        delete() { throw new Error("delete attempted"); },
        upsert() { throw new Error("upsert attempted"); },
        maybeSingle() { return Promise.resolve({ data: pick(rows)[0] || null, error: null }); },
        then(ok, bad) { return Promise.resolve({ data: pick(rows), error: null }).then(ok, bad); },
      };
      const pick = (rs) => (cols ? rs.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]]))) : rs);
      return q;
    },
  };
}


let seq = 0;
async function session(userId, { secret = "token-ann", clientId = "client-claude" } = {}) {
  const db = world();
  const calls = [];
  const admin = fakeAdmin(db, calls);
  const getScope = () => readerScope(admin, userId, TODAY);
  const send = (params) =>
    handleMessage({ jsonrpc: "2.0", id: ++seq, method: "tools/call", params }, { client: admin, getScope, confirmSecret: secret, clientId });
  return { db, calls, send };
}
const hat = { name: "check_off_packing_item", arguments: { item: "Hat" } };
const ELICIT = { "io.modelcontextprotocol/clientCapabilities": { elicitation: { form: {} } } };

test("tools/list offers the confirm code on writes only", async () => {
  const { body } = await handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" }, {});
  const tools = body.result.tools;
  assert.ok(tools.find((t) => t.name === "add_packing_item").inputSchema.properties.confirm);
  assert.equal(tools.find((t) => t.name === "list_trips").inputSchema.properties.confirm, undefined);
});

test("a write without a code saves nothing and returns one", async () => {
  const { db, calls, send } = await session("u-ann");
  const { body } = await send(hat);
  assert.equal(calls.length, 0);
  assert.equal(db.packing_items.find((r) => r.id === "p1").is_packed, false);
  assert.equal(body.result.structuredContent.saved, false);
  assert.equal(body.result.structuredContent.needs_confirmation, true);
  assert.match(body.result.content[0].text, /Nothing is saved yet[\s\S]*item: Hat[\s\S]*confirm: "/);
  const code = body.result.structuredContent.confirm;
  const done = await send({ ...hat, arguments: { ...hat.arguments, confirm: code } });
  assert.equal(done.body.result.structuredContent.changed, true);
  assert.equal(db.packing_items.find((r) => r.id === "p1").is_packed, true);
});

test("a code does not carry over to other arguments, another tool, person or assistant", async () => {
  const { calls, send } = await session("u-ann");
  const code = (await send(hat)).body.result.structuredContent.confirm;
  const other = await send({ name: "check_off_packing_item", arguments: { item: "Old towel", confirm: code } });
  assert.match(other.body.result.content[0].text, /doesn't match/);
  const tool = await send({ name: "add_packing_item", arguments: { item: "Hat", confirm: code } });
  assert.match(tool.body.result.content[0].text, /doesn't match/);
  assert.equal(calls.length, 0);
  const sam = await session("u-sam");
  const theirs = await sam.send({ ...hat, arguments: { item: "Hat", confirm: code } });
  assert.equal(theirs.body.result.structuredContent.saved, false);
  const bot = await session("u-ann", { clientId: "client-other" });
  assert.match((await bot.send({ ...hat, arguments: { item: "Hat", confirm: code } })).body.result.content[0].text, /doesn't match/);
  const refreshed = await session("u-ann", { secret: "token-ann-2" });
  assert.match((await refreshed.send({ ...hat, arguments: { item: "Hat", confirm: code } })).body.result.content[0].text, /doesn't match/);
  assert.equal(sam.calls.length + bot.calls.length + refreshed.calls.length, 0);
});

test("a made-up or expired code saves nothing", async () => {
  const { calls, send } = await session("u-ann");
  const forged = await send({ ...hat, arguments: { item: "Hat", confirm: "e30.abc" } });
  assert.equal(forged.body.result.structuredContent.saved, false);
  const principal = { userId: "u-ann", clientId: "client-claude" };
  const stale = issueConfirm({ secret: "token-ann", principal, tool: "check_off_packing_item", args: { item: "Hat" }, now: Date.now() - 11 * 60 * 1000 });
  assert.equal(checkConfirm({ secret: "token-ann", principal, tool: "check_off_packing_item", args: { item: "Hat" }, token: stale }), "expired");
  const again = await send({ ...hat, arguments: { item: "Hat", confirm: stale } });
  assert.equal(again.body.result.structuredContent.needs_confirmation, true, "asks again with a fresh code");
  assert.equal(calls.length, 0);
});

test("a client that can prompt gets the question itself, and a no saves nothing", async () => {
  const { db, calls, send } = await session("u-ann");
  const first = await send({ ...hat, _meta: ELICIT });
  const r = first.body.result;
  assert.equal(r.resultType, "input_required");
  assert.equal(r.inputRequests.confirm.method, "elicitation/create");
  assert.match(r.inputRequests.confirm.params.message, /Save this change in Alyeska\?[\s\S]*item: Hat/);
  assert.equal(calls.length, 0);
  const no = await send({ ...hat, _meta: ELICIT, requestState: r.requestState, inputResponses: { confirm: { action: "decline" } } });
  assert.equal(no.body.result.structuredContent.declined, true);
  assert.equal(calls.length, 0);
  const yes = await send({ ...hat, _meta: ELICIT, requestState: r.requestState, inputResponses: { confirm: { action: "accept", content: {} } } });
  assert.equal(yes.body.result.structuredContent.changed, true);
  assert.equal(db.packing_items.find((r) => r.id === "p1").is_packed, true);
});

test("an accept without the server's own state is asked again", async () => {
  const { calls, send } = await session("u-ann");
  const faked = await send({ ...hat, _meta: ELICIT, requestState: "e30.abc", inputResponses: { confirm: { action: "accept" } } });
  assert.equal(faked.body.result.resultType, "input_required");
  assert.equal(calls.length, 0);
});

test("reads are never held, and a refused account is refused before any question", async () => {
  const { send } = await session("u-ann");
  const read = await send({ name: "list_trips", arguments: {} });
  assert.equal(read.body.result.structuredContent.saved, undefined);
  const outsider = await session("u-nobody");
  const refused = await outsider.send(hat);
  assert.equal(refused.body.result.isError, true);
  assert.equal(refused.body.result.structuredContent, undefined);
});

test("a malformed write fails at once instead of after a yes", async () => {
  const { send } = await session("u-ann");
  const bad = await send({ name: "check_off_packing_item", arguments: { item: "Hat", colour: "red" } });
  assert.equal(bad.body.result.isError, true);
  assert.match(bad.body.result.content[0].text, /Unexpected argument/);
});

test("no signing key means nothing saves", async () => {
  const { calls, send } = await session("u-ann", { secret: "" });
  const r = await send(hat);
  assert.equal(r.body.result.structuredContent.saved, false);
  assert.equal(calls.length, 0);
});
