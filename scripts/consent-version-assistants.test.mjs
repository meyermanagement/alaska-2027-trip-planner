// The 2026-09-26 bump: the app constants and the database function move together.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { AGREEMENT_VERSION, PRIVACY_VERSION } = jiti("../lib/beta/agreement.js");
const { ASSISTANTS_SECTION, AI_SECTION } = jiti("../lib/privacy.js");
const migration = readFileSync(new URL("../supabase/migrations/20261026_consent_version_assistants.sql", import.meta.url), "utf8");

test("both app versions equal the one the database checks", () => {
  assert.equal(AGREEMENT_VERSION, "2026-09-26");
  assert.equal(PRIVACY_VERSION, "2026-09-26");
  assert.match(migration, /select '2026-09-26'::text/);
});

test("the policy names all three assistants and the redactions", () => {
  for (const name of ["Claude", "ChatGPT", "Gemini"]) assert.match(ASSISTANTS_SECTION.body, new RegExp(name));
  assert.ok(ASSISTANTS_SECTION.points.some((p) => /health or allergy/.test(p)));
  assert.match(AI_SECTION.body, /assistant you connect yourself/);
});
