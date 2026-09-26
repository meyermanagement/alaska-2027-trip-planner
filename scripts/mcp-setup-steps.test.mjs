// The setup steps Settings shows for each assistant.
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const s = jiti("../lib/mcp/setupSteps.js");
const d = jiti("../lib/mcp/discovery.js");
const t = jiti("../lib/mcp/trust.js");

test("the address is production's own resource, not a preview's", () => {
  const m = d.protectedResourceMetadata("https://www.alyeska.app", { NEXT_PUBLIC_SUPABASE_URL: "https://example-project.supabase.co" });
  assert.equal(s.MCP_ADDRESS, m.resource);
});

test("every trusted assistant a person can add has steps, and nothing else does", () => {
  const trusted = t.TRUSTED_ASSISTANTS.filter((a) => !a.manualOnly).map((a) => a.key).sort();
  assert.deepEqual(s.ASSISTANT_SETUP.map((a) => a.key).sort(), trusted);
});

test("each entry names its plans and ends at the Alyeska approval", () => {
  for (const a of s.ASSISTANT_SETUP) {
    assert.ok(a.name && a.plans && a.steps.length >= 3, a.key);
    assert.match(a.steps.join(" "), /paste the address/i, a.key);
    assert.match(a.steps.at(-1) + a.steps.at(-2), /sign in to Alyeska/i, a.key);
  }
});
