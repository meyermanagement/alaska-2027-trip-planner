import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { toolNamesForRequest } = jiti("../lib/agent/toolset.js");

// Fix 1: the tool list starts the same way whatever was asked on a screen.

test("the screen's tools come first, and the wording's are added after them", () => {
  const plain = toolNamesForRequest({ focus: "itinerary", message: "What is on tomorrow?" });
  const money = toolNamesForRequest({ focus: "itinerary", message: "What will dinner cost, and are we covered by insurance?" });
  assert.deepEqual(money.slice(0, plain.length), plain, "the plain set is a prefix of the widened one");
  const added = money.slice(plain.length);
  for (const name of ["add_trip_cost", "update_trip_cost", "add_policy", "update_policy", "attach_policy"]) {
    if (!plain.includes(name)) assert.ok(added.includes(name), `${name} added after the screen's set`);
  }
  assert.equal(new Set(money).size, money.length, "no tool listed twice");
});

test("a tool the screen already has is not moved by the wording", () => {
  const budget = toolNamesForRequest({ focus: "budget", message: "Hello" });
  const asked = toolNamesForRequest({ focus: "budget", message: "What does the budget look like?" });
  assert.ok(budget.includes("add_trip_cost"));
  assert.deepEqual(asked.slice(0, budget.length), budget);
});

// Fix 3: an empty answer to a plain question goes straight to the finishing turn.

const { retryWhenEmpty, asksForChange } = jiti("../lib/agent/asked.js");
import { readFileSync } from "node:fs";

test("a plain question that came back empty skips the retry", () => {
  for (const said of [
    "Where should we stay in Atlanta?",
    "Tell me more about The Joseph?",
    "How should I pay for the Lowe's?",
    "Is Nashville worth a stop on the way home",
  ]) {
    assert.equal(retryWhenEmpty({ said }), false, said);
  }
});

test("anything that may be asking for a change, an interview turn, or no question keeps it", () => {
  for (const said of [
    "Can you add dinner at 7 on Friday?",
    "Should we move the aquarium to Saturday?",
    "Could you book the Candler?",
    "Take the snorkel off the list and put the rain jacket on it?",
  ]) {
    assert.equal(asksForChange(said), true, said);
    assert.equal(retryWhenEmpty({ said }), true, said);
  }
  assert.equal(retryWhenEmpty({ said: "What do you like to do on vacation?", interviewing: true }), true);
  assert.equal(retryWhenEmpty({ said: "We land Friday at noon." }), true, "no question in it");
});

test("the route guards the retry on retryWhenEmpty, and the finishing turn still handles silence", () => {
  const src = readFileSync(new URL("../app/api/chat/route.js", import.meta.url), "utf8");
  const retry = src.indexOf('feature: "chat.retry"');
  const guard = src.lastIndexOf("if (", retry);
  assert.match(src.slice(guard, retry), /retryEmpty &&\s+answeredNothing\(result\)/);
  assert.match(src, /const retryEmpty = retryWhenEmpty\(\{ said, interviewing \}\);/);
  assert.match(src, /const needWords = silent \|\| owesReasons \|\| owesWords;/);
  assert.match(src, /Your last turn came back empty\./);
});
