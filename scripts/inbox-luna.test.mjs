// Forwarded booking email read by GPT-5.6 Luna first, Gemini behind it, and
// the consent text saying so. No network: fetch is replaced.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root }, moduleCache: false });
const openai = await jiti.import("../lib/agent/providers/openai.js");
const parser = await jiti.import("../lib/inbox/parser.js");
const agreement = await jiti.import("../lib/beta/agreement.js");
const privacy = await jiti.import("../lib/privacy.js");

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { return fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

test("Luna reads first, with the Gemini ladder behind it", () => {
  withEnv({ OPENAI_API_KEY: "x", GEMINI_API_KEY: "y", INBOX_PROVIDER: undefined, GEMINI_TEXT_MODELS: undefined }, () =>
    assert.deepEqual(parser.modelList(), ["gpt-5.6-luna", "gemini-3.1-pro-preview", "gemini-3.6-flash"]));
});

test("a GEMINI_TEXT_MODELS setting cannot drop Luna", () => {
  withEnv({ OPENAI_API_KEY: "x", GEMINI_API_KEY: "y", INBOX_PROVIDER: undefined, GEMINI_TEXT_MODELS: "gemini-3.6-flash" }, () =>
    assert.deepEqual(parser.modelList(), ["gpt-5.6-luna", "gemini-3.6-flash"]));
});

test("INBOX_PROVIDER=gemini is the way back", () => {
  withEnv({ OPENAI_API_KEY: "x", GEMINI_API_KEY: "y", INBOX_PROVIDER: "gemini", GEMINI_TEXT_MODELS: undefined }, () =>
    assert.deepEqual(parser.modelList(), ["gemini-3.1-pro-preview", "gemini-3.6-flash"]));
});

test("a missing key drops that vendor's rungs instead of failing every read", () => {
  withEnv({ OPENAI_API_KEY: undefined, GEMINI_API_KEY: "y", INBOX_PROVIDER: undefined, GEMINI_TEXT_MODELS: undefined }, () =>
    assert.deepEqual(parser.modelList(), ["gemini-3.1-pro-preview", "gemini-3.6-flash"]));
  withEnv({ OPENAI_API_KEY: "x", GEMINI_API_KEY: undefined }, () =>
    assert.deepEqual(parser.modelList(), ["gpt-5.6-luna"]));
});

// The parser's own schema, read from the file rather than copied, so a change
// there is tested here.
const src = readFileSync(new URL("../lib/inbox/parser.js", import.meta.url), "utf8");
const RESPONSE_SCHEMA = (0, eval)("(" + src.match(/const RESPONSE_SCHEMA = (\{[\s\S]*?\n\});/)[1] + ")");

function everyObject(s, fn) {
  if (!s || typeof s !== "object") return;
  if (s.type === "object" || (Array.isArray(s.type) && s.type.includes("object"))) fn(s);
  for (const v of Object.values(s.properties || {})) everyObject(v, fn);
  if (s.items) everyObject(s.items, fn);
}

test("the email schema becomes a valid strict schema", () => {
  const strict = openai.strictSchema(RESPONSE_SCHEMA);
  let objects = 0;
  everyObject(strict, (o) => {
    objects += 1;
    assert.equal(o.additionalProperties, false);
    assert.deepEqual([...o.required].sort(), Object.keys(o.properties).sort());
  });
  assert.ok(objects >= 2);
  assert.deepEqual(strict.properties.kind.type, "string");
  // An optional field in Gemini's dialect is nullable in OpenAI's.
  const optional = Object.keys(RESPONSE_SCHEMA.properties).find((k) => !RESPONSE_SCHEMA.required.includes(k));
  assert.ok(strict.properties[optional].type.includes("null"));
});

test("readJson sends store:false, low reasoning, attachments, and records OpenAI spend", async () => {
  const real = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
    return new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: '{"kind":"booking","passenger_names":[],"items":[]}' }] }],
      usage: { input_tokens: 900, output_tokens: 60, output_tokens_details: { reasoning_tokens: 10 } },
    }), { status: 200 });
  };
  const spend = [];
  try {
    const out = await withEnv({ OPENAI_API_KEY: "k" }, () => openai.readJson({
      model: "gpt-5.6-luna",
      schema: RESPONSE_SCHEMA,
      parts: [{ text: "P" }, { inlineData: { mimeType: "application/pdf", data: "AAA" } }, { inlineData: { mimeType: "image/png", data: "BBB" } }],
      spend,
    }));
    assert.equal(out.kind, "booking");
  } finally { globalThis.fetch = real; }
  assert.match(sent.url, /\/responses$/);
  assert.equal(sent.auth, "Bearer k");
  assert.equal(sent.body.store, false);
  assert.deepEqual(sent.body.reasoning, { effort: "low" });
  assert.equal(sent.body.text.format.strict, true);
  assert.deepEqual(sent.body.input[0].content.map((c) => c.type), ["input_text", "input_file", "input_image"]);
  assert.equal(spend[0].provider, "openai");
  assert.equal(spend[0].thoughtsTokens, 10);
  assert.equal(spend[0].candidatesTokens, 50);
});

test("a bad answer is a 422 so the ladder moves on", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "nope" }] }] }), { status: 200 });
  try {
    await withEnv({ OPENAI_API_KEY: "k" }, () => assert.rejects(
      openai.readJson({ model: "gpt-5.6-luna", schema: RESPONSE_SCHEMA, parts: [{ text: "P" }] }),
      (e) => e.status === 422));
  } finally { globalThis.fetch = real; }
});

test("the consent and privacy text name OpenAI for forwarded email and Google for the rest", () => {
  const term = agreement.AI_DISCLOSURE.terms[0];
  assert.match(term, /forwarded booking email are handled by the OpenAI API/);
  assert.match(term, /Google Gemini API, including web lookups, reading documents, fare alerts/);
  const text = JSON.stringify(privacy);
  assert.doesNotMatch(text, /reading documents and forwarded email/);
});
