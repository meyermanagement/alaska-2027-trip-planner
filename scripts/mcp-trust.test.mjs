// Trusting self-registered clients by where their approvals go
// (lib/mcp/trust.js). Invented addresses only.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { assistantForRedirect, assistantForClient, parseRedirectUris } = jiti("../lib/mcp/trust.js");
const { sameRedirect } = jiti("../lib/mcp/assistantClients.js");

const key = (u) => assistantForRedirect(u)?.key || null;

test("each assistant's own return addresses are recognized", () => {
  assert.equal(key("https://claude.ai/api/mcp/auth_callback"), "claude");
  assert.equal(key("https://claude.com/api/mcp/auth_callback"), "claude");
  assert.equal(key("https://chatgpt.com/connector_platform_oauth_redirect"), "chatgpt");
  assert.equal(key("https://chatgpt.com/connector/oauth/abc123XYZ"), "chatgpt");
  assert.equal(key("https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-107303354335300565420-www_alyeska_app"), "gemini");
  assert.equal(key("https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-107303354335300565420-alaska-2027-trip-planner_vercel_app"), "gemini");
  assert.equal(key("https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-107303354335300565420-alaska_2027_trip_planner_vercel_app"), "gemini");
});

test("a Google redirect is Gemini only when it is a Gemini connection to Alyeska", () => {
  for (const u of [
    // Any Google developer can own /r/<their project id>.
    "https://oauth-redirect.googleusercontent.com/r/attacker-project",
    "https://oauth-redirect.googleusercontent.com/r/user-bound-custom-mcp-1073033543-www-alyeska-app",
    // A Gemini connection to somebody else's server.
    "https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-107303354335300565420-mcp_squareup_com",
    "https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-107303354335300565420-www_alyeska_app_evil_com",
    "https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-abc-www_alyeska_app",
    "https://oauth-redirect.googleusercontent.com/r/user_bound_custom-mcp-107303354335300565420-www_alyeska_app/x",
    "https://oauth-redirect-sandbox.googleusercontent.com/r/user_bound_custom-mcp-107303354335300565420-www_alyeska_app",
  ]) {
    assert.equal(key(u), null, u);
  }
});

test("a fake Claude is refused: lookalike hosts, subdomains, and other paths", () => {
  for (const u of [
    "https://evil.example/api/mcp/auth_callback",
    "https://claude.ai.evil.example/api/mcp/auth_callback",
    "https://evil-claude.ai/api/mcp/auth_callback",
    "https://api.claude.ai/api/mcp/auth_callback",
    "https://claude.ai/api/mcp/auth_callback/extra",
    "https://claude.ai/api/mcp/auth_callbackx",
    "https://claude.ai/api/mcp/",
    "https://claude.ai/",
    "https://chatgpt.com.evil.example/connector_platform_oauth_redirect",
    "https://chatgpt.com/connector/oauth/",
    "https://evil.googleusercontent.com/r/x",
    "https://oauth-redirect.googleusercontent.com/r/",
  ]) {
    assert.equal(key(u), null, u);
  }
});

test("unusual forms are refused rather than normalized", () => {
  for (const u of [
    "http://claude.ai/api/mcp/auth_callback",
    "https://claude.ai:443/api/mcp/auth_callback",
    "https://claude.ai:8443/api/mcp/auth_callback",
    "https://user@claude.ai/api/mcp/auth_callback",
    "https://user:pw@claude.ai/api/mcp/auth_callback",
    "https://claude.ai/api/mcp/auth_callback?next=https://evil.example",
    "https://claude.ai/api/mcp/auth_callback#x",
    "https://CLAUDE.AI/api/mcp/auth_callback",
    "https://claude.ai/api/mcp/x/../auth_callback",
    "https://claude.ai/api/mcp/./auth_callback",
    "https://claude.ai/api/mcp/auth_callback%2F..%2F",
    "https://chatgpt.com/connector/oauth/..%2Fevil",
    "https://chatgpt.com/connector/oauth/../../evil",
    "https://claude.ai\\@evil.example/api/mcp/auth_callback",
    " https://claude.ai/api/mcp/auth_callback",
    "javascript:alert(1)",
    "",
    null,
    42,
  ]) {
    assert.equal(key(u), null, String(u));
  }
});

test("a client is trusted only if every registered address is one assistant's", () => {
  assert.equal(assistantForClient("https://claude.ai/api/mcp/auth_callback")?.key, "claude");
  assert.equal(assistantForClient("https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback")?.key, "claude");
  assert.equal(assistantForClient(["https://claude.ai/api/mcp/auth_callback"])?.key, "claude");
  // One stray address sinks the whole client.
  assert.equal(assistantForClient("https://claude.ai/api/mcp/auth_callback,https://evil.example/cb"), null);
  assert.equal(assistantForClient("https://claude.ai/api/mcp/auth_callback,http://localhost:3000/callback"), null);
  // Two assistants' addresses on one client is not either of them.
  assert.equal(assistantForClient("https://claude.ai/api/mcp/auth_callback,https://chatgpt.com/connector_platform_oauth_redirect"), null);
  assert.equal(assistantForClient(""), null);
  assert.equal(assistantForClient([]), null);
  assert.equal(assistantForClient(null), null);
});

test("the name and purpose come from the list, not from the client", () => {
  const a = assistantForClient("https://chatgpt.com/connector_platform_oauth_redirect");
  assert.equal(a.name, "ChatGPT");
  assert.match(a.purpose, /so ChatGPT can answer/);
  assert.doesNotMatch(a.purpose, /NAME/);
});

test("registered addresses are read from Supabase's text column or an array", () => {
  assert.deepEqual(parseRedirectUris("https://a.example/x, https://b.example/y"), ["https://a.example/x", "https://b.example/y"]);
  assert.deepEqual(parseRedirectUris(["https://a.example/x", "", 3]), ["https://a.example/x"]);
  assert.deepEqual(parseRedirectUris(undefined), []);
});

test("a remembered approval is matched to a dynamic client only by its own addresses", () => {
  const dyn = { client_id: "c-dyn", source: "dynamic", redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"] };
  assert.equal(sameRedirect(dyn, "https://chatgpt.com/connector_platform_oauth_redirect?code=x&state=y"), true);
  assert.equal(sameRedirect(dyn, "https://claude.ai/api/mcp/auth_callback?code=x"), false);
  assert.equal(sameRedirect(dyn, "https://evil.example/connector_platform_oauth_redirect?code=x"), false);
  // The hand-registered Claude client keeps working by id.
  assert.equal(sameRedirect("a53e5071-421c-41e6-a40e-040ae4592331", "https://claude.ai/api/mcp/auth_callback?code=x"), true);
});
