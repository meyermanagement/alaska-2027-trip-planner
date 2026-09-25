// The approval gate in front of the MCP route. Invented clients and people only.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { connectionGrant } = jiti("../lib/mcp/grant.js");
const { CONSENT_SURFACE_VERSION: V } = jiti("../lib/mcp/consentVersion.js");

function fake({ live = true, liveError = null, clients = [], rows = [], throws = false } = {}) {
  return {
    rpc: async (fn) => {
      if (throws) throw new Error("network");
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
  assert.equal((await connectionGrant(fake({ liveError: { message: "x" } }), who)).refused, "unavailable");
  assert.equal((await connectionGrant(fake({ throws: true }), who)).refused, "unavailable");
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
