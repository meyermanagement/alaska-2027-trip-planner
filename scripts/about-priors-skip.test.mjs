// A save that sends the same About-you words again keeps the priors already
// read from them instead of asking Gemini a second time.
import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root }, moduleCache: false });
const { priorsForSave, paragraphPrint, slotPriors, READ_FROM } =
  await jiti.import("../lib/travelers/priorsForSave.js");

const PARAGRAPH = "We always book a Marriott. Steph gets seasick on small boats.";
const FOUND = { lodging: { value: "hotel", quote: "We always book a Marriott", confidence: "high" } };
function counter(answer) {
  const fn = async () => { fn.calls += 1; return answer; };
  fn.calls = 0;
  return fn;
}

test("a first read is stored with the fingerprint of its words", async () => {
  const read = counter({ priors: FOUND, read: true });
  const { priors, reused } = await priorsForSave(PARAGRAPH, {}, { read });
  assert.equal(read.calls, 1);
  assert.equal(reused, false);
  assert.deepEqual(slotPriors(priors), FOUND);
  assert.equal(priors[READ_FROM], paragraphPrint(PARAGRAPH));
});

test("the same words saved again are not sent again", async () => {
  const stored = { ...FOUND, [READ_FROM]: paragraphPrint(PARAGRAPH) };
  const read = counter({ priors: {}, read: true });
  const { priors, reused } = await priorsForSave(`  ${PARAGRAPH.replace(" Steph", "\n\nSteph")} `, stored, { read });
  assert.equal(read.calls, 0);
  assert.equal(reused, true);
  assert.deepEqual(priors, stored);
});

test("a paragraph that says nothing is still remembered as read", async () => {
  const first = await priorsForSave("I like trips.", {}, { read: counter({ priors: {}, read: true }) });
  const read = counter({ priors: {}, read: true });
  await priorsForSave("I like trips.", first.priors, { read });
  assert.equal(read.calls, 0);
});

test("changed words are read, even when about_me already holds them", async () => {
  // The People screen writes about_me first, so only the fingerprint can tell.
  const stored = { ...FOUND, [READ_FROM]: paragraphPrint(PARAGRAPH) };
  const read = counter({ priors: {}, read: true });
  const { priors } = await priorsForSave(`${PARAGRAPH} We never cruise.`, stored, { read });
  assert.equal(read.calls, 1);
  assert.deepEqual(slotPriors(priors), {});
});

test("a failed read is not remembered, so the next save tries again", async () => {
  const failed = await priorsForSave(PARAGRAPH, {}, { read: counter({ priors: {}, read: false }) });
  assert.deepEqual(failed.priors, {});
  const read = counter({ priors: FOUND, read: true });
  await priorsForSave(PARAGRAPH, failed.priors, { read });
  assert.equal(read.calls, 1);
});

test("a read that throws still saves, with nothing remembered", async () => {
  const read = async () => { throw new Error("boom"); };
  const { priors } = await priorsForSave(PARAGRAPH, {}, { read });
  assert.deepEqual(priors, {});
});

test("priors stored before this change are read once more", async () => {
  const read = counter({ priors: FOUND, read: true });
  await priorsForSave(PARAGRAPH, {}, { read });
  await priorsForSave(PARAGRAPH, FOUND, { read });
  assert.equal(read.calls, 2);
});

test("a cleared paragraph stores nothing and sends nothing", async () => {
  const read = counter({ priors: FOUND, read: true });
  assert.deepEqual((await priorsForSave("   ", FOUND, { read })).priors, {});
  assert.deepEqual((await priorsForSave(null, FOUND, { read })).priors, {});
  assert.equal(read.calls, 0);
});

test("the interview only ever sees slot answers", () => {
  assert.deepEqual(slotPriors({ ...FOUND, [READ_FROM]: "abc" }), FOUND);
  assert.deepEqual(slotPriors(null), {});
  assert.deepEqual(slotPriors([]), {});
});
