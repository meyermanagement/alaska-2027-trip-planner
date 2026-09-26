import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { orderScopes } = await jiti.import("../lib/mcp/scopes.js");

test("ChatGPT's order and Gemini's order read the same", () => {
  const want = ["openid", "profile", "email", "phone", "offline_access"];
  assert.deepEqual(orderScopes("openid email offline_access profile phone".split(" ")), want);
  assert.deepEqual(orderScopes("openid profile email phone offline_access".split(" ")), want);
});

test("unknown scopes go last, duplicates once", () => {
  assert.deepEqual(orderScopes(["custom", "email", "openid", "email"]), ["openid", "email", "custom"]);
});
