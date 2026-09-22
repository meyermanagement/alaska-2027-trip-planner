import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const jiti = require("jiti")(process.cwd(), { interopDefault: true, esmResolve: true });
const { coverTint, coverToken } = jiti("../lib/covers/tint.js");

test("one ground, and it is a gradient", () => {
  // Five grounds by trip id were strong enough to repaint the photograph, which
  // is the thing a family recognises a trip by. One ground, per skin, and the
  // color in a cover comes from the picture.
  const seen = new Set();
  for (let i = 0; i < 400; i += 1) {
    const g = coverTint(`trip-${i}`);
    assert.match(g, /^linear-gradient\(158deg, /);
    seen.add(g);
  }
  assert.equal(seen.size, 1);
});

test("the ground is a token, so each skin supplies its own value", () => {
  // Not a hex. A skin that changes glacier changes the covers with it, and
  // --trip-ground is the hook for a skin that wants its own.
  const token = coverToken("anything");
  assert.match(token, /var\(--trip-ground, var\(--color-glacier\)\)/);
  assert.doesNotMatch(token, /#[0-9a-f]{3}/i);
  // Amber and rose are the app's warning and money colors; a ground in either
  // spent a state color on decoration.
  assert.doesNotMatch(token, /--color-amber|--color-rose/);
});

test("every trip gets the same ground, whatever it is keyed by", () => {
  const trip = { id: "0d1f2e3a", name: "Alaska" };
  assert.equal(coverToken(trip), coverToken("something-else"));
  assert.equal(coverTint(trip), coverTint({ id: "other", name: "renamed" }));
});

test("a trip with nothing to hash still gets a ground", () => {
  for (const arg of [null, undefined, {}, ""]) {
    assert.match(coverTint(arg), /^linear-gradient/);
    assert.ok(coverToken(arg));
  }
});
