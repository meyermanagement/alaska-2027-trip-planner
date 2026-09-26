// The approval gate in front of the MCP route. Invented clients and people only.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { connectionGrant, notServing, NOT_SERVING_CODE } = jiti("../lib/mcp/grant.js");
const { CONSENT_SURFACE_VERSION: V } = jiti("../lib/mcp/consentVersion.js");

function fake({ live = true, liveError = null, clients = [], rows = [], throws = false, registered = {}, regError = null } = {}) {
  return {
    rpc: async (fn, args) => {
      if (throws) throw new Error("network");
      if (fn === "assistant_client_redirects") {
        if (regError) return { data: null, error: regError };
        const r = registered[args.p_client_id];
        return { data: r ? [r] : [], error: null };
      }
      assert.equal(fn, "assistant_connections_enabled");
      return { data: live, error: liveError };
    },
    from(table) {
      const filters = [];
      const q = {
        select() { return q; },
        eq(col, val) { filters.push([col, val]); return q; },
        async maybeSingle() {
          const src = table === "assistant_oauth_clients" ? clients : rows;
          const hit = src.filter((r) => filters.every(([c, v]) => r[c] === v));
          return { data: hit[0] || null, error: null };
        },
      };
      return q;
    },
  };
}
const who = { id: "u-ann", clientId: "c-good" };
const good = { client_id: "c-good", approved_for_consent: true };
const allowed = { user_id: "u-ann", client_id: "c-good", status: "allowed", consent_version: V, revoked_at: null };

test("a browser session token with no client_id is refused", async () => {
  assert.equal((await connectionGrant(fake({ clients: [good], rows: [allowed] }), { id: "u-ann" })).refused, "not-oauth");
});
test("the switch off refuses even a fully approved connection", async () => {
  assert.equal((await connectionGrant(fake({ live: false, clients: [good], rows: [allowed] }), who)).refused, "not-live");
});
test("a switch that cannot be read refuses", async () => {
  const full = { clients: [good], rows: [allowed] };
  assert.equal((await connectionGrant(fake({ ...full, liveError: { message: "x" } }), who)).refused, "unavailable");
  assert.equal((await connectionGrant(fake({ ...full, throws: true }), who)).refused, "unavailable");
});
test("an unknown or unapproved client is refused", async () => {
  assert.equal((await connectionGrant(fake({ rows: [allowed] }), who)).refused, "unknown-client");
  const pending = { ...good, approved_for_consent: false };
  assert.equal((await connectionGrant(fake({ clients: [pending], rows: [allowed] }), who)).refused, "unknown-client");
});
test("no row, denied, revoked, old wording, or another person's row is refused", async () => {
  const cases = [
    [],
    [{ ...allowed, status: "denied" }],
    [{ ...allowed, status: "revoked", revoked_at: "2027-01-01" }],
    [{ ...allowed, revoked_at: "2027-01-01" }],
    [{ ...allowed, consent_version: "2020-01-01" }],
    [{ ...allowed, user_id: "u-bob" }],
    [{ ...allowed, client_id: "c-other" }],
  ];
  for (const rows of cases) {
    assert.equal((await connectionGrant(fake({ clients: [good], rows }), who)).refused, "not-allowed", JSON.stringify(rows));
  }
});
test("switch on, approved client, current allowed row: permitted", async () => {
  assert.deepEqual(await connectionGrant(fake({ clients: [good], rows: [allowed] }), who), { ok: true });
});

test("not-live is reported only for a connection that is otherwise complete", async () => {
  assert.equal((await connectionGrant(fake({ live: false, rows: [allowed] }), who)).refused, "unknown-client");
  assert.equal((await connectionGrant(fake({ live: false, clients: [good] }), who)).refused, "not-allowed");
});
test("not-live is answered as a JSON-RPC error with no auth challenge", async () => {
  const res = notServing({ jsonrpc: "2.0", id: 7, method: "initialize" }, "not-live");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("www-authenticate"), null);
  const body = await res.json();
  assert.equal(body.id, 7);
  assert.equal(body.error.code, NOT_SERVING_CODE);
  assert.match(body.error.message, /aren't turned on yet/);
  assert.equal(notServing({ jsonrpc: "2.0", method: "notifications/initialized" }, "not-live").status, 202);
  const down = notServing({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "unavailable");
  assert.equal(down.status, 503);
  assert.equal(down.headers.get("www-authenticate"), null);
});

// Self-registered clients, judged by where their approvals go.
const dyn = (redirect_uris) => ({ registration_type: "dynamic", redirect_uris });
const dynRow = { user_id: "u-ann", client_id: "c-dyn", status: "allowed", consent_version: V, revoked_at: null };
const dynWho = { id: "u-ann", clientId: "c-dyn" };

test("a self-registered client returning to claude.ai is permitted once allowed", async () => {
  const f = fake({ registered: { "c-dyn": dyn("https://claude.ai/api/mcp/auth_callback") }, rows: [dynRow] });
  assert.deepEqual(await connectionGrant(f, dynWho), { ok: true });
});
test("a fake Claude returning anywhere else is refused, whatever its row says", async () => {
  const lookalikeRow = { client_id: "c-dyn", client_name: "Claude", approved_for_consent: true };
  for (const uris of [
    "https://evil.example/api/mcp/auth_callback",
    "https://claude.ai.evil.example/api/mcp/auth_callback",
    "https://claude.ai/api/mcp/auth_callback,https://evil.example/cb",
    "",
  ]) {
    const f = fake({ registered: { "c-dyn": dyn(uris) }, clients: [lookalikeRow], rows: [dynRow] });
    assert.equal((await connectionGrant(f, dynWho)).refused, "unknown-client", uris);
  }
});
test("a directory row can block a self-registered client but not widen it", async () => {
  const blocked = { client_id: "c-dyn", client_name: "Claude", approved_for_consent: false };
  const f = fake({ registered: { "c-dyn": dyn("https://claude.ai/api/mcp/auth_callback") }, clients: [blocked], rows: [dynRow] });
  assert.equal((await connectionGrant(f, dynWho)).refused, "unknown-client");
});
test("a hand-registered client still needs its row", async () => {
  const manual = { registration_type: "manual", redirect_uris: "https://claude.ai/api/mcp/auth_callback" };
  assert.equal((await connectionGrant(fake({ registered: { "c-good": manual }, rows: [allowed] }), who)).refused, "unknown-client");
  assert.deepEqual(await connectionGrant(fake({ registered: { "c-good": manual }, clients: [good], rows: [allowed] }), who), { ok: true });
});
test("a registration that cannot be read refuses, except a missing function for a hand-registered row", async () => {
  const f = fake({ clients: [good], rows: [allowed], regError: { code: "XX000", message: "x" } });
  assert.equal((await connectionGrant(f, who)).refused, "unavailable");
  const missing = fake({ clients: [good], rows: [allowed], regError: { code: "PGRST202", message: "not found" } });
  assert.deepEqual(await connectionGrant(missing, who), { ok: true });
  const missingNoRow = fake({ rows: [dynRow], regError: { code: "PGRST202", message: "not found" } });
  assert.equal((await connectionGrant(missingNoRow, dynWho)).refused, "unavailable");
});
