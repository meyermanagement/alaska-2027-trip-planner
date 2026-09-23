// Two changes to how Ask Aly spends model calls.
//
// 1. What changes from one question to the next -- today's date, where they
//    are, the ranked notes, the other conversations -- rides on the newest
//    message instead of sitting in the system prompt, so the system prompt and
//    every earlier turn of the conversation are the same request prefix from
//    one question to the next.
// 2. show_places carries the words above the cards, and cards for places named
//    in prose are built from the lookup, so neither needs a second model turn.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root }, moduleCache: false });
const { buildContext, buildSystemPrompt, rightNowNote, RIGHT_NOW_LEAD } =
  await jiti.import("../lib/agent/context.js");
const { buildRequest } = await jiti.import("../lib/agent/providers/gemini.js");
const { withFinishNote, textWithNotes, finishTools, FINISH_NOTE_LEAD } =
  await jiti.import("../lib/agent/finish.js");
const { splitPlaceCalls } = await jiti.import("../lib/places/cards.js");
const { wordsWithCards, needsWords } = await jiti.import("../lib/places/rollcall.js");
const { namedInReply, sameName, kindFor, cardsFromReply } =
  await jiti.import("../lib/places/named.js");
const { TOOL_DECLARATIONS, SHARED_TOOL_DECLARATIONS, TRIP_TOOL_DECLARATIONS } = await jiti.import("../lib/agent/tools.js");
const TOOLS = [...TOOL_DECLARATIONS, ...SHARED_TOOL_DECLARATIONS, ...TRIP_TOOL_DECLARATIONS];

const route = readFileSync(new URL("../app/api/chat/route.js", import.meta.url), "utf8");

const id = (n, prefix = "12345678") => `${prefix}-0000-4000-8000-${String(n).padStart(12, "0")}`;

function household() {
  const trips = [
    { id: id(1, "a1a1a1a1"), name: "Alaska 2027", destination: "Alaska", status: "planning", start_date: "2027-08-01", end_date: "2027-08-14" },
    { id: id(2, "b2b2b2b2"), name: "Disney Thanksgiving 2026", destination: "Orlando, FL", status: "planning", start_date: "2026-11-22", end_date: "2026-11-28" },
  ];
  return { trips, packing: [], itinerary: [], focusTripId: trips[1].id, focus: "overview", userName: "Mark" };
}

const atlanta = { lat: 33.749, lon: -84.388, accuracy: 20, source: "device", label: "Atlanta" };
const others = [{ title: "Atlanta weekend", tripName: "Disney Thanksgiving 2026", updatedAt: "2026-09-20T12:00:00Z" }];

function promptFor(message, { here = null, conversations = [] } = {}) {
  const ctx = buildContext({ ...household(), message });
  const extras = { here, others: conversations, recall: [], people: ["Mark"] };
  return {
    ctx,
    system: buildSystemPrompt(ctx.text, "overview", ctx.focusTripName, { ...extras, rightNow: "note" }),
    old: buildSystemPrompt(ctx.text, "overview", ctx.focusTripName, { ...extras, tail: ctx.tail }),
    note: rightNowNote({ ...extras, tail: ctx.tail }),
  };
}

// --- 1. RIGHT NOW on the question, not in the system prompt ----------------

test("the system prompt is the same whatever was asked, wherever they are", () => {
  const a = promptFor("How is the plan looking?");
  const b = promptFor("Where should we eat near the hotel?", { here: atlanta, conversations: others });
  const c = promptFor("What should I pack?", { conversations: others });
  assert.equal(b.system, a.system);
  assert.equal(c.system, a.system);
  // And none of what changes is in it.
  assert.doesNotMatch(a.system, /TODAY: \d{4}-\d{2}-\d{2}/);
  assert.doesNotMatch(b.system, /OTHER CONVERSATIONS IN THIS HOUSEHOLD/);
  assert.doesNotMatch(b.system, /WHERE THEY ARE RIGHT NOW/);
  // It says where to look instead.
  assert.match(a.system, /They come with the latest message, in a note from the app headed RIGHT NOW/);
});

test("the note carries what the system prompt used to, under the app's name", () => {
  const b = promptFor("Where should we eat near the hotel?", { here: atlanta, conversations: others });
  assert.ok(b.note.startsWith(`${RIGHT_NOW_LEAD}\nRIGHT NOW:\n`));
  assert.match(b.note, /TODAY: \d{4}-\d{2}-\d{2}/);
  assert.match(b.note, /WHERE THEY ARE RIGHT NOW/);
  assert.match(b.note, /OTHER CONVERSATIONS IN THIS HOUSEHOLD/);
  // Word for word the block the system prompt carries when asked to.
  const block = b.old.slice(b.old.lastIndexOf("\nRIGHT NOW:\n")).trim();
  assert.equal(b.note, `${RIGHT_NOW_LEAD}\n${block}`);
});

test("without the option, the system prompt still carries RIGHT NOW", () => {
  const a = promptFor("How is the plan looking?");
  assert.ok(a.old.lastIndexOf("\nRIGHT NOW:\n") > a.old.indexOf("THE FAMILY'S TRIPS:"));
  assert.match(a.old, /TODAY: \d{4}-\d{2}-\d{2}/);
  assert.equal(rightNowNote({}), "");
});

test("the next question's request starts with the last one's, turns and all", () => {
  const first = promptFor("Where should we stay?", { here: atlanta });
  const second = promptFor("And where should we eat?", { here: atlanta, conversations: others });
  const turn1 = [{ role: "user", text: "Where should we stay?", notes: [first.note] }];
  // What is stored and sent back next time is the words, without the note.
  const turn2 = [
    { role: "user", text: "Where should we stay?" },
    { role: "assistant", text: "The Candler, for the walk." },
    { role: "user", text: "And where should we eat?", notes: [second.note] },
  ];
  const r1 = buildRequest({ system: first.system, messages: turn1, tools: [], thinking: "low" });
  const r2 = buildRequest({ system: second.system, messages: turn2, tools: [], thinking: "low" });
  assert.deepEqual(r2.systemInstruction, r1.systemInstruction);
  assert.deepEqual(r2.contents[0].parts[0], r1.contents[0].parts[0]);
  // The note is a separate part after the question, on the question's turn.
  assert.equal(r2.contents.at(-1).parts[0].text, "And where should we eat?");
  assert.equal(r2.contents.at(-1).parts[1].text, second.note);
});

test("the finishing note comes after RIGHT NOW, and other providers keep both", () => {
  const { note } = promptFor("Where should we stay?", { here: atlanta });
  const messages = [{ role: "user", text: "Where should we stay?", notes: [note] }];
  const finished = withFinishNote(messages, ["Write the words."]);
  assert.equal(finished[0].notes.length, 2);
  assert.equal(finished[0].notes[0], note);
  assert.ok(finished[0].notes[1].startsWith(FINISH_NOTE_LEAD));
  const parts = buildRequest({ system: "s", messages: finished, tools: [], thinking: "low" }).contents[0].parts;
  assert.deepEqual(parts.map((p) => p.text.slice(0, 20)), ["Where should we stay", note.slice(0, 20), FINISH_NOTE_LEAD.slice(0, 20)]);
  assert.equal(textWithNotes(finished[0]), `Where should we stay?\n\n${note}\n\n${finished[0].notes[1]}`);
});

test("the route sends RIGHT NOW as a note and keeps it out of the transcript", () => {
  assert.match(route, /const nowNote = rightNowNote\(\{ \.\.\.extras, here, tail: ctx\.tail \}\)/);
  assert.match(route, /rightNow: "note",/);
  assert.match(route, /\{ role: "user", text: said, \.\.\.\(nowNote \? \{ notes: \[nowNote\] \} : \{\}\) \}/);
  // The system prompt no longer carries the tail itself.
  const call = route.slice(route.indexOf("const system = buildSystemPrompt("), route.indexOf("const messages = ["));
  assert.doesNotMatch(call, /tail: ctx\.tail/);
});

// --- 2a. The words ride with the cards ------------------------------------

test("show_places asks for its words and requires them", () => {
  const tool = TOOLS.find((t) => t.name === "show_places");
  assert.deepEqual(tool.parameters.required, ["places", "reply"]);
  assert.equal(tool.parameters.properties.reply.type, "string");
  assert.match(tool.description, /Write the words that go above the cards in reply, inside this call/);
});

const cards = [
  { name: "The Optimist", kind: "eat", area: "Atlanta", why: "Oysters and a patio." },
  { name: "Staplehouse", kind: "eat", area: "Atlanta", why: "Tasting menu, book ahead." },
  { name: "Ponce City Market", kind: "eat", area: "Atlanta", why: "Everybody gets their own thing." },
];
const answer =
  "For your one night out I would book The Optimist: it is the only one of the three with a patio in September, and the oyster bar takes walk-ins before six. Staplehouse is the better meal but wants a table weeks out. The market is the easy fallback if Veda is tired.";

test("splitPlaceCalls hands back the reply, joined across calls", () => {
  const out = splitPlaceCalls([
    { name: "show_places", args: { places: cards.slice(0, 2), reply: "  Eat here.  " } },
    { name: "update_trip", args: {} },
    { name: "show_places", args: { places: cards.slice(2), reply: "Then walk here." } },
    { name: "show_places", args: { places: [] } },
  ]);
  assert.equal(out.reply, "Eat here.\n\nThen walk here.");
  assert.equal(out.places.length, 3);
  assert.deepEqual(out.calls.map((c) => c.name), ["update_trip"]);
  assert.equal(splitPlaceCalls([]).reply, "");
});

test("wordsWithCards: the reply answers when the turn said nothing", () => {
  assert.equal(wordsWithCards("", answer, cards), answer);
  // Read out the names, and the reply wins.
  const rollCall = "The Optimist; Staplehouse; Ponce City Market. Tap Add to itinerary on any one, or tell me which.";
  assert.ok(needsWords(rollCall, cards));
  assert.equal(wordsWithCards(rollCall, answer, cards), answer);
  // A preamble loses to the answer; a real answer beats a thinner reply.
  assert.equal(wordsWithCards("Here are a few picks for tonight.", answer, cards), answer);
  assert.equal(wordsWithCards(answer, "Three good ones.", cards), answer);
});

test("wordsWithCards: a reply that is a roll call, or no cards, changes nothing", () => {
  const rollCall = "The Optimist, Staplehouse, Ponce City Market. Tell me which one you want.";
  assert.equal(wordsWithCards("", rollCall, cards), "");
  assert.equal(wordsWithCards("Something.", rollCall, cards), "Something.");
  assert.equal(wordsWithCards("", answer, []), "");
  assert.equal(wordsWithCards("Words.", "", cards), "Words.");
});

test("the route takes the card words before it decides a finish is owed", () => {
  const take = route.indexOf("wordsWithCards(own, cardWords, shortlist)");
  const decide = route.indexOf("const silent = saidNothing(result.text);");
  assert.ok(take > 0 && decide > take);
});

// --- 2b. Cards for places named in prose -----------------------------------

const prose = `Three I would actually book:

1. **The Optimist** — oysters and a patio, walk-ins before six.
2. **Staplehouse**: the best meal in town, but it wants a table weeks out.
3. **Ponce City Market** is the easy fallback if Veda is tired.

**Best for a rainy day:** the market again. **Atlanta** is warm that week.`;

test("namedInReply keeps names and leaves headings and the destination out", () => {
  const named = namedInReply(prose, { said: "Where should we eat tonight?", area: "Atlanta" });
  assert.deepEqual(named.map((p) => p.name), ["The Optimist", "Staplehouse", "Ponce City Market"]);
  assert.ok(named.every((p) => p.kind === "eat" && p.area === "Atlanta"));
  assert.equal(named[0].why, "oysters and a patio, walk-ins before six.");
  assert.equal(named[1].why, "the best meal in town, but it wants a table weeks out.");
  assert.equal(named[2].why, "Ponce City Market is the easy fallback if Veda is tired.");
});

test("kindFor and sameName", () => {
  assert.equal(kindFor("Where should we stay in Kona?"), "stay");
  assert.equal(kindFor("Any good brunch spots?"), "eat");
  assert.equal(kindFor("What should we do Saturday?"), "do");
  assert.ok(sameName("Loews Royal Pacific", "Loews Royal Pacific Resort at Universal Orlando"));
  assert.ok(sameName("Mama’s Fish House", "Mama's Fish House"));
  assert.ok(sameName("Café Tu Tu Tango", "Cafe Tu Tu Tango"));
  assert.ok(!sameName("Rainy day pick", "Rainy Day Laundromat"));
  assert.ok(!sameName("The Optimist", "Optimist Hall"), "a neighbor, not the place");
});

// A lookup that answers from a table, the way Google would.
const table = {
  "The Optimist": { name: "The Optimist", lat: 33.781, lon: -84.411, address: "914 Howell Mill Rd", photo: "p1", rating: 4.6 },
  Staplehouse: { name: "Staplehouse", lat: 33.755, lon: -84.36, address: "541 Edgewood Ave", photo: "p2", rating: 4.7 },
  "Ponce City Market": { name: "Ponce City Market", lat: 33.772, lon: -84.365, address: "675 Ponce De Leon Ave", photo: "p3" },
};
const lookUpFrom = (answers) => async (place, opts) => {
  lookUpFrom.calls.push({ name: place.name, area: place.area, bias: opts.bias });
  return answers[place.name] ?? null;
};
lookUpFrom.calls = [];

test("cardsFromReply: looked up in the trip's area, photographed, marked as done", async () => {
  lookUpFrom.calls = [];
  const out = await cardsFromReply({ text: prose, said: "Where should we eat?", area: "Atlanta", here: null, lookUp: lookUpFrom(table) });
  assert.deepEqual(out.map((p) => p.name), ["The Optimist", "Staplehouse", "Ponce City Market"]);
  assert.equal(out[0].photo, "p1");
  assert.equal(out[0].address, "914 Howell Mill Rd");
  assert.equal(out[0].rating, 4.6);
  assert.ok(out.every((p) => p.looked));
  assert.ok(lookUpFrom.calls.every((c) => c.area === "Atlanta" && c.bias === null));
});

test("cardsFromReply: a wrong name, a namesake far away, and too few all fall back", async () => {
  const wrong = { ...table, Staplehouse: { ...table.Staplehouse, name: "Staplehouse Market Dental" } };
  const far = { ...table, "Ponce City Market": { ...table["Ponce City Market"], lat: 40.7, lon: -74.0 } };
  const out1 = await cardsFromReply({ text: prose, area: "Atlanta", lookUp: lookUpFrom(wrong) });
  assert.deepEqual(out1.map((p) => p.name), ["The Optimist", "Ponce City Market"]);
  const out2 = await cardsFromReply({ text: prose, area: "Atlanta", lookUp: lookUpFrom(far) });
  assert.deepEqual(out2.map((p) => p.name), ["The Optimist", "Staplehouse"]);
  const one = { "The Optimist": table["The Optimist"] };
  assert.deepEqual(await cardsFromReply({ text: prose, area: "Atlanta", lookUp: lookUpFrom(one) }), []);
  const failing = async () => {
    throw new Error("down");
  };
  assert.deepEqual(await cardsFromReply({ text: prose, area: "Atlanta", lookUp: failing }), []);
});

test("cardsFromReply: nowhere to lean on means no cards at all", async () => {
  lookUpFrom.calls = [];
  assert.deepEqual(await cardsFromReply({ text: prose, area: null, here: null, lookUp: lookUpFrom(table) }), []);
  assert.equal(lookUpFrom.calls.length, 0);
  // A single bold name is not a shortlist.
  assert.deepEqual(await cardsFromReply({ text: "Book **The Optimist**.", area: "Atlanta", lookUp: lookUpFrom(table) }), []);
});

test("cardsFromReply: where they are only when they asked about nearby", async () => {
  lookUpFrom.calls = [];
  await cardsFromReply({ text: prose, said: "Where should we eat at Epcot?", area: "Orlando, FL", here: atlanta, lookUp: lookUpFrom({}) });
  assert.ok(lookUpFrom.calls.every((c) => c.bias === null), "the trip, not the living room");
  lookUpFrom.calls = [];
  const out = await cardsFromReply({ text: prose, said: "Anywhere good to eat nearby?", area: "Orlando, FL", here: atlanta, lookUp: lookUpFrom(table) });
  assert.ok(lookUpFrom.calls.every((c) => c.bias?.circle?.radius === 20000));
  assert.equal(out.length, 3);
  // Nearby, and one of them is in another state.
  const far = { ...table, Staplehouse: { ...table.Staplehouse, lat: 28.37, lon: -81.55 } };
  const near = await cardsFromReply({ text: prose, said: "Anything close by?", area: null, here: atlanta, lookUp: lookUpFrom(far) });
  assert.deepEqual(near.map((p) => p.name), ["The Optimist", "Ponce City Market"]);
});

test("the route cards the names first and only then asks the model", () => {
  const local = route.indexOf("cardedHere = await cardsFromReply(");
  const finish = route.indexOf("feature: finishFeature(");
  assert.ok(local > 0 && finish > local);
  assert.match(route, /if \(cardedHere\.length\) \{\s+shortlistAll = mergePlaces\(shortlistAll, cardedHere\);\s+needCards = false;/);
  // Already looked up: not looked up again.
  assert.match(route, /!firstNames\.has\(p\?\.name\) && !looked\.has\(p\?\.name\)/);
  // With cards on screen, a finish owed only words may not draw more.
  assert.match(route, /shortlistCount: shortlistAll\.length/);
  assert.deepEqual(finishTools({ silent: false, needCards: false, shortlistCount: 3 }), []);
});
