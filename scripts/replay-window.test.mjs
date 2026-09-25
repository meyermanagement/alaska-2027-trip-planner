// The replayed history has to start on the same message for several questions
// in a row, or the vendor's cache misses the whole history on every follow-up.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { replayCount, loadThread, CONTEXT_MESSAGES, REPLAY_STEP } = await jiti.import(
  "../lib/agent/thread.js",
);

test("replayCount: short conversations replay everything", () => {
  for (let n = 0; n <= CONTEXT_MESSAGES; n++) assert.equal(replayCount(n), n);
});

test("replayCount: the first replayed message moves only once per step", () => {
  const starts = [];
  for (let n = CONTEXT_MESSAGES + 1; n <= 80; n++) {
    const keep = replayCount(n);
    assert.ok(keep >= CONTEXT_MESSAGES && keep < CONTEXT_MESSAGES + REPLAY_STEP, `n=${n}`);
    starts.push(n - keep);
  }
  // Two messages per question: the start stays put for four questions in a row.
  let still = 0;
  for (let i = 2; i < starts.length; i += 2) if (starts[i] === starts[i - 2]) still++;
  assert.ok(still / Math.floor(starts.length / 2) >= 0.7, `start held on ${still} questions`);
  for (const s of starts) assert.equal(s % REPLAY_STEP, 0);
});

function fakeClient(total) {
  const rows = Array.from({ length: total }, (_, i) => ({
    id: `m${String(i).padStart(3, "0")}`,
    role: i % 2 ? "assistant" : "user",
    body: `message ${i}`,
    created_at: new Date(2026, 8, 1, 0, i).toISOString(),
  }));
  let limit = Infinity;
  let opts;
  const q = {
    select: (_c, o) => ((opts = o), q),
    eq: () => q,
    order: () => q,
    limit: (n) => ((limit = n), q),
    then: (res) =>
      res({
        data: [...rows].reverse().slice(0, limit),
        error: null,
        count: opts?.count ? total : null,
      }),
  };
  return { from: () => q };
}

test("loadThread stepped: a follow-up replays the same opening messages", async () => {
  const a = await loadThread(fakeClient(62), "c1", CONTEXT_MESSAGES, { stepped: true });
  const b = await loadThread(fakeClient(66), "c1", CONTEXT_MESSAGES, { stepped: true });
  assert.equal(a.messages[0].id, b.messages[0].id, "same first message");
  assert.deepEqual(
    b.messages.slice(0, a.messages.length).map((m) => m.id),
    a.messages.map((m) => m.id),
    "the earlier request is a prefix of the later one",
  );
  assert.equal(b.messages.at(-1).id, "m065", "still ends on the newest");
});

test("loadThread unstepped: unchanged for the transcript reader", async () => {
  const r = await loadThread(fakeClient(30), "c1", 12);
  assert.equal(r.messages.length, 12);
  assert.equal(r.messages.at(-1).id, "m029");
});

test("the chat route asks for the stepped window", () => {
  const route = readFileSync(new URL("../app/api/chat/route.js", import.meta.url), "utf8");
  assert.match(route, /loadThread\(supabase, conversationId, CONTEXT_MESSAGES, \{ stepped: true \}\)/);
});
