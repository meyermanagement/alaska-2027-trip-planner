import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { isAlexaClient } = await jiti.import("../lib/mcp/discovery.js");
const { SUPPORTED_VERSIONS } = await jiti.import("../lib/mcp/protocol.js");

const req = (ua = "") => new Request("https://www.alyeska.app/api/mcp", { method: "POST", headers: { "user-agent": ua } });
const init = (name) => ({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", clientInfo: { name, version: "1.0.0" } } });

test("Alexa+ initialize is recognized by its clientInfo name", () => {
  assert.equal(isAlexaClient(init("Alexa+ MCP Client"), req()), true);
});

test("other assistants keep the challenge header", () => {
  for (const name of ["claude-ai", "ChatGPT", "Gemini", "Alexa", "My Alexa+ clone"]) {
    assert.equal(isAlexaClient(init(name), req()), false, name);
  }
  assert.equal(isAlexaClient(null, req("Mozilla/5.0")), false);
});

test("the version Alexa+ sends is accepted", () => {
  assert.ok(SUPPORTED_VERSIONS.includes("2025-03-26"));
});
