import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { followStep, FOLLOW_MAX, FOLLOW_MIN } = jiti("../lib/home/follow.js");

test("the answer follows its newest line at a walking pace", () => {
  // 60 frames a second, so a frame cap of about a pixel is about 66px a second:
  // slower than a reader gets through a line, which is the whole point.
  assert.ok(FOLLOW_MAX * 60 < 100, "a second of following should stay under 100px");
  // The old behavior: 5.5% of the gap, uncapped. A card arriving adds a couple
  // of hundred pixels at once, and that used to move the window 11px in a frame.
  assert.ok(followStep(200) < 200 * 0.055);
  assert.equal(followStep(200), FOLLOW_MAX);
});

test("it never overshoots, and never creeps", () => {
  assert.equal(followStep(0), 0);
  assert.equal(followStep(-30), 0);
  // Closer than the minimum nudge: move exactly what is left, not past it.
  assert.equal(followStep(0.1), 0.1);
  assert.equal(followStep(5), FOLLOW_MIN);
});
