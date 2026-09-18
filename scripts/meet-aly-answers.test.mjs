import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, {
  alias: { "@": fileURLToPath(new URL("..", import.meta.url)) },
});
const { ALY_ABILITIES } = await jiti.import("../lib/welcome/alyAbilities.js");
const { playPreparedReply } = await jiti.import(
  "../lib/welcome/preparedReply.js",
);
const { POST } = await jiti.import(
  "../app/api/welcome/meet-aly-ability/route.js",
);

function clock() {
  let now = 0;
  let id = 0;
  const pending = new Map();
  return {
    schedule(fn, delay) {
      pending.set(++id, { fn, at: now + delay });
      return id;
    },
    cancel(id) {
      pending.delete(id);
    },
    next() {
      const [id, item] =
        [...pending.entries()].sort((a, b) => a[1].at - b[1].at)[0] || [];
      if (!item) return false;
      pending.delete(id);
      now = item.at;
      item.fn();
      return true;
    },
    get now() {
      return now;
    },
    get size() {
      return pending.size;
    },
  };
}

test("every section has a distinct concise authored answer", () => {
  assert.equal(ALY_ABILITIES.length, 8);
  assert.equal(new Set(ALY_ABILITIES.map((a) => a.answer)).size, 8);
  for (const ability of ALY_ABILITIES) {
    assert.ok(ability.answer.split(/\s+/).length <= 75, ability.key);
    assert.ok(ability.answer.length > 80, ability.key);
    assert.doesNotMatch(ability.answer, /undefined|TODO|\?\s*$/);
  }
});

test("each reply begins quickly, writes progressively, and completes within 1.2 seconds", () => {
  for (const ability of ALY_ABILITIES) {
    const c = clock();
    const frames = [];
    playPreparedReply(
      ability.answer,
      (text, done) => frames.push({ text, done }),
      c,
    );
    assert.equal(frames.length, 0);
    c.next();
    assert.equal(c.now, 180);
    assert.equal(frames[0].done, false);
    assert.equal(frames[0].text.split(" ").length, 2);
    while (c.next()) {}
    assert.deepEqual(frames.at(-1), { text: ability.answer, done: true });
    assert.ok(c.now <= 1200, `${ability.key}: ${c.now}ms`);
    assert.equal(frames.filter((f) => f.done).length, 1);
  }
});

test("reduced motion returns the full answer immediately without timers", () => {
  const c = clock();
  const frames = [];
  playPreparedReply(ALY_ABILITIES[0].answer, (...args) => frames.push(args), {
    ...c,
    reducedMotion: true,
  });
  assert.deepEqual(frames, [[ALY_ABILITIES[0].answer, true]]);
  assert.equal(c.size, 0);
});

test("closing or unmounting cancels the outstanding reveal", () => {
  for (const afterFirstFrame of [false, true]) {
    const c = clock();
    const frames = [];
    const stop = playPreparedReply(
      ALY_ABILITIES[0].answer,
      (text) => frames.push(text),
      c,
    );
    if (afterFirstFrame) c.next();
    const before = frames.length;
    stop();
    assert.equal(c.size, 0);
    while (c.next()) {}
    assert.equal(frames.length, before);
  }
});

test("older clients receive the same answers without a model request", async () => {
  for (const ability of ALY_ABILITIES) {
    const response = await POST(
      new Request("http://localhost/api/welcome/meet-aly-ability", {
        method: "POST",
        body: JSON.stringify({ key: ability.key }),
      }),
    );
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      key: ability.key,
      answer: ability.answer,
    });
  }
  for (const body of ['{"key":"unknown"}', "{", "{}"]) {
    const response = await POST(
      new Request("http://localhost/api/welcome/meet-aly-ability", {
        method: "POST",
        body,
      }),
    );
    assert.equal(response.status, 400);
  }
});

test("neither the section buttons nor compatibility endpoint can invoke Gemini", () => {
  for (const path of [
    "components/MeetAly.js",
    "app/api/welcome/meet-aly-ability/route.js",
    "lib/welcome/preparedReply.js",
  ]) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(
      source,
      /\bfetch\s*\(|\bgenerate\s*\(|lib\/agent\/llm|ABILITY_SYSTEM/,
    );
  }
});
