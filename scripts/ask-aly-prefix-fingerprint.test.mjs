// The [aly.prefix] log line: where one Ask Aly request stops matching the one
// before it, told in hashes and offsets so no prompt text reaches the log.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root }, moduleCache: false });
const {
  requestFingerprint,
  systemBlocks,
  firstDifference,
  shouldLogPrefix,
  logPrefix,
  parsePrefixLines,
  PREFIX_LOG_TAG,
} = await jiti.import("../lib/agent/fingerprint.js");
const { buildRequest } = await jiti.import("../lib/agent/providers/gemini.js");

const gemini = readFileSync(new URL("../lib/agent/providers/gemini.js", import.meta.url), "utf8");
const llm = readFileSync(new URL("../lib/agent/llm.js", import.meta.url), "utf8");

// A prompt shaped like the real one: rules under capital headings, then the
// record, with trip banners that carry a person's name.
function rules(n = 12) {
  return Array.from(
    { length: n },
    (_, i) => `SECTION ${String.fromCharCode(65 + i)} RULES:\n${"- a rule about travel. ".repeat(140)}`,
  ).join("\n\n");
}
function record(extra = "") {
  return [
    "===== DISNEY THANKSGIVING 2026 WITH VEDA [trip id: t1] =====",
    "Itinerary: Grand Floridian, check in Nov 21. ".repeat(80),
    "===== ALASKA 2027 [trip id: t2] =====",
    `Packing: rain shell, binoculars. ${extra}`.repeat(80),
    "===== CURACAO 2027 [trip id: t3] =====",
    "Willemstad, checkout March 21. ".repeat(80),
  ].join("\n");
}
function system({ rulesText = rules(), recordText = record() } = {}) {
  return `You are Aly.\n\n${rulesText}\n\nTHE FAMILY'S TRIPS:\n${recordText}\n\nRIGHT NOW: a fixed sentence.\n`;
}
const TOOLS = [
  { name: "show_places", description: "Cards.", parameters: { type: "object", properties: {} } },
  { name: "add_item", description: "Add.", parameters: { type: "object", properties: {} } },
];
function history(n) {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 ? "assistant" : "user",
    text: `message ${i} `.repeat(30),
  }));
}
function body({ sys = system(), messages = history(12), tools = TOOLS, note = "RIGHT NOW: Sep 23" } = {}) {
  return buildRequest({
    system: sys,
    messages: [...messages, { role: "user", text: "What about breakfast?", notes: [note] }],
    tools,
    grounded: true,
    thinking: "low",
  });
}
const fp = (b, meta = { feature: "chat.answer", model: "gemini-3.7-flash", attempt: 0 }) =>
  requestFingerprint(b, meta);

test("two identical requests have no difference", () => {
  assert.deepEqual(firstDifference(fp(body()), fp(body())), { where: "none" });
});

test("a change in the record is reported in the record, at the block it is in", () => {
  const a = fp(body());
  const changed = system({ recordText: record("tide chart") });
  const b = fp(body({ sys: changed }));
  const d = firstDifference(a, b);
  assert.equal(d.where, "system");
  assert.equal(d.side, "record");
  // The offset lands on the Alaska banner, which is where the change is.
  const at = changed.indexOf("===== ALASKA 2027");
  assert.equal(d.offset, at);
});

test("a change in the rules is reported in the rules", () => {
  const r = rules().replace("SECTION C RULES:", "SECTION C RULES:\n- one new rule.");
  const d = firstDifference(fp(body()), fp(body({ sys: system({ rulesText: r }) })));
  assert.equal(d.where, "system");
  assert.equal(d.side, "rules");
});

test("a history window that slid by two messages differs at the first turn", () => {
  const long = history(14);
  const d = firstDifference(
    fp(body({ messages: long.slice(0, 12) })),
    fp(body({ messages: long.slice(2, 14) })),
  );
  assert.equal(d.where, "contents");
  assert.equal(d.turn, 0);
});

test("a history that grew only differs where the new turns begin", () => {
  const long = history(14);
  const d = firstDifference(
    fp(body({ messages: long.slice(0, 12) })),
    fp(body({ messages: long.slice(0, 14) })),
  );
  assert.equal(d.where, "contents");
  assert.equal(d.turn, 12);
});

test("the RIGHT NOW note shows up on the newest turn and nowhere earlier", () => {
  const d = firstDifference(fp(body()), fp(body({ note: "RIGHT NOW: Sep 24" })));
  assert.equal(d.where, "contents");
  assert.equal(d.turn, 12);
});

test("a different tool list is reported before anything else", () => {
  const d = firstDifference(fp(body()), fp(body({ tools: TOOLS.slice(0, 1) })));
  assert.equal(d.where, "tools");
});

test("no prompt text reaches the line, not even a heading with a name in it", () => {
  const line = JSON.stringify(fp(body()));
  for (const word of ["VEDA", "Veda", "DISNEY", "Grand Floridian", "breakfast", "RIGHT NOW", "rule", "message 0", "show_places"]) {
    assert.ok(!line.includes(word), `leaked ${word}`);
  }
});

test("the line stays short on a prompt the size of the real one", () => {
  const big = system({ rulesText: rules(26), recordText: record().repeat(8) });
  assert.ok(big.length > 140_000);
  const line = `${PREFIX_LOG_TAG} ${JSON.stringify(fp(body({ sys: big, messages: history(12) })))}`;
  assert.ok(line.length < 3000, `line was ${line.length}`);
});

test("blocks cover the whole prompt with no gaps and start at headings", () => {
  const s = system();
  const blocks = systemBlocks(s);
  let at = 0;
  for (const [start, len] of blocks) {
    assert.equal(start, at);
    at += len;
  }
  assert.equal(at, s.length);
  for (const [start] of blocks.slice(1)) {
    assert.ok(/^(=====|[A-Z])/.test(s.slice(start)), `block at ${start} is not a heading`);
  }
});

test("the record offset is where the family's trips begin", () => {
  const s = system();
  assert.equal(fp(body({ sys: s })).at, s.indexOf("THE FAMILY'S TRIPS:"));
});

test("only chat turns are logged, and the switch turns it off", () => {
  assert.equal(shouldLogPrefix("chat.answer", {}), true);
  assert.equal(shouldLogPrefix("chat.finish.cards", {}), true);
  assert.equal(shouldLogPrefix("tips.write", {}), false);
  assert.equal(shouldLogPrefix(null, {}), false);
  assert.equal(shouldLogPrefix("chat.answer", { ALY_PREFIX_LOG: "off" }), false);
});

test("logging never throws and writes one tagged line", () => {
  const lines = [];
  logPrefix(body(), { feature: "chat.answer", model: "m", attempt: 1 }, (l) => lines.push(l));
  assert.equal(lines.length, 1);
  assert.ok(lines[0].startsWith(`${PREFIX_LOG_TAG} {`));
  assert.equal(logPrefix(null, { feature: "chat.answer" }, () => { throw new Error("sink"); }), null);
  assert.equal(logPrefix(body(), { feature: "tips.write" }, (l) => lines.push(l)), null);
  assert.equal(lines.length, 1);
});

test("lines are read back from plain text and from vercel logs --json", () => {
  const a = fp(body());
  const plain = `12:00:01 info ${PREFIX_LOG_TAG} ${JSON.stringify(a)}`;
  const json = JSON.stringify({ level: "info", message: `${PREFIX_LOG_TAG} ${JSON.stringify(a)}` });
  const got = parsePrefixLines([plain, "unrelated line", json, `${PREFIX_LOG_TAG} {"f":"cut`].join("\n"));
  assert.equal(got.length, 2);
  assert.deepEqual(got[0], a);
  assert.deepEqual(got[1], a);
});

test("the adapter logs each call it makes, and the chain hands it the feature", () => {
  const fetchAt = gemini.indexOf("res = await fetch(`${BASE}/${model}:generateContent`");
  const logAt = gemini.lastIndexOf("logPrefix(body, { feature, model, attempt: asked - 1 })", fetchAt);
  assert.ok(logAt > 0 && logAt < fetchAt, "logPrefix sits right before the call");
  assert.match(llm, /allowedTools,\n[\s\S]{0,200}feature,\n  \};/);
});

test("the rules and the record never share a block", () => {
  const s = system();
  const at = s.indexOf("THE FAMILY'S TRIPS:");
  const blocks = systemBlocks(s);
  assert.ok(blocks.some(([start]) => start === at), "a block starts at the record");
  assert.ok(blocks.every(([start, len]) => start >= at || start + len <= at));
});

test("no block is much longer than the cut size", () => {
  const big = system({ rulesText: rules(26), recordText: record().repeat(8) });
  for (const [, len] of systemBlocks(big).slice(0, -1)) assert.ok(len < 8000, `block of ${len}`);
});

test("a prompt with no record marker still fingerprints", () => {
  const f = fp(body({ sys: "Just rules.\n\nMORE RULES:\nnone" }));
  assert.equal(f.at, null);
  assert.ok(f.b.length >= 1);
  const d = firstDifference(f, fp(body({ sys: "Just rules.\n\nMORE RULES:\nsome" })));
  assert.equal(d.where, "system");
  assert.equal(d.side, null);
});
