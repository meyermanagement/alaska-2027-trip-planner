// Protected resource metadata and the Bearer challenge. Invented hosts only.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const d = jiti("../lib/mcp/discovery.js");
const env = { NEXT_PUBLIC_SUPABASE_URL: "https://example-project.supabase.co/" };

test("the document names this host's endpoint and the Supabase issuer", () => {
  const m = d.protectedResourceMetadata("https://app.example.test", env);
  assert.equal(m.resource, "https://app.example.test/api/mcp");
  assert.deepEqual(m.authorization_servers, ["https://example-project.supabase.co/auth/v1"]);
  assert.deepEqual(m.bearer_methods_supported, ["header"]);
  assert.ok(!("scopes_supported" in m) || !m.scopes_supported.includes("offline_access"));
});
test("stray whitespace in the setting does not reach the issuer", () => {
  const m = d.protectedResourceMetadata("https://app.example.test", { NEXT_PUBLIC_SUPABASE_URL: " https://example-project.supabase.co\n" });
  assert.deepEqual(m.authorization_servers, ["https://example-project.supabase.co/auth/v1"]);
  assert.equal(d.protectedResourceMetadata("https://app.example.test", { NEXT_PUBLIC_SUPABASE_URL: "  \n" }), null);
});
test("no Supabase URL, no document", () => {
  assert.equal(d.protectedResourceMetadata("https://app.example.test", {}), null);
});
test("the challenge points at the path-inserted document", () => {
  assert.equal(d.bearerChallenge("https://app.example.test"),
    'Bearer realm="alyeska-mcp", resource_metadata="https://app.example.test/.well-known/oauth-protected-resource/api/mcp"');
  assert.match(d.bearerChallenge("https://app.example.test", "invalid_token"), /, error="invalid_token"$/);
});
test("both well-known paths answer the same JSON, publicly", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
  const a = jiti("../app/.well-known/oauth-protected-resource/route.js");
  const b = jiti("../app/.well-known/oauth-protected-resource/api/mcp/route.js");
  const ra = a.GET(new Request("https://app.example.test/.well-known/oauth-protected-resource"));
  const rb = b.GET(new Request("https://app.example.test/.well-known/oauth-protected-resource/api/mcp"));
  assert.equal(ra.status, 200);
  assert.equal(ra.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(await ra.json(), await rb.json());
});
