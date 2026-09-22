import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jiti = require("jiti")(process.cwd(), { interopDefault: true, esmResolve: true });
const { coverTint, coverToken, COVER_GROUND_COUNT } = jiti("../lib/covers/tint.js");

test("five grounds, and each is a gradient", () => {
  assert.equal(COVER_GROUND_COUNT, 5);
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) {
    const g = coverTint(`trip-${i}`);
    assert.match(g, /^linear-gradient\(158deg, /);
    seen.add(g);
  }
  assert.equal(seen.size, 5);
});

test("the grounds are cool only: no amber, no rose", () => {
  // Amber and rose are the app's warning and money colors. A ground in either
  // one both clashed with every skin's cool furniture and spent a state color
  // on decoration.
  const all = new Set();
  for (let i = 0; i < 400; i += 1) all.add(coverToken(`trip-${i}`));
  assert.equal(all.size, 5);
  for (const token of all) {
    assert.doesNotMatch(token, /--color-amber|--color-rose/);
    assert.match(token, /--color-teal|--color-glacier|--color-plum/);
  }
});

test("the same trip always gets the same ground, by id", () => {
  const trip = { id: "0d1f2e3a", name: "Alaska" };
  assert.equal(coverToken(trip), coverToken("0d1f2e3a"));
  assert.equal(coverTint(trip), coverTint({ id: "0d1f2e3a", name: "renamed" }));
});

test("a trip with nothing to hash still gets a ground", () => {
  for (const arg of [null, undefined, {}, ""]) {
    assert.match(coverTint(arg), /^linear-gradient/);
    assert.ok(coverToken(arg));
  }
});
