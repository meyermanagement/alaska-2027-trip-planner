// Fixes from the 2026-09-25 lab run: separators in an id are not a misread,
// and a dropped connection is not a wrong answer.
import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root }, moduleCache: false });
const { scoreDoc } = await jiti.import("../lib/model-lab/score.js");
const { aggregate, recommend, dropped } = await jiti.import("../lib/model-lab/recommend.js");
const { priceFor } = await jiti.import("../lib/model-lab/prices.js");

test("a license number read with its printed dashes still scores", () => {
  const good = scoreDoc({ number: "T492118305" }, { number: "T492-118-305" });
  assert.equal(good.score, good.max);
  const bad = scoreDoc({ number: "T492118305" }, { number: "T492-118-306" });
  assert.equal(bad.score, bad.max - 1);
});

test("Load failed is counted as a lost connection, not a failure", () => {
  const rows = aggregate([
    { model: "m", scenario: "email", effort: "low", ok: true, score: 5, max: 5, ms: 1000, inputTokens: 1, outputTokens: 1 },
    { model: "m", scenario: "email", effort: "low", ok: false, error: "Load failed", score: 0, max: null },
  ]);
  assert.equal(rows[0].failures, 0);
  assert.equal(rows[0].dropped, 1);
  assert.equal(rows[0].quality, 1);
  assert.ok(recommend(rows).email, "still eligible for a pick");
  assert.equal(dropped({ ok: false, error: "HTTP 504" }), false, "a timeout is the model's");
});

test("every model the lab ran has a price", () => {
  for (const m of ["gemini-3.8-flash", "gpt-5.6-terra", "gpt-5.5"]) assert.ok(priceFor(m, { today: new Date("2026-09-25") }), m);
});

// 2026-09-25 additions: tips, Wallet, menu search, the about-you paragraph, a
// full-size record, and repeats.
const more = await jiti.import("../lib/model-lab/score.js");
const M = await jiti.import("../lib/model-lab/fixtures/more.js");
const { p90 } = await jiti.import("../lib/model-lab/recommend.js");
const { build } = await jiti.import("../lib/model-lab/run.js");
const { SCENARIOS } = await jiti.import("../lib/model-lab/scenarios.js");

test("menu search: the right door scores, the wrong trip and a guess at nonsense do not", () => {
  const place = M.NAV_CASES.find((c) => c.id === "place");
  assert.equal(more.scoreNav(["trip:curacao"], place).score, 2);
  assert.ok(more.scoreNav(["trip:alaska", "trip:curacao"], place).score < 2);
  const junk = M.NAV_CASES.find((c) => c.id === "nonsense");
  assert.equal(more.scoreNav([], junk).score, 2);
  assert.equal(more.scoreNav(["settings"], junk).score, 0);
});

test("about-you paragraph: a hedge filled in costs a mark, a clear answer earns one", () => {
  const hedged = M.PRIOR_CASES.find((c) => c.id === "hedged");
  assert.equal(more.scorePriors({}, hedged).score, 2);
  assert.ok(more.scorePriors({ pace: { value: "packed", quote: "invented words" } }, hedged).score < 2);
  const clear = M.PRIOR_CASES.find((c) => c.id === "clear");
  const r = more.scorePriors({ pace: { value: "one_thing", quote: "nothing in the paragraph says this" } }, clear);
  assert.ok(r.notes.some((n) => /quote/.test(n)));
});

test("tips and Wallet: nothing that survives the app's checks scores nothing", () => {
  const tip = M.TIP_CASES[0];
  assert.equal(more.scoreTips({ candidates: [], accepted: [], dropped: [] }, tip).score, 0);
  const w = M.WALLET_CASES[0];
  // Made-up programs cannot be looked up, so holding back keeps half.
  assert.equal(more.scoreWallet([], w).score, 2);
  assert.match(more.scoreWallet([], w).notes[0], /held back/);
  assert.equal(more.scoreWallet([], { ...w, madeUp: false }).score, 0);
  assert.ok(more.scoreWallet([{ title: "Use miles before May 20", body: "x", program_id: "prog-9999" }], w).notes.length > 0);
});

test("repeats: the slow end and disagreeing cases are counted", () => {
  assert.equal(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 9);
  assert.equal(p90([]), null);
  const row = (score) => ({ ok: true, scenario: "nav", model: "m", effort: "low", caseId: "a", score, max: 2, ms: 1000 });
  const [r] = aggregate([row(2), row(2), row(0), { ...row(2), caseId: "b" }]);
  assert.equal(r.repeated, 1);
  assert.equal(r.varied, 1);
});

test("every case on the page builds, and the full-size record is full size", () => {
  for (const s of SCENARIOS) for (const c of s.cases) assert.ok(build(s.id, c.id), `${s.id}/${c.id}`);
  const tokens = M.longRecord().length / 4;
  assert.ok(tokens > 40000 && tokens < 70000, String(tokens));
});

// 2026-09-25, from the minimal, low and high runs.
const { thinkingOffered, refusedThinking } = await jiti.import("../lib/model-lab/effort.js");
const { effortFor } = await jiti.import("../lib/agent/providers/openai.js");

test("about-you: a clear lean the instructions allow is not a guess", () => {
  const hedged = M.PRIOR_CASES.find((c) => c.id === "hedged");
  assert.equal(more.scorePriors({ doing_or_seeing: { value: "doing", quote: "I like hiking" } }, hedged).score, 2);
  assert.ok(more.scorePriors({ doing_or_seeing: { value: "seeing", quote: "I like hiking" } }, hedged).score < 2);
});

test("thinking levels a model refuses are known, and a refusal is recognised", () => {
  assert.equal(thinkingOffered("gemini-3.6-flash", "minimal"), true);
  assert.equal(thinkingOffered("gemini-3.8-flash", "minimal"), false);
  assert.equal(thinkingOffered("gpt-6-luna", "minimal"), false);
  assert.equal(thinkingOffered("gpt-6-luna", "low"), true);
  assert.equal(refusedThinking(400, "Thinking level MINIMAL is not supported for this model."), true);
  assert.equal(refusedThinking(400, "Unsupported value: 'minimal' is not supported with the 'gpt-5.5' model."), true);
  assert.equal(refusedThinking(400, "tools cannot be used with reasoning.effort 'minimal'"), true);
  assert.equal(refusedThinking(400, "Invalid JSON schema"), false);
  assert.equal(refusedThinking(500, "Thinking level MINIMAL is not supported"), false);
});

test("a refused level is shown apart and kept out of quality and picks", () => {
  const rows = aggregate([
    { model: "m", scenario: "nav", effort: "minimal", ok: false, unsupported: true, error: "Not offered at minimal thinking" },
    { model: "m", scenario: "nav", effort: "minimal", ok: false, unsupported: true, error: "Not offered at minimal thinking" },
  ]);
  assert.equal(rows[0].notOffered, 2);
  assert.equal(rows[0].failures, 0);
  assert.equal(rows[0].quality, null);
  assert.equal(recommend(rows).nav, null);
});

test("OpenAI is never sent minimal: it comes out as low", () => {
  assert.equal(effortFor("minimal"), "low");
  assert.equal(effortFor("none"), "low");
  assert.equal(effortFor("low"), "low");
  assert.equal(effortFor("high"), "medium");
});

test("the runner does not send a level the model refuses", async () => {
  const saved = globalThis.fetch;
  let sent = 0;
  globalThis.fetch = async () => {
    sent++;
    return new Response("{}", { status: 200 });
  };
  try {
    const { runCase } = await jiti.import("../lib/model-lab/run.js");
    const out = await runCase({ model: "gpt-6-luna", scenario: "nav", caseId: M.NAV_CASES[0].id, effort: "minimal" });
    assert.equal(out.unsupported, true);
    assert.equal(sent, 0);
  } finally {
    globalThis.fetch = saved;
  }
});

test("the about-you paragraph is read by 3.8 Flash first", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(new URL("../lib/travelers/extractAboutMePriors.js", import.meta.url), "utf8"));
  assert.match(src, /DEFAULT_TEXT_MODELS = \["gemini-3\.8-flash", "gemini-3\.6-flash", "gemini-3\.5-flash-lite"\]/);
});
