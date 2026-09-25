// The model lab: which vendor names count as candidates, what a request costs,
// how answers are marked, and which model each kind of request is pointed at.
// No network: the runner is driven through a stubbed fetch.
import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root }, moduleCache: false });
const { geminiCandidate, openaiCandidate } = await jiti.import("../lib/model-lab/catalog.js");
const { defaultPicks } = await jiti.import("../lib/model-lab/picks.js");
const { priceFor, costOf } = await jiti.import("../lib/model-lab/prices.js");
const { aggregate, recommend, formatCost } = await jiti.import("../lib/model-lab/recommend.js");
const { SCENARIOS, requestCount } = await jiti.import("../lib/model-lab/scenarios.js");
const score = await jiti.import("../lib/model-lab/score.js");

test("only text models the app could use are candidates", () => {
  assert.equal(geminiCandidate("models/gemini-3.7-flash").id, "gemini-3.7-flash");
  assert.equal(geminiCandidate("gemini-3.1-pro-preview").preview, true);
  assert.equal(geminiCandidate("gemini-3.5-flash-lite").tier, "flash-lite");
  assert.equal(geminiCandidate("gemini-2.5-flash"), null);
  assert.equal(geminiCandidate("gemini-3.7-flash-tts"), null);
  assert.equal(geminiCandidate("gemini-3.7-flash-image"), null);
  assert.equal(geminiCandidate("gemini-3.7-flash", ["embedContent"]), null);
  assert.equal(openaiCandidate("gpt-6-luna").tier, "luna");
  assert.equal(openaiCandidate("gpt-5.6-sol").version, 5.6);
  assert.equal(openaiCandidate("gpt-5.6-luna-2026-08-01"), null);
  assert.equal(openaiCandidate("gpt-4o"), null);
  assert.equal(openaiCandidate("gpt-6-audio"), null);
});

test("a model never seen before is ticked on arrival", () => {
  const models = [
    { id: "gpt-5.6-luna", vendor: "openai", tier: "luna", version: 5.6, preview: false, inUse: true },
    { id: "gpt-6-luna", vendor: "openai", tier: "luna", version: 6, preview: false, inUse: false },
    { id: "gemini-3.5-flash", vendor: "gemini", tier: "flash", version: 3.5, preview: false, inUse: false },
    { id: "gemini-3.7-flash", vendor: "gemini", tier: "flash", version: 3.7, preview: false, inUse: false },
  ];
  const first = defaultPicks(models, []);
  assert.ok(first.includes("gpt-5.6-luna") && first.includes("gpt-6-luna") && first.includes("gemini-3.7-flash"));
  assert.ok(!first.includes("gemini-3.5-flash"));
  const later = defaultPicks(models, ["gpt-5.6-luna", "gpt-6-luna", "gemini-3.7-flash"]);
  assert.ok(later.includes("gemini-3.5-flash"), "unseen model is picked");
});

test("prices: promotions end, overrides win, unknown models stay unpriced", () => {
  const promo = priceFor("gemini-3.7-flash", { today: new Date("2026-10-01") });
  const after = priceFor("gemini-3.7-flash", { today: new Date("2027-01-02") });
  assert.equal(promo.input, 0.75);
  assert.equal(after.input, 1.5);
  assert.equal(priceFor("gemini-9-flash"), null);
  const own = priceFor("gemini-9-flash", { overrides: { "gemini-9-flash": { input: "2", output: "8" } } });
  assert.equal(own.input, 2);
  assert.equal(own.cached, 2);
  assert.equal(own.overridden, true);
  const cost = costOf({ inputTokens: 1_000_000, cachedTokens: 500_000, outputTokens: 1_000_000, searches: 2 }, { input: 1, cached: 0.1, output: 4, search: 0.01 });
  assert.ok(Math.abs(cost - (0.5 + 0.05 + 4 + 0.02)) < 1e-9);
  assert.equal(costOf({ inputTokens: 10 }, null), null);
  assert.equal(formatCost(null), "price not set");
  assert.equal(formatCost(0.0009), "0.09¢");
});

test("scoring marks the answers it is meant to", () => {
  const facts = score.scoreFacts("Ivy has a peanut allergy; bring her EpiPen.", [/peanut/i, /epi/i]);
  assert.equal(facts.score, facts.max);
  const tools = score.scoreTools([{ name: "delete_item", args: { id: "not-real" } }], { id: "no-invented-id", want: [] }, ["a"]);
  assert.ok(tools.score < tools.max);
  assert.deepEqual(score.jsonOut("```json\n{\"a\":1}\n```"), { a: 1 });
});

test("the cheapest nearly-as-good model wins, and a model that failed is never picked", () => {
  const r = (model, s, ms, inputTokens, ok = true) => ({ model, scenario: "email", caseId: "x" + Math.random(), effort: "low", ok, score: s, max: 10, ms, inputTokens, cachedTokens: 0, outputTokens: 100, searches: 0 });
  const results = [
    r("gemini-3.1-pro-preview", 10, 16000, 5000),
    r("gpt-5.6-luna", 10, 1900, 5000),
    r("gemini-3.5-flash-lite", 7, 900, 5000),
    r("gpt-6-sol", 10, 3000, 5000),
    r("gpt-6-sol", 0, 0, 0, false),
  ];
  const rows = aggregate(results, { today: new Date("2026-10-01") });
  const pick = recommend(rows).email;
  assert.equal(pick.best.quality, 1);
  assert.equal(pick.fastest.model, "gpt-5.6-luna");
  assert.notEqual(pick.cheapest.model, "gemini-3.5-flash-lite", "too far below the top");
  assert.ok(![pick.best, pick.cheapest, pick.fastest].some((x) => x.model === "gpt-6-sol"));
});

test("every scenario names cases and a feature", () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), ["ask", "tools", "search", "email", "documents", "fares", "tips", "wallet", "nav", "priors", "long"]);
  assert.equal(requestCount(["tools", "fares"]), 9);
});

// A Gemini reply shaped like the real one, so the runner's request building and
// marking run without the network.
function geminiReply(parts) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 80, cachedContentTokenCount: 0 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("the runner builds a request and marks the reply", async () => {
  const saved = { fetch: globalThis.fetch, key: process.env.GEMINI_API_KEY };
  process.env.GEMINI_API_KEY = "test-key";
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(init.body) });
    return geminiReply([{ text: "Ivy has a peanut allergy, so pack her EpiPen." }]);
  };
  try {
    const { runCase } = await jiti.import("../lib/model-lab/run.js");
    const out = await runCase({ model: "gemini-3.7-flash", scenario: "ask", caseId: "allergy", effort: "high" });
    assert.equal(out.ok, true);
    assert.equal(out.score, out.max);
    assert.equal(out.inputTokens, 1200);
    assert.match(seen[0].url, /gemini-3\.7-flash/);
    assert.match(JSON.stringify(seen[0].body), /Calderwood/);
    const bad = await runCase({ model: "gemini-3.7-flash", scenario: "ask", caseId: "nope" });
    assert.equal(bad.ok, false);
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved.key;
  }
});

test("the email test sends the app's own reader prompt and schema", async () => {
  const { runCase, EMAIL_READY } = await jiti.import("../lib/model-lab/run.js");
  const parser = await jiti.import("../lib/inbox/parser.js");
  assert.equal(EMAIL_READY, true);
  const saved = { fetch: globalThis.fetch, key: process.env.GEMINI_API_KEY };
  let sent;
  process.env.GEMINI_API_KEY = "test";
  globalThis.fetch = async (_u, init) => {
    sent = JSON.parse(init.body);
    const text = JSON.stringify({ kind: "not_booking", passenger_names: [], items: [] });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata: {} }), { status: 200 });
  };
  try {
    const out = await runCase({ model: "gemini-3.6-flash", scenario: "email", caseId: "marketing" });
    const parts = sent.contents[0].parts.map((p) => p.text);
    assert.equal(parts[0], parser.PROMPT);
    assert.equal(parts[1], parser.UNTRUSTED);
    assert.deepEqual(sent.generationConfig.responseSchema, parser.RESPONSE_SCHEMA);
    assert.equal(out.ok, true);
    assert.equal(out.score, out.max);
  } finally {
    globalThis.fetch = saved.fetch;
    if (saved.key === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved.key;
  }
});
