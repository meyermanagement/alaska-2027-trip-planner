// Claude in the model lab: which names count, what a request looks like, how
// the answer is read back, and that the app itself still cannot route to it.
// No network, and every fixture is made up.
import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root }, moduleCache: false });
const { anthropicCandidate, byNewest } = await jiti.import("../lib/model-lab/catalog.js");
const call = await jiti.import("../lib/model-lab/call.js");
const { priceFor, costOf } = await jiti.import("../lib/model-lab/prices.js");
const { thinkingOffered } = await jiti.import("../lib/model-lab/effort.js");
const { DISCLOSED_PROVIDERS } = await jiti.import("../lib/agent/llm.js");

test("Claude names that count as candidates", () => {
  assert.deepEqual(
    { ...anthropicCandidate("claude-opus-5-5") },
    { id: "claude-opus-5-5", vendor: "anthropic", version: 5.5, tier: "opus", preview: false, dated: false },
  );
  assert.equal(anthropicCandidate("claude-sonnet-5").version, 5);
  assert.equal(anthropicCandidate("claude-haiku-4-5-20251001").dated, true);
  assert.equal(anthropicCandidate("claude-haiku-4-5-20251001").version, 4.5);
  assert.equal(anthropicCandidate("claude-3-5-haiku-20241022"), null);
  assert.equal(anthropicCandidate("claude-sonnet-4"), null);
  assert.equal(anthropicCandidate("gpt-6-sol"), null);
  const order = ["claude-opus-5-5", "claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"]
    .map(anthropicCandidate).sort(byNewest).map((m) => m.id);
  assert.deepEqual(order, ["claude-opus-5-5", "claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5"]);
});

test("vendorOf sends claude- ids to Anthropic", () => {
  assert.equal(call.vendorOf("claude-sonnet-5"), "anthropic");
  assert.equal(call.vendorOf("gpt-6-luna"), "openai");
  assert.equal(call.vendorOf("gemini-3.8-flash"), "gemini");
});

test("no Claude model is offered minimal thinking", () => {
  assert.equal(thinkingOffered("claude-opus-5-5", "minimal"), false);
  assert.equal(thinkingOffered("claude-haiku-4-5", "low"), true);
});

const spec = { system: "Be brief.", messages: [{ role: "user", text: "Hi" }], temperature: 0.2 };

test("adaptive models get effort and no temperature", () => {
  const low = call.anthropicRequest("claude-sonnet-5", { ...spec, thinking: "low" });
  assert.deepEqual(low.thinking, { type: "adaptive" });
  assert.equal(low.output_config.effort, "low");
  assert.equal("temperature" in low, false);
  assert.deepEqual(low.cache_control, { type: "ephemeral" });
  const high = call.anthropicRequest("claude-opus-5-5", { ...spec, thinking: "high" });
  assert.equal(high.output_config.effort, "high");
  assert.ok(high.max_tokens >= 16000);
});

test("Haiku 4.5: no thinking at low, a fixed budget at high", () => {
  const low = call.anthropicRequest("claude-haiku-4-5", { ...spec, thinking: "low" });
  assert.equal(low.thinking, undefined);
  assert.equal(low.output_config, undefined);
  assert.equal(low.temperature, 0.2);
  assert.equal(call.anthropicRequest("claude-haiku-4-5", { ...spec, thinking: "low" }, { sampling: false }).temperature, undefined);
  const high = call.anthropicRequest("claude-haiku-4-5", { ...spec, thinking: "high" });
  assert.deepEqual(high.thinking, { type: "enabled", budget_tokens: 4096 });
  assert.ok(high.max_tokens > 4096);
  assert.equal("temperature" in high, false);
});

test("web search, JSON schema, and the JSON-only instruction", () => {
  const grounded = call.anthropicRequest("claude-sonnet-5", { ...spec, grounded: true });
  assert.equal(grounded.tools.at(-1).type, "web_search_20250305");
  const schema = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };
  const typed = call.anthropicRequest("claude-sonnet-5", { ...spec, json: { schema } });
  assert.equal(typed.output_config.format.type, "json_schema");
  assert.equal(typed.output_config.format.schema.additionalProperties, false);
  assert.equal(typed.output_config.effort, "low");
  const loose = call.anthropicRequest("claude-sonnet-5", { parts: [{ text: "x" }], json: {} });
  assert.match(loose.system, /single JSON object/);
});

test("image and PDF parts become content blocks", () => {
  const body = call.anthropicRequest("claude-sonnet-5", {
    system: "Read it.",
    parts: [
      { text: "Read this." },
      { inlineData: { mimeType: "image/png", data: "AAAA" } },
      { inlineData: { mimeType: "application/pdf", data: "BBBB" } },
      { inlineData: { mimeType: "text/csv", data: "CCCC" } },
    ],
  });
  const kinds = body.messages[0].content.map((c) => c.type);
  assert.deepEqual(kinds, ["text", "image", "document"]);
  assert.equal(body.messages[0].content[2].source.media_type, "application/pdf");
});

test("usage and sources read from a made-up response", () => {
  const fixture = {
    content: [
      { type: "server_tool_use", name: "web_search" },
      { type: "web_search_tool_result", content: [
        { type: "web_search_result", url: "https://example.com/a", title: "A" },
        { type: "web_search_result", url: "https://example.com/b", title: "B" },
      ] },
      { type: "text", text: "Answer.", citations: [{ type: "web_search_result_location", url: "https://example.com/b", title: "B", cited_text: "x" }] },
    ],
    usage: {
      input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 50,
      output_tokens: 40, output_tokens_details: { thinking_tokens: 25 },
      server_tool_use: { web_search_requests: 2 },
    },
  };
  assert.deepEqual(call.anthropicSources(fixture).map((s) => s.url), ["https://example.com/b", "https://example.com/a"]);
  assert.deepEqual(call.anthropicUsage(fixture.usage), {
    inputTokens: 1050, cachedTokens: 900, cacheWriteTokens: 50, outputTokens: 40, reasoningTokens: 25, searches: 2,
  });
});

test("Claude prices, with cache writes at 1.25 times input", () => {
  const p = priceFor("claude-sonnet-5");
  assert.equal(p.input, 2);
  assert.equal(p.write, 2.5);
  const cost = costOf({ inputTokens: 1_000_000, cachedTokens: 0, cacheWriteTokens: 1_000_000, outputTokens: 0 }, p);
  assert.equal(cost, 2.5);
  // Vendors without a write price are unchanged.
  const g = priceFor("gemini-3.6-flash");
  assert.equal(costOf({ inputTokens: 1_000_000, cacheWriteTokens: 1_000_000, outputTokens: 0 }, g), 1.5);
});

test("the app itself still cannot route to Anthropic", () => {
  assert.equal(DISCLOSED_PROVIDERS.includes("anthropic"), false);
});

test("callModel drops a refused temperature and retries once", async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push({ url, headers: init.headers, body });
    if ("temperature" in body)
      return new Response(JSON.stringify({ error: { message: "temperature is not supported on this model" } }), { status: 400 });
    return new Response(JSON.stringify({ content: [{ type: "text", text: "OK" }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 1 } }), { status: 200 });
  };
  try {
    const r = await call.callModel("claude-haiku-4-5", { ...spec, thinking: "low" });
    assert.equal(r.ok, true);
    assert.equal(r.text, "OK");
    assert.equal(seen.length, 2);
    assert.equal(seen[0].url, "https://api.anthropic.com/v1/messages");
    assert.equal(seen[0].headers["anthropic-version"], "2023-06-01");
    assert.equal("temperature" in seen[1].body, false);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
});

test("a missing key is a clear result, not a throw", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const r = await call.callModel("claude-sonnet-5", spec);
  assert.equal(r.ok, false);
  assert.equal(r.error, "ANTHROPIC_API_KEY is not set");
});
