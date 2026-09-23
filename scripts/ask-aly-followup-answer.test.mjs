// The answer travels inside offer_followups, so a turn that came back as the
// buttons alone no longer pays a second model call for its words.
//
// Seen live on 2026-09-23: "what about an early lunch?" came back from
// gemini-3.7-flash as offer_followups and nothing else (57 output tokens), and
// the route spent a chat.finish.silent call -- about four seconds -- getting the
// answer. show_places already carries its words in `reply`; this is the same
// pattern on the other tool a turn can end with.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { splitFollowupCalls, wordsWithFollowups } = jiti("../lib/agent/followups.js");
const tools = jiti("../lib/agent/tools.js");
const declared = [
  ...tools.TOOL_DECLARATIONS,
  ...tools.SHARED_TOOL_DECLARATIONS,
  ...tools.TRIP_TOOL_DECLARATIONS,
];
const { liftSpokenCalls } = jiti("../lib/agent/spoken.js");
const { saidNothing } = jiti("../lib/agent/asked.js");
const route = readFileSync(new URL("../app/api/chat/route.js", import.meta.url), "utf8");

const ANSWER =
  "For an early lunch inside Magic Kingdom, Columbia Harbour House opens at 10:30 and mobile order beats the noon line. Pecos Bill is the other quick-service pick near Splash Mountain.";
const QUESTIONS = [
  "Should we mobile order Columbia Harbour House or Pecos Bill?",
  "What time does lunch start at Skipper Canteen?",
];
const buttonsOnly = (args) => ({ name: "offer_followups", args });

test("offer_followups asks for the answer, and requires it", () => {
  const tool = declared.find((t) => t.name === "offer_followups");
  assert.ok(tool, "offer_followups is declared");
  assert.deepEqual(tool.parameters.required, ["questions", "reply"]);
  assert.equal(tool.parameters.properties.reply.type, "string");
  assert.match(tool.parameters.properties.reply.description, /answer/i);
  assert.match(tool.parameters.properties.reply.description, /show_places/);
  assert.match(tool.description, /reply/);
});

test("the answer comes out of the call alongside the questions", () => {
  const { calls, followups, reply } = splitFollowupCalls([
    buttonsOnly({ questions: QUESTIONS, reply: `  ${ANSWER}  ` }),
    { name: "update_trip", args: { notes: "x" } },
  ]);
  assert.deepEqual(followups, QUESTIONS);
  assert.equal(reply, ANSWER);
  assert.deepEqual(calls.map((c) => c.name), ["update_trip"]);
});

test("a call with no reply, as older turns made them, still splits cleanly", () => {
  const { followups, reply } = splitFollowupCalls([buttonsOnly({ questions: QUESTIONS })]);
  assert.deepEqual(followups, QUESTIONS);
  assert.equal(reply, "");
  assert.equal(splitFollowupCalls([buttonsOnly({ questions: QUESTIONS, reply: 7 })]).reply, "");
});

test("the Saturday lunch turn: buttons alone now have words", () => {
  const { reply } = splitFollowupCalls([buttonsOnly({ questions: QUESTIONS, reply: ANSWER })]);
  const text = wordsWithFollowups("", reply);
  assert.equal(text, ANSWER);
  assert.equal(saidNothing(text), false, "the route will not call it silent");
});

test("her own answer wins when she wrote one", () => {
  const own = "Yes -- Columbia Harbour House is the early pick, and it takes mobile orders from 10:30.";
  assert.equal(wordsWithFollowups(own, ANSWER), own);
});

test("a one-line preamble gives way to the answer in the call", () => {
  assert.equal(wordsWithFollowups("Here are a few options.", ANSWER), ANSWER);
  // But not to a reply that is shorter than it.
  assert.equal(wordsWithFollowups("Here are a few options.", "Yes."), "Here are a few options.");
});

test("nothing in the call leaves the text as it was", () => {
  assert.equal(wordsWithFollowups("", ""), "");
  assert.equal(wordsWithFollowups(ANSWER, ""), ANSWER);
  assert.equal(wordsWithFollowups("", "   "), "");
});

test("a reply that is itself a typed-out call is not an answer", () => {
  const typed = 'offer_followups("What else?")';
  assert.equal(wordsWithFollowups("", typed), "");
  assert.equal(wordsWithFollowups(ANSWER, typed), ANSWER);
});

test("a call written out as JSON keeps its answer when it is lifted", () => {
  const text = "```json\n" + JSON.stringify({ questions: QUESTIONS, reply: ANSWER }) + "\n```";
  const lifted = liftSpokenCalls({ text, calls: [] });
  assert.equal(lifted.text, "");
  const { followups, reply } = splitFollowupCalls(lifted.calls);
  assert.deepEqual(followups, QUESTIONS);
  assert.equal(reply, ANSWER);
});

// The route. Source checks, because the handler needs a signed-in request.

function body(name) {
  const start = route.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  return route.slice(start, route.indexOf("\n}\n", start));
}

test("a turn that answered inside the buttons is not retried as empty", () => {
  const fn = body("answeredNothing");
  assert.match(fn, /reply\s*}\s*=\s*splitFollowupCalls/);
  assert.match(fn, /wordsWithFollowups\(""\s*,\s*reply\)\)\s*return false/);
});

test("the words in the call are taken before the turn is judged silent", () => {
  const taken = route.indexOf("wordsWithFollowups(own, followupWords)");
  const judged = route.indexOf("const silent = saidNothing(result.text);");
  const cards = route.indexOf("wordsWithCards(own, cardWords, shortlist)");
  const finish = route.indexOf("finishFeature({ silent, owesReasons, owesWords, needCards })");
  assert.ok(taken > 0 && judged > 0 && cards > 0 && finish > 0);
  assert.ok(cards < taken, "the cards' words are chosen first, so they are not overwritten");
  assert.ok(taken < judged, "taken before silence is decided");
  assert.ok(judged < finish);
});

test("the cards are looked for in the words that came inside the call", () => {
  // needsCards and cardsFromReply read result.text, which now holds the answer,
  // so places it names can be carded without a model turn.
  const taken = route.indexOf("wordsWithFollowups(own, followupWords)");
  const carded = route.indexOf("cardsFromReply({");
  assert.ok(taken > 0 && carded > taken);
  assert.match(route.slice(carded, carded + 120), /text: result\.text/);
});
