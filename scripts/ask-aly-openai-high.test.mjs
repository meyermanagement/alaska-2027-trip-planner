import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { thinkingFor, runChain } = jiti("../lib/agent/llm.js");
const { effortFor, modelList } = jiti("../lib/agent/providers/openai.js");

const RULE = 'A question about whether something would work -- "could we fit"';

test("per-vendor thinking: OpenAI high (medium effort), Gemini low", () => {
  const t = { openai: "high", gemini: "low" };
  assert.equal(effortFor(thinkingFor(t, "openai")), "medium");
  assert.equal(thinkingFor(t, "gemini"), "low");
  assert.equal(thinkingFor("low", "openai"), "low");
  assert.equal(thinkingFor(null, "gemini"), null);
  assert.equal(thinkingFor({ openai: "high" }, "gemini"), null);
});

test("chat answer and rescue use the per-vendor level", () => {
  const src = readFileSync(new URL("../app/api/chat/route.js", import.meta.url), "utf8");
  assert.match(src, /const ANSWER_THINKING = \{ openai: "high", gemini: "low" \}/);
  assert.equal((src.match(/thinking: ANSWER_THINKING/g) || []).length, 2);
});

test("GPT-6 Luna leads the OpenAI ladder by default", () => {
  if (process.env.OPENAI_MODELS) return;
  assert.deepEqual(modelList().slice(0, 2), ["gpt-6-luna", "gpt-5.6-luna"]);
});

test("Aly and the model check carry the question-first rule", () => {
  for (const f of ["../lib/agent/context.js", "../lib/model-lab/fixtures/household.js"]) {
    assert.ok(readFileSync(new URL(f, import.meta.url), "utf8").includes(RULE), f);
  }
});

test("runChain hands each vendor its own level", async () => {
  const seen = {};
  const fake = (name, fail) => ({
    generate: async (r) => {
      seen[name] = r.thinking;
      if (fail) throw Object.assign(new Error("down"), { status: 503 });
      return { text: "ok", toolCalls: [], usage: [] };
    },
  });
  await runChain(["openai", "gemini"], { openai: fake("openai", true), gemini: fake("gemini") }, {
    thinking: { openai: "high", gemini: "low" }, deadline: Date.now() + 60000, messages: [],
  });
  assert.deepEqual(seen, { openai: "high", gemini: "low" });
});
