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
  assert.equal(more.scoreWallet([], w).score, 0);
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
