// Ask Aly's plain answers on GPT-5.6 Luna, everything else on Gemini, and the
// consent text saying the same split. No network: fetch is replaced.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root }, moduleCache: false });
const openai = await jiti.import("../lib/agent/providers/openai.js");
const llm = await jiti.import("../lib/agent/llm.js");
const agreement = await jiti.import("../lib/beta/agreement.js");
const privacy = await jiti.import("../lib/privacy.js");

const TOOLS = [
  { name: "add_item", description: "Add", parameters: { type: "object", properties: {} } },
  { name: "show_places", description: "Show", parameters: { type: "object", properties: {} } },
];

test("the request uses Responses, low reasoning, and store:false", () => {
  const body = openai.buildRequest({
    system: "SYS",
    messages: [{ role: "user", text: "Q", notes: ["NOTE"] }],
    tools: TOOLS,
    thinking: "low",
  });
  assert.equal(body.store, false);
  assert.deepEqual(body.reasoning, { effort: "low" });
  assert.equal(body.input[0].role, "developer");
  assert.match(body.input[1].content, /Q[\s\S]*NOTE/);
  assert.equal(body.tools[0].type, "function");
  assert.equal(body.tool_choice, "auto");
  assert.equal("temperature" in body, false);
});

test("allowed tools narrow the choice the way Gemini's VALIDATED does", () => {
  assert.equal(openai.toolChoice(TOOLS, []), "none");
  assert.deepEqual(openai.toolChoice(TOOLS, ["show_places", "nope"]), {
    type: "allowed_tools",
    mode: "auto",
    tools: [{ type: "function", name: "show_places" }],
  });
});

test("output and usage parse into the shared shape", () => {
  const parsed = openai.parseResponse({
    status: "completed",
    output: [
      { type: "reasoning" },
      { type: "message", content: [{ type: "output_text", text: " Hello " }] },
      { type: "function_call", name: "add_item", arguments: '{"title":"x"}' },
    ],
  });
  assert.equal(parsed.text, "Hello");
  assert.deepEqual(parsed.calls, [{ name: "add_item", args: { title: "x" } }]);
  const u = openai.usageFrom({
    input_tokens: 1000,
    input_tokens_details: { cached_tokens: 800 },
    output_tokens: 300,
    output_tokens_details: { reasoning_tokens: 100 },
    total_tokens: 1300,
  });
  assert.equal(u.promptTokens, 1000);
  assert.equal(u.cachedTokens, 800);
  assert.equal(u.candidatesTokens, 200);
  assert.equal(u.thoughtsTokens, 100);
});

test("generate returns usage and falls through a 429 to the error", async () => {
  process.env.OPENAI_API_KEY = "test";
  const real = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return new Response(
      JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "Hi" }] }],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
  try {
    const r = await openai.generate({ system: "S", messages: [{ role: "user", text: "Q" }], tools: [] });
    assert.equal(r.text, "Hi");
    assert.equal(r.model, "gpt-6-luna");
    assert.equal(r.usage[0].provider, "openai");
    assert.match(sent[0].url, /\/responses$/);
    assert.equal(sent[0].body.store, false);

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { message: "Rate limit" } }), { status: 429 });
    await assert.rejects(
      openai.generate({ system: "S", messages: [{ role: "user", text: "Q" }], tools: [] }),
      (err) => err.status === 429 && err.usage?.length === 2,
    );
  } finally {
    globalThis.fetch = real;
  }
});

test("routing: plain Ask Aly to OpenAI with Gemini behind it, everything else to Gemini", () => {
  delete process.env.ASSISTANT_PROVIDER;
  assert.deepEqual(llm.chainFor({ feature: "chat.answer" }), ["openai", "gemini"]);
  assert.deepEqual(llm.chainFor({ feature: "chat.answer", grounded: true }), ["gemini"]);
  assert.deepEqual(llm.chainFor({ feature: "chat.finish", models: ["gpt-5.6-luna"] }), ["openai"]);
  assert.deepEqual(llm.chainFor({ feature: "chat.finish", models: ["gemini-3.7-flash"] }), ["gemini"]);
  for (const feature of ["tips.location", "inbox.parse", "documents.read", "day.brief", null])
    assert.deepEqual(llm.chainFor({ feature }), ["gemini"], String(feature));
  process.env.ASSISTANT_PROVIDER = "gemini";
  assert.deepEqual(llm.chainFor({ feature: "chat.answer" }), ["gemini"]);
  process.env.ASSISTANT_PROVIDER = "anthropic";
  assert.deepEqual(llm.chainFor({ feature: "chat.answer" }), ["openai", "gemini"]);
  delete process.env.ASSISTANT_PROVIDER;
});

test("an undisclosed provider in the environment is still ignored", () => {
  process.env.LLM_PROVIDERS = "anthropic,openai";
  assert.deepEqual(llm.undisclosedProviders(), ["anthropic"]);
  delete process.env.LLM_PROVIDERS;
});

test("the consent text names both providers and their split", () => {
  assert.equal(agreement.AI_PROVIDER, "OpenAI API and Google Gemini API");
  const terms = agreement.AI_DISCLOSURE.terms.join(" ");
  assert.match(terms, /OpenAI API/);
  assert.match(terms, /Google Gemini API/);
  assert.doesNotMatch(terms, /OpenAI[^.]*United States/, "no US claim for OpenAI");
  const docs = agreement.OPTIONAL_FEATURES.find((f) => f.id === "documents");
  assert.match(docs.detail, /Google Gemini API/);
  const names = privacy.PROCESSORS.map((p) => p.name);
  assert.ok(names.includes("OpenAI API") && names.includes("Google Gemini API"));
});

test("the chat route still marks every call as a chat feature", () => {
  const route = readFileSync(new URL("../app/api/chat/route.js", import.meta.url), "utf8");
  assert.match(route, /feature: "chat\.answer"/);
});
