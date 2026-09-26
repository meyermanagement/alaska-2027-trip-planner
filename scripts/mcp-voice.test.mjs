import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { handleMessage } = await jiti.import("../lib/mcp/protocol.js");
const { TOOLS } = await jiti.import("../lib/mcp/tools.js");
const { isWriteTool } = await jiti.import("../lib/mcp/confirm.js");
const { VOICE_TOOLS, voiceResult } = await jiti.import("../lib/mcp/voice.js");
const { assistantForClient, surfaceFor } = await jiti.import("../lib/mcp/trust.js");

const call = (method, params, opts = {}) =>
  handleMessage({ jsonrpc: "2.0", id: 1, method, params }, { surface: "voice", getScope: async () => { throw new Error("no read expected"); }, ...opts });

test("every voice tool exists and is read-only", () => {
  for (const name of VOICE_TOOLS) {
    const tool = TOOLS.find((t) => t.name === name);
    assert.ok(tool, name);
    assert.equal(isWriteTool(tool), false, name);
  }
});

test("voice lists only the voice tools, and no confirm field", async () => {
  const { body } = await call("tools/list", {});
  const names = body.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, [...VOICE_TOOLS].sort());
  for (const t of body.result.tools) assert.equal("confirm" in (t.inputSchema.properties || {}), false);
  for (const held of ["get_budget", "get_wallet", "get_insurance", "get_expiration_dates", "get_fare_alerts"]) assert.ok(!names.includes(held), held);
});

test("the full surface is unchanged", async () => {
  const { body } = await call("tools/list", {}, { surface: "full" });
  assert.equal(body.result.tools.length, TOOLS.length);
});

test("held-back and write tools are refused before anything is read", async () => {
  for (const name of ["get_budget", "get_wallet", "check_off_packing_item", "create_trip"]) {
    const { body } = await call("tools/call", { name, arguments: { trip: "Alaska" } });
    assert.equal(body.result.isError, true, name);
    assert.match(body.result.content[0].text, /Alyeska app/);
  }
});

test("voice initialize says read-only", async () => {
  const { body } = await call("initialize", { protocolVersion: "2025-03-26", clientInfo: { name: "Alexa+ MCP Client" } });
  assert.equal(body.result.protocolVersion, "2025-03-26");
  assert.match(body.result.instructions, /^Read-only/);
});

test("deadlines keep booking windows only", () => {
  const r = voiceResult("get_deadlines", {
    summary: "3 upcoming deadlines: 2026-10-01 Denali train; 2026-10-03 STL to ANC at 412 USD; 2026-10-09 Sapphire offer ends.",
    deadlines: [
      { kind: "booking window", what: "Denali train", trip: "Alaska 2027", date: "2026-10-01" },
      { kind: "fare", what: "STL to ANC at 412 USD", date: "2026-10-03" },
      { kind: "card offer", what: "Sapphire offer ends", date: "2026-10-09" },
    ],
  });
  assert.equal(r.deadlines.length, 1);
  assert.doesNotMatch(r.summary, /USD|Sapphire|412/);
});

test("pets lose their record dates, bucket list its fare ceiling, money preferences drop", () => {
  const pets = voiceResult("get_pets", { summary: "1 pet: Biscuit (dog).", pets: [{ name: "Biscuit", rabies_expires: "2027-01-01", health_certificate_expires: "2026-12-01", coggins_expires: null }] });
  assert.deepEqual(Object.keys(pets.pets[0]), ["name"]);
  const places = voiceResult("get_bucket_list", { summary: "1 place", places: [{ place: "Iceland", fare_ceiling: "$600", watching_fares: true }] });
  assert.deepEqual(places.places[0], { place: "Iceland" });
  const prefs = voiceResult("get_preferences", { summary: "2 preferences: Aisle seats | Cap hotels at $300", preferences: [{ preference: "Aisle seats", topics: ["Getting around"] }, { preference: "Cap hotels at $300", topics: ["Money"] }] });
  assert.equal(prefs.preferences.length, 1);
  assert.doesNotMatch(prefs.summary, /\$300/);
});

test("Alexa addresses only count for a hand-registered client", () => {
  const uris = ["https://pitangui.amazon.com/api/skill/link/M3IHEJ1OZMSGZ3", "https://layla.amazon.com/api/skill/link/M3IHEJ1OZMSGZ3"];
  assert.equal(assistantForClient(uris), null);
  assert.equal(assistantForClient(uris, { manual: true }).key, "alexa");
  assert.equal(assistantForClient(["https://pitangui.amazon.com.evil.test/api/skill/link/M3IHEJ1OZMSGZ3"], { manual: true }), null);
});

test("surface: Alexa addresses or an Alexa name mean voice", () => {
  assert.equal(surfaceFor({ assistant: "alexa" }), "voice");
  assert.equal(surfaceFor({ client_name: "Alexa+", source: "registered" }), "voice");
  assert.equal(surfaceFor({ client_name: "Claude", source: "registered" }), "full");
  assert.equal(surfaceFor({ assistant: "chatgpt", client_name: "ChatGPT" }), "full");
});
