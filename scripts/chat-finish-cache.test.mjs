import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { buildRequest, callingConfig } = jiti("../lib/agent/providers/gemini.js");
const { runChain } = jiti("../lib/agent/llm.js");
const { finishTools, finishFeature, withFinishNote, callsLine, textWithNotes, FINISH_NOTE_LEAD } = jiti("../lib/agent/finish.js");
const openai = jiti("../lib/agent/providers/openai.js");
const anthropic = jiti("../lib/agent/providers/anthropic.js");
const { describeFeature } = jiti("../lib/usage/features.js");
const { needsCards, asksHowToPay } = jiti("../lib/places/rollcall.js");

// A stand-in for the chat tool list: show_places, one change tool, followups.
const tools = [
  { name: "show_places", description: "Shortlist places", parameters: { type: "object" } },
  { name: "update_trip", description: "Change the trip", parameters: { type: "object" } },
  { name: "offer_followups", description: "Offer next questions", parameters: { type: "object" } },
];
const system = "You are Aly. RIGHT NOW: the family is in Atlanta.";
const messages = [{ role: "user", text: "Where should we stay?" }];

// --- Fix 1: the finishing turn sends the same prefix as the answer ----------

test("the finish request is the answer's request, plus one note at the end", () => {
  const history = [
    { role: "user", text: "We land Friday." },
    { role: "assistant", text: "Noted." },
    { role: "user", text: "Where should we stay?" },
  ];
  const answer = buildRequest({ system, messages: history, tools, grounded: true, thinking: "low" });
  const finish = buildRequest({
    system,
    messages: withFinishNote(history, ["Your last turn came back empty.", "", callsLine([])]),
    tools,
    grounded: true,
    thinking: "low",
    temperature: 0.5,
  });
  // Everything ahead of the conversation is identical, config included.
  assert.deepEqual(finish.systemInstruction, answer.systemInstruction);
  assert.deepEqual(finish.tools, answer.tools);
  assert.deepEqual(finish.toolConfig, answer.toolConfig);
  assert.deepEqual(finish.toolConfig.functionCallingConfig, { mode: "AUTO" });
  // The conversation is identical up to the question's own text.
  assert.deepEqual(finish.contents.slice(0, -1), answer.contents.slice(0, -1));
  const [asked, note, ...more] = finish.contents.at(-1).parts;
  assert.deepEqual(asked, answer.contents.at(-1).parts[0]);
  assert.equal(finish.contents.at(-1).role, "user");
  assert.equal(more.length, 0);
  // The note says whose it is, keeps the order, and drops the empty line.
  assert.equal(
    note.text,
    `${FINISH_NOTE_LEAD}\n\nYour last turn came back empty.\n\nDo not call any tool on this turn. Reply in words only.`,
  );
});

test("withFinishNote leaves the input alone and adds a turn only when it must", () => {
  const history = [{ role: "user", text: "Where should we stay?" }];
  const out = withFinishNote(history, ["Write the words."]);
  assert.equal(history[0].notes, undefined);
  assert.equal(out.length, 1);
  assert.equal(withFinishNote(history, ["", "  "]), history);
  const endsWithAly = [...history, { role: "assistant", text: "Here you go." }];
  const added = withFinishNote(endsWithAly, ["Write the words."]);
  assert.equal(added.length, 3);
  assert.equal(added[2].role, "user");
  assert.match(added[2].text, /^From the app, not from the traveler:/);
});

test("callsLine names what may be called, since the config no longer does", () => {
  assert.equal(callsLine([]), "Do not call any tool on this turn. Reply in words only.");
  assert.match(callsLine(["show_places"]), /only tool you may call on this turn is show_places/);
});

test("the other providers read the note as part of the same turn", () => {
  const msgs = withFinishNote([{ role: "user", text: "Where should we stay?" }], ["Write the words."]);
  assert.equal(textWithNotes(msgs[0]), `Where should we stay?\n\n${FINISH_NOTE_LEAD}\n\nWrite the words.`);
  const o = openai.buildRequest({ system, messages: msgs });
  assert.equal(o.messages.at(-1).content, textWithNotes(msgs[0]));
  const n = anthropic.normalizeMessages(msgs);
  assert.equal(n.at(-1).text, textWithNotes(msgs[0]));
});

test("an empty allow list means no calls, with the declarations left in", () => {
  const body = buildRequest({ system, messages, tools, allowedTools: [] });
  assert.equal(body.tools[0].functionDeclarations.length, 3);
  assert.deepEqual(body.toolConfig.functionCallingConfig, { mode: "NONE" });
});

test("callingConfig drops names that were never declared", () => {
  assert.deepEqual(callingConfig(tools, null), { mode: "AUTO" });
  assert.deepEqual(callingConfig(tools, ["nope"]), { mode: "NONE" });
  assert.deepEqual(callingConfig(tools, ["show_places", "show_places", "nope"]), {
    mode: "VALIDATED",
    allowedFunctionNames: ["show_places"],
  });
});

test("runChain hands allowedTools to the provider untouched", async () => {
  let seen = null;
  const fake = {
    generate: async (req) => {
      seen = req;
      return { text: "ok", calls: [], model: "fake-model" };
    },
  };
  await runChain(["gemini"], { gemini: fake }, {
    system,
    messages,
    tools,
    allowedTools: ["show_places"],
    deadline: Date.now() + 60000,
  });
  assert.deepEqual(seen.allowedTools, ["show_places"]);
  assert.equal(seen.tools, tools);
});

test("finishTools: cards when owed, nothing on a silent turn, else only with no shortlist", () => {
  assert.deepEqual(finishTools({ needCards: true }), ["show_places"]);
  assert.deepEqual(finishTools({ silent: true }), []);
  assert.deepEqual(finishTools({ silent: false, shortlistCount: 0 }), ["show_places"]);
  assert.deepEqual(finishTools({ silent: false, shortlistCount: 4 }), []);
});

test("the route sends the finishing turn the answer's system, tools and config", () => {
  const src = readFileSync(new URL("../app/api/chat/route.js", import.meta.url), "utf8");
  const at = src.indexOf("feature: finishFeature(");
  assert.ok(at > 0, "finish call names its reason");
  const call = src.slice(at, src.indexOf("consent,", at));
  assert.match(call, /\n\s+system,\n/);
  assert.match(call, /messages: withFinishNote\(messages, \[/);
  assert.match(call, /callsLine\(mayCall\)/);
  assert.match(call, /\n\s+tools,\n/);
  assert.match(call, /grounded: finishGrounded/);
  assert.doesNotMatch(call, /allowedTools/);
  assert.doesNotMatch(call, /system: \[/);
  assert.doesNotMatch(call, /tools\.filter/);
  assert.match(src, /\(finish\?\.calls \|\| \[\]\)\.filter\(\(call\) => mayCall\.includes\(call\?\.name\)\)/);
});

test("the retry and the answer still send the same request", () => {
  const src = readFileSync(new URL("../app/api/chat/route.js", import.meta.url), "utf8");
  const at = src.indexOf('feature: "chat.retry"');
  const call = src.slice(at, src.indexOf("consent,", at));
  assert.match(call, /\n\s+system,\n\s+messages,\n\s+tools,\n/);
  assert.doesNotMatch(call, /allowedTools/);
});

// --- Fix 2: the ledger says why the finishing turn ran ----------------------

test("finishFeature writes the debts in a fixed order", () => {
  assert.equal(finishFeature({ needCards: true }), "chat.finish.cards");
  assert.equal(finishFeature({ owesWords: true }), "chat.finish.words");
  assert.equal(finishFeature({ silent: true }), "chat.finish.silent");
  assert.equal(
    finishFeature({ needCards: true, owesReasons: true }),
    "chat.finish.reasons+cards",
  );
  assert.equal(finishFeature({}), "chat.finish");
});

test("the usage page labels the new keys and keeps the old one", () => {
  assert.equal(
    describeFeature("chat.finish").stepLabel,
    "Finishing the answer — its words, its cards, or both",
  );
  const cards = describeFeature("chat.finish.cards");
  assert.equal(cards.areaLabel, "Ask Aly");
  assert.equal(cards.stepLabel, "Finishing the answer, because places were named with no cards");
  assert.equal(
    describeFeature("chat.finish.reasons+cards").stepLabel,
    "Finishing the answer, because a change came back with no words and places were named with no cards",
  );
  assert.equal(
    describeFeature("chat.finish.silent+words+cards").stepLabel,
    "Finishing the answer, because the first reply was empty, the cards had no advice above them and places were named with no cards",
  );
  // An unknown debt falls back rather than inventing a reason.
  assert.equal(describeFeature("chat.finish.mystery").stepLabel, "Finish mystery");
});

// --- Fix 3: no place cards under a payment answer ---------------------------

// A paraphrase of the shape of the real reply, not its text: it has to say
// stay, hotel and breakfast because it is about paying for a hotel.
const payingReply =
  "For your stay at the Loews Atlanta, put the room on the Sapphire Reserve: it earns three points per dollar on hotel spend and its trip protection covers the whole booking. If breakfast is not in your rate, the Amex Gold earns four points at the restaurant downstairs, so settle food separately at checkout and keep the room charge on the Chase card.";

test("a payment question does not owe cards, even when the reply is about a hotel", () => {
  assert.equal(asksHowToPay("How should I pay for the Lowe's?"), true);
  assert.equal(needsCards("How should I pay for the Lowe's?", payingReply, []), false);
  assert.equal(needsCards("Which card should I use for dinner tonight?", payingReply, []), false);
  assert.equal(needsCards("Should we use points for our stay?", payingReply, []), false);
  assert.equal(needsCards("Can I book it through the Chase portal?", payingReply, []), false);
});

test("questions that still ask for places keep their cards", () => {
  const reply =
    "Stay in Midtown if you want to walk to the Fox Theatre and Piedmont Park, or Buckhead if you would rather be near the shopping. The Loews Atlanta is the easy pick in Midtown, the Candler is the characterful one downtown, and the St. Regis is the quiet luxury choice in Buckhead with the best breakfast of the three.";
  assert.equal(needsCards("Where should we stay?", reply, []), true);
  assert.equal(needsCards("Where should we stay, and which card should we put it on?", reply, []), true);
  assert.equal(needsCards("What's worth doing within 5 miles of the hotel?", reply, []), true);
  assert.equal(needsCards("What are the points of interest near Midtown?", reply, []), true);
  // Cards already on screen still settle it.
  assert.equal(needsCards("Where should we stay?", reply, [{ name: "Loews Atlanta" }]), false);
});
