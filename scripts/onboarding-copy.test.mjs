import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { ALY_ABILITIES } = await jiti.import("../lib/welcome/alyAbilities.js");
const { NEXT_STEPS, welcomeSummary, proofSourceNote, waitingSentence } = await jiti.import("../lib/welcome/copy.js");
const { SETUP_ITEM_HREF } = await jiti.import("../lib/setup/items.js");
const { PROOF_EVIDENCE_RULE } = await jiti.import("../lib/interview/proofEvidence.js");
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Meet Aly keeps all eight API keys with distinct short claims and questions", () => {
  assert.deepEqual(ALY_ABILITIES.map((a) => a.key), ["build", "budget", "wallet", "onTrip", "packing", "place", "reminders", "tips"]);
  const points = ALY_ABILITIES.flatMap((a) => a.points);
  assert.equal(new Set(points).size, points.length);
  for (const a of ALY_ABILITIES) {
    assert.match(a.ask, /\?$/);
    assert.ok(a.points.length <= 3);
    assert.ok(a.points.every((p) => p.length < 76));
  }
  assert.doesNotMatch(points.join(" "), /30,000|3x|her medicine|every line priced/i);
});

test("next steps have one destination each, with review required for booking changes", () => {
  assert.deepEqual(NEXT_STEPS.map((i) => i.key), Object.keys(SETUP_ITEM_HREF));
  assert.ok(NEXT_STEPS.every((i) => i.points.length <= 2));
  const forwarding = NEXT_STEPS.find((i) => i.key === "forwarding");
  assert.match(forwarding.points.join(" "), /before applying/);
  assert.match(forwarding.leadWithoutAddress, /Inbox/);
  assert.doesNotMatch(JSON.stringify(NEXT_STEPS), /re-file it myself|guess at the rest|chain I steer/);
});

test("welcome summary previews only supplied facts, without invented age or geography", () => {
  assert.deepEqual(welcomeSummary({}), []);
  const rows = welcomeSummary({ familyName: "Solo", address: "Springfield, MO", people: [{ name: "Alex", dob: "1990-01-02" }, { name: " " }], pets: [{ name: "Pip", species: "guinea_pig" }] });
  assert.deepEqual(rows.map((r) => r.text), ["Household: Solo", "Home: Springfield, MO", "Alex (you), born 1990-01-02", "Pip: Guinea pig"]);
  assert.doesNotMatch(JSON.stringify(rows), /saved|nearest|7 PM|next trip|weeks out/i);
});

test("proof attribution distinguishes an empty practice run from saved preferences", () => {
  assert.match(proofSourceNote({ demo: true, data: { standInCustom: false } }), /general suggestions/);
  assert.match(proofSourceNote({ demo: true, data: { preferenceCount: 2 } }), /practice run/);
  assert.match(proofSourceNote({ demo: false, data: { preferenceCount: 10 } }), /preferences you shared/);
  assert.match(proofSourceNote({ demo: false, data: { preferenceCount: 0 } }), /no interview preferences/);
  assert.doesNotMatch(proofSourceNote({ demo: false, data: { preferenceCount: 10 } }), /10|just told/);
});

test("next steps name outstanding work without assumptions about grammar or household size", () => {
  assert.equal(waitingSentence(null), "");
  assert.equal(waitingSentence({ about: [], moments: [] }), "");
  assert.equal(waitingSentence({ about: ["Alex"], moments: ["Sam", "Jo"] }), "About you still to add: Alex. Favorite moments still to add: Sam and Jo.");
});

test("proof evidence rules constrain both the plan and optional comparison", () => {
  assert.match(PROOF_EVIDENCE_RULE, /Never invent/);
  assert.match(PROOF_EVIDENCE_RULE, /do not assume a season or forecast/);
  assert.match(PROOF_EVIDENCE_RULE, /allergies, accessibility needs, and explicit hard limits/);
  assert.equal((source("app/api/interview/proof/route.js").match(/\$\{PROOF_EVIDENCE_RULE\}/g) || []).length, 2);
});

test("welcome and practice actions are labeled for what actually happens", () => {
  const welcome = source("app/welcome/WelcomeForm.js");
  assert.match(welcome, /<form\s+className="space-y-6"\s+onSubmit/);
  assert.match(welcome, /Preview these details/);
  assert.match(welcome, /creates a profile, not a login/);
  assert.match(welcome, /id="welcome-home"/);
  assert.match(source("app/interview/proof/ProofClient.js"), /demo \? "Back to practice"/);
  assert.match(source("app/interview-check/meet-aly/MeetAlyPracticeClient.js"), /continueLabel="Back to practice"/);
  assert.doesNotMatch(source("app/interview-check/page.js"), /title="Four things/);
});
