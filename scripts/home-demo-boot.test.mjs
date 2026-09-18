import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { whenBootVeilHidden } = await jiti.import("../lib/boot/ready.js");

function harness({ present = true, visibility = "visible" } = {}) {
  const style = { visibility, display: "grid", opacity: "1" };
  let exists = present;
  let callback;
  let ready = 0;
  let cancelled = 0;
  const cleanup = whenBootVeilHidden(
    () => ready++,
    { getElementById: () => (exists ? {} : null) },
    {
      getComputedStyle: () => style,
      requestAnimationFrame: (fn) => {
        callback = fn;
        return 1;
      },
      cancelAnimationFrame: () => cancelled++,
    },
  );
  return {
    style,
    cleanup,
    tick: () => {
      const fn = callback;
      callback = null;
      fn?.();
    },
    remove: () => (exists = false),
    get ready() {
      return ready;
    },
    get cancelled() {
      return cancelled;
    },
  };
}

test("conversation readiness waits through the entire loader and its fade", () => {
  const h = harness();
  for (let i = 0; i < 400; i++) h.tick();
  assert.equal(h.ready, 0);
  h.style.opacity = "0.02";
  h.tick();
  assert.equal(h.ready, 0);
  h.style.visibility = "hidden";
  h.tick();
  assert.equal(h.ready, 1);
  h.tick();
  assert.equal(h.ready, 1);
});

test("mounting mid-fade still waits for the hidden state", () => {
  const h = harness();
  h.style.opacity = "0.4";
  h.tick();
  assert.equal(h.ready, 0);
  h.style.visibility = "hidden";
  h.tick();
  assert.equal(h.ready, 1);
});

test("no veil, an already hidden veil, and removal all release readiness", () => {
  assert.equal(harness({ present: false }).ready, 1);
  assert.equal(harness({ visibility: "hidden" }).ready, 1);
  const h = harness();
  h.remove();
  h.tick();
  assert.equal(h.ready, 1);
});

test("CSS-only failsafe and reduced-motion completion need no boot flag", () => {
  for (const property of ["visibility", "display"]) {
    const h = harness();
    h.style[property] = property === "visibility" ? "hidden" : "none";
    h.tick();
    assert.equal(h.ready, 1);
  }
});

test("unmount cancels pending readiness", () => {
  const h = harness();
  h.cleanup();
  h.remove();
  h.tick();
  assert.equal(h.ready, 0);
  assert.equal(h.cancelled, 1);
});

test("Home starts its visibility and reading timers only after boot readiness", () => {
  const source = readFileSync(
    new URL("../components/home/AskDemo.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /const booted = useBooted\(\)/);
  assert.match(
    source,
    /if \(!booted \|\| !playing \|\| started\) return undefined/,
  );
  assert.match(source, /\[booted, playing, started\]/);
  assert.match(
    source,
    /else if \(!seen\) \{\s*clearTimeout\(beat\);\s*clearTimeout\(lead\)/,
  );
});
