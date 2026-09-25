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
