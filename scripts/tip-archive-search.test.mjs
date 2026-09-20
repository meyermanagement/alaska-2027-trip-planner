import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const moduleUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
const helpers = await import(moduleUrl(read("lib/tips/archiveSearch.js")));
const { searchTerms, archiveFilter, selectedMatches, checkedAnswer, safeSources, keywordRank, directMatches, mergeMatches } = helpers;
const id = "11111111-1111-4111-8111-111111111111";
const tip = { id, title: "Motion sickness on the crossing", body: "Plan for the ferry.", trips: { name: "Alaska cruise" } };

test("natural-language expansion preserves synonyms beyond original query terms", () => {
  const terms = searchTerms("that tip about getting seasick on the cruise", ["motion sickness", "ferry"]);
  assert.ok(terms.includes("motion sickness"));
  assert.ok(!terms.includes("that"));
  assert.match(archiveFilter([...Array.from({ length: 10 }, (_, i) => `word${i}`), "motion sickness"]), /body.ilike.%motion sickness%/);
});
test("model and user text cannot inject database filter operators", () => {
  const filter = archiveFilter(["foo),family_id.neq.bar", "100% off", "a_b"], [id, "bad),id.neq.foo"]);
  assert.doesNotMatch(filter, /family_id\.neq|id\.neq|a_b/);
  assert.ok(filter.includes(`trip_id.in.(${id})`));
  assert.ok(archiveFilter([]) === "");
});
test("semantic output may only select existing records, once", () => {
  const result = selectedMatches(JSON.stringify({ matches: [{ id, reason: "Related to seasickness." }, { id }, { id: "fabricated" }] }), [tip]);
  assert.equal(result.length, 1);
  assert.equal(result[0].body, tip.body);
  assert.equal(selectedMatches('{"matches":[]}', [tip]).length, 0);
  assert.equal(selectedMatches("bad JSON", [tip]), null);
});
test("keyword fallback uses trip context without modifying the old tip", () => {
  const rows = [{ id: "other", title: "Restaurant" }, tip];
  assert.equal(keywordRank(rows, ["alaska"])[0].id, id);
  assert.equal(rows[0].id, "other");
});
test("verification never accepts an unsearched or uncited model assertion", () => {
  for (const result of [
    { text: '{"verdict":"supported","answer":"Still true"}', searched: false, sources: [{ url: "https://example.com" }] },
    { text: '{"verdict":"supported","answer":"Still true"}', searched: true, sources: [] },
    { text: "bad JSON", searched: true, sources: [{ url: "https://example.com" }] },
  ]) {
    const answer = checkedAnswer(result, "2026-09-19T12:00:00Z");
    assert.equal(answer.verdict, "uncertain");
    assert.doesNotMatch(answer.answer, /Still true/);
  }
});
test("current research keeps verdict, timestamp, and safe source links", () => {
  assert.deepEqual(safeSources([{ url: "javascript:alert(1)" }, { url: "https://user:pass@example.com" }]), []);
  const answer = checkedAnswer({ searched: true, text: '{"verdict":"changed","answer":"The operator changed the policy."}',
    sources: [{ url: "https://example.com/policy", title: "Operator policy" }] }, "2026-09-19T12:00:00Z");
  assert.equal(answer.verdict, "changed");
  assert.equal(answer.sources[0].url, "https://example.com/policy");
  assert.equal(answer.checkedAt, "2026-09-19T12:00:00Z");
});

// Exercise the actual route handlers with injected dependency boundaries.
async function route(path, context, model, db) {
  let code = read(path);
  code = code.replace(/^import .*;\n/gm, "");
  return import(moduleUrl(`
    const NextResponse = {json:(data,options={})=>({data,status:options.status||200})};
    const archiveContext = globalThis.__archiveTest.context;
    const generate = globalThis.__archiveTest.generate;
    const resolveGroundingUrls = async sources => sources;
    const WALLET_SCOPES = ["wallet","offers"];
    const {ARCHIVE_COLUMNS, ARCHIVE_LIMIT, UUID, readJson, searchTerms, archiveFilter, keywordRank, directMatches, mergeMatches,
      selectedMatches, EXPAND_SYSTEM, RANK_SYSTEM, CHECK_SYSTEM, checkedAnswer} = globalThis.__archiveTest.helpers;
    ${code}
    // ${Math.random()}
  `));
}
function setup({ ai = true, denied = false, rows = [tip], rowBatches, outputs = [] } = {}) {
  const log = [], calls = [];
  const supabase = { from(table) {
    const batch = rowBatches ? rowBatches.shift() || [] : rows;
    let single = false;
    const q = new Proxy({}, { get(_, method) {
      if (method === "then") return (resolve) => Promise.resolve({
        data: table === "trips" ? [] : single ? batch[0] || null : batch, error: null,
      }).then(resolve);
      return (...args) => { log.push([table, method, ...args]); if (method === "maybeSingle") single = true; return q; };
    } });
    return q;
  } };
  globalThis.__archiveTest = { helpers,
    context: async () => denied ? { error: "No access", status: 403 } : { supabase, familyId: "family", ai },
    generate: async args => { calls.push(args); const out = outputs.shift(); if (out instanceof Error) throw out; return out || { text: '{"matches":[]}' }; },
  };
  return { log, calls };
}
const req = body => ({ text: async () => JSON.stringify(body) });
const neckFanTip = {
  id, title: "Leave neck fans off your packing list",
  body: "Leaving bulky rechargeable neck fans behind saves valuable suitcase space.",
  because: "Neck fans are on the packing list for a late-November itinerary.",
};
test("literal matches cover all stored searchable fields, without treating trip names as tip text", () => {
  for (const field of ["title", "body", "because", "about"]) {
    assert.equal(directMatches([{ id, [field]: "NECK FANS" }], ["fans"]).length, 1);
  }
  assert.deepEqual(directMatches([{ id, trips: { name: "Fans" } }], ["fans"]), []);
  assert.deepEqual(directMatches([neckFanTip], ["ferry"]), []);
});
test("direct matches survive empty, invalid and unrelated semantic selections", async () => {
  for (const ranking of [
    '{"matches":[]}', "[]", "bad JSON",
    '{"matches":[{"id":"fabricated"}]}',
    '{"matches":[{"id":"other","reason":"Related cooling advice"}]}',
    new Error("ranking unavailable"),
  ]) {
    setup({ rows: [neckFanTip, { id: "other", title: "Bring a cooling towel" }],
      outputs: [{ text: '{"terms":["cooling"]}' }, ranking instanceof Error ? ranking : { text: ranking }] });
    const { POST } = await route("app/api/tips/cleared/search/route.js");
    const res = await POST(req({ query: "fans", scope: "trip", tripId: id }));
    assert.equal(res.status, 200);
    assert.equal(res.data.tips[0].id, id);
    assert.equal(res.data.tips[0].title, neckFanTip.title);
    if (ranking === '{"matches":[]}') assert.doesNotMatch(res.data.note, /unavailable/);
  }
});
test("direct matches are not duplicated when also selected by meaning", () => {
  const ranked = [{ ...neckFanTip, matchReason: "Neck fan advice" }];
  const merged = mergeMatches([neckFanTip], ranked);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].matchReason, "Neck fan advice");
});
test("older direct matches survive more than 100 newer related hits with every query scoped", async () => {
  const { log } = setup({
    rowBatches: [[neckFanTip], Array.from({ length: 101 }, (_, n) => ({ id: `related-${n}`, title: "Cooling towel" }))],
    outputs: [{ text: '{"terms":["cooling"]}' }, { text: '{"matches":[]}' }],
  });
  const { POST } = await route("app/api/tips/cleared/search/route.js");
  const res = await POST(req({ query: "fans", scope: "trip", tripId: id }));
  assert.equal(res.data.tips[0].id, id);
  assert.equal(res.data.truncated, true);
  for (const field of ["family_id", "trip_id"]) {
    assert.equal(log.filter(row => row[1] === "eq" && row[2] === field).length, 2);
  }
  assert.equal(log.filter(row => row[1] === "in" && row[2] === "status").length, 2);
});
test("fans still finds neck fans with AI disabled, and genuine no-matches stay empty", async () => {
  for (const rows of [[neckFanTip], []]) {
    const { calls } = setup({ ai: false, rows });
    const { POST } = await route("app/api/tips/cleared/search/route.js");
    const res = await POST(req({ query: "fans", scope: "trip", tripId: id }));
    assert.deepEqual(res.data.tips.map(row => row.id), rows.map(row => row.id));
    assert.equal(calls.length, 0);
  }
});
test("search route scopes database reads, expands and ranks actual archive IDs", async () => {
  const { log, calls } = setup({ outputs: [{ text: '{"terms":["motion sickness"]}' }, { text: JSON.stringify({ matches: [{ id, reason: "Seasickness advice" }] }) }] });
  const { POST } = await route("app/api/tips/cleared/search/route.js");
  const res = await POST(req({ query: "getting seasick on the boat", scope: "trip", tripId: id }));
  assert.equal(res.status, 200); assert.equal(res.data.mode, "meaning"); assert.equal(res.data.tips[0].id, id);
  assert.equal(calls.length, 2);
  assert.ok(log.some(row => row[0] === "pro_tips" && row[1] === "eq" && row[2] === "family_id"));
  assert.ok(log.some(row => row[0] === "pro_tips" && row[1] === "eq" && row[2] === "trip_id" && row[3] === id));
  assert.ok(!log.some(row => row[0] === "trips"));
  assert.ok(log.some(row => row[1] === "in" && row[2] === "status" && row[3].includes("cleared")));
  assert.ok(log.some(row => row[1] === "or" && row[2].includes("motion sickness")));
  assert.ok(!log.some(row => ["insert", "update", "delete"].includes(row[1])));
});
test("AI-off search stays useful without any model call; large candidate sets are disclosed", async () => {
  const { calls } = setup({ ai: false, rows: Array.from({ length: 101 }, (_, n) => ({ ...tip, id: String(n) })) });
  const { POST } = await route("app/api/tips/cleared/search/route.js");
  const res = await POST(req({ query: "cruise", scope: "trip", tripId: id }));
  assert.equal(res.data.mode, "keywords"); assert.equal(calls.length, 0);
  assert.equal(res.data.truncated, true); assert.equal(res.data.tips.length, 30);
});
test("search failures degrade explicitly and do not invent semantic matches", async () => {
  const { log } = setup({ outputs: [new Error("unavailable"), new Error("unavailable")] });
  const { POST } = await route("app/api/tips/cleared/search/route.js");
  const res = await POST(req({ query: "cruise", scope: "wallet" }));
  assert.equal(res.data.mode, "keywords"); assert.match(res.data.note, /unavailable/);
  assert.ok(log.some(row => row[1] === "in" && row[2] === "scope" && row[3].includes("wallet")));
});
test("all-trip searches and missing trip identifiers are rejected before any model or database call", async () => {
  for (const body of [{ scope: "trips" }, { scope: "trip" }, { scope: "trip", tripId: "invalid" }]) {
    const { calls, log } = setup();
    const { POST } = await route("app/api/tips/cleared/search/route.js");
    assert.equal((await POST(req({ query: "cruise", ...body }))).status, 400);
    assert.equal(calls.length, 0); assert.equal(log.length, 0);
  }
});
test("trip searches do not exclude past or upcoming trips and the UI has no scope picker", () => {
  const server = read("app/api/tips/cleared/search/route.js");
  assert.doesNotMatch(server, /\.g[te]{1,2}\("end_date"|\.l[te]{1,2}\("start_date"|\.eq\("status"/);
  const ui = read("components/ClearedTipSearch.js");
  assert.match(ui, /wallet \? "wallet" : "trip"/);
  assert.doesNotMatch(ui, /<select|All trips/);
  assert.match(read("components/ClearedTips.js"), /key=\{wallet \? "wallet" : tripId\}/);
});
test("trip-scoped cleared cards omit redundant trip navigation but keep restore and recheck", () => {
  const card = read("components/ClearedTips.js");
  assert.doesNotMatch(card, /Open original trip|tripPath|from "next\/link"/);
  assert.match(card, /Bring it back/);
  assert.match(card, /<ClearedTipCheck tip=\{tip\}/);
});
test("denied access never reaches a model or archive query", async () => {
  const { calls, log } = setup({ denied: true });
  const { POST } = await route("app/api/tips/cleared/search/route.js");
  assert.equal((await POST(req({ query: "cruise", scope: "trips" }))).status, 403);
  assert.equal(calls.length, 0); assert.equal(log.length, 0);
});
test("recheck uses stored ID and consent, never submitted tip content or writes", async () => {
  const { calls, log } = setup({ outputs: [{ searched: true, text: '{"verdict":"time_bound","answer":"That deadline belonged to the original sailing."}', sources: [{ url: "https://example.com/policy" }] }] });
  const { POST } = await route("app/api/tips/cleared/check/route.js");
  const res = await POST(req({ id, body: "injected content" }));
  assert.equal(res.data.verdict, "time_bound");
  assert.ok(calls[0].grounded);
  assert.match(calls[0].messages[0].text, /Motion sickness/);
  assert.doesNotMatch(calls[0].messages[0].text, /injected content/);
  assert.ok(!log.some(row => ["insert", "update", "delete"].includes(row[1])));
});
test("recheck refuses missing records and disabled AI before a model call", async () => {
  for (const config of [{ ai: false }, { rows: [] }]) {
    const { calls } = setup(config);
    const { POST } = await route("app/api/tips/cleared/check/route.js");
    assert.ok([403, 404].includes((await POST(req({ id }))).status));
    assert.equal(calls.length, 0);
  }
});
test("archive access boundary keeps session, origin, primary and own-consent checks", () => {
  const code = read("lib/tips/archiveAccess.js");
  for (const pattern of [/requestOrigin\(request\)/, /account_session_allowed/, /session !== true/, /access\?\.can.editTrips/, /aiAllowed\(supabase, user.id\)/])
    assert.match(code, pattern);
  assert.doesNotMatch(read("app/api/tips/cleared/search/route.js"), /createAdminClient/);
});
