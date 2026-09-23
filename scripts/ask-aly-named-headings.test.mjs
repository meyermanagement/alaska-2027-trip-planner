// Cards for places named in headings, and no lookups spent on rating talk.
//
// Seen live on 2026-09-23: "What's the best rated quick service for lunch?"
// was answered with each restaurant as a markdown heading and the outside-the-
// park picks as "**Capt. Cook's (4.5 on Google) — Disney's Polynesian Village
// Resort:**". The name reader only looked at bold phrases, so all six of its
// slots went to "4.1 and 4.3 on Google", "Menu Highlights", "Why it wins" and
// the like -- six paid lookups, no cards -- and the route asked Gemini for the
// cards instead (chat.finish.cards, 1.9s).
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = fileURLToPath(new URL("..", import.meta.url));
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const { namedInReply, nameAndWhere, cardsFromReply } = jiti("../lib/places/named.js");

const AREA = "Walt Disney World, Florida";
const SAID = "What’s the best rated quick service for lunch?";

// The shape of the live answer, trimmed.
const lunch = `Inside Magic Kingdom, quick-service ratings generally hover between **4.1 and 4.3 on Google** due to theme-park volume and prices. None of the in-park quick-service locations clear your standing **4.5-star Google rating floor**, but two spots tie:

---

### 1. Columbia Harbour House (4.2 on Google) — Liberty Square
* **Best for:** A full, satisfying, savory meal.
* **Menu Highlights:** Chilled lobster rolls and grilled salmon.
* **Why it wins:** The **second-floor dining room** is a quiet escape.

### 2. Sleepy Hollow Refreshments (4.2 on Google) — Liberty Square / Castle Bridge
* **Best for:** Casual waffle sandwiches with a view.
* **Why it wins:** Courtyard tables right next to Cinderella Castle.

---

### Step Outside the Turnstiles (If you want a 4.5+ Quick Service)
If you want to hold to your **4.5-star rating floor**, hop on the Resort Monorail:

* **Capt. Cook's (4.5 on Google) — Disney's Polynesian Village Resort:** Pulled pork nachos and noodle bowls with patio seating.
* **Contempo Café (4.4–4.5 on Google) — Disney's Contemporary Resort:** A 10-minute walk for pressed sandwiches and grain bowls.

All food purchases code as dining and earn **3x points on your Chase Sapphire Reserve**.`;

test("the name, the aside and the location are told apart", () => {
  assert.deepEqual(nameAndWhere("1. Columbia Harbour House (4.2 on Google) — Liberty Square"), {
    name: "Columbia Harbour House",
    where: "Liberty Square",
  });
  assert.deepEqual(nameAndWhere("Capt. Cook's (4.5 on Google) — Disney's Polynesian Village Resort:"), {
    name: "Capt. Cook's",
    where: "Disney's Polynesian Village Resort",
  });
  assert.deepEqual(nameAndWhere("Contempo Café (4.4–4.5 on Google) — Disney's Contemporary Resort"), {
    name: "Contempo Café",
    where: "Disney's Contemporary Resort",
  });
  // A hyphen inside a name is not a separator.
  assert.equal(nameAndWhere("Be Our Guest").name, "Be Our Guest");
  assert.equal(nameAndWhere("Chef Mickey's").where, "");
});

test("the lunch answer: the four restaurants, and none of the rating talk", () => {
  const named = namedInReply(lunch, { said: SAID, area: AREA });
  const names = named.map((p) => p.name);
  assert.deepEqual(
    names.filter((n) => n !== "Step Outside the Turnstiles"),
    ["Columbia Harbour House", "Sleepy Hollow Refreshments", "Capt. Cook's", "Contempo Café"],
  );
  for (const junk of [
    "4.1 and 4.3 on Google",
    "4.5-star Google rating floor",
    "4.5-star rating floor",
    "Menu Highlights",
    "Why it wins",
    "3x points on your Chase Sapphire Reserve",
  ]) {
    assert.ok(!names.includes(junk), `${junk} is not a place`);
  }
  assert.ok(named.every((p) => p.kind === "eat"));
});

test("each name is looked up where the answer said it is", () => {
  const byName = Object.fromEntries(namedInReply(lunch, { said: SAID, area: AREA }).map((p) => [p.name, p]));
  assert.equal(byName["Columbia Harbour House"].area, `Liberty Square, ${AREA}`);
  assert.equal(byName["Capt. Cook's"].area, `Disney's Polynesian Village Resort, ${AREA}`);
  assert.equal(byName["Columbia Harbour House"].why, "A full, satisfying, savory meal.");
  assert.equal(
    byName["Capt. Cook's"].why,
    "Pulled pork nachos and noodle bowls with patio seating.",
  );
});

test("the lunch answer is carded without a model turn", async () => {
  const google = {
    "Columbia Harbour House": { name: "Columbia Harbour House", lat: 28.41998, lon: -81.58252, photo: "p1", rating: 4.2 },
    "Sleepy Hollow Refreshments": { name: "Sleepy Hollow", lat: 28.41926, lon: -81.58199, photo: "p2", rating: 4.2 },
    "Capt. Cook's": { name: "Capt. Cook's", lat: 28.4051, lon: -81.5846, photo: "p3", rating: 4.5 },
    "Contempo Café": { name: "Contempo Cafe", lat: 28.4152, lon: -81.5741, photo: "p4", rating: 4.4 },
    // What a heading that is not a place might find: some other business.
    "Step Outside the Turnstiles": { name: "Step Outside Tours", lat: 28.5, lon: -81.4 },
  };
  const asked = [];
  const lookUp = async (place) => {
    asked.push(place.name);
    return google[place.name] ?? null;
  };
  const cards = await cardsFromReply({ text: lunch, said: SAID, area: AREA, lookUp });
  assert.deepEqual(cards.map((c) => c.name), [
    "Columbia Harbour House",
    "Sleepy Hollow Refreshments",
    "Capt. Cook's",
    "Contempo Café",
  ]);
  assert.ok(cards.every((c) => c.looked && c.photo));
  assert.ok(!asked.some((n) => /google|points|rating|highlights|wins/i.test(n)), "no lookups spent on rating talk");
});

test("a heading that only frames a list is never a card", async () => {
  const lookUp = async () => ({ name: "Step Outside Tours", lat: 28.5, lon: -81.4 });
  const text = "### Step Outside the Turnstiles\nTwo nearby:\n\n**Capt. Cook's** — nachos and noodle bowls.";
  assert.deepEqual(await cardsFromReply({ text, said: SAID, area: AREA, lookUp }), []);
});

test("bold names with nothing else still read as before", () => {
  const prose = "1. **The Optimist** — oysters and a patio, walk-ins before six.\n2. **Staplehouse**: the best meal in town, but it wants a table weeks out.";
  const named = namedInReply(prose, { said: "Where should we eat?", area: "Atlanta" });
  assert.deepEqual(named.map((p) => [p.name, p.area]), [
    ["The Optimist", "Atlanta"],
    ["Staplehouse", "Atlanta"],
  ]);
});

test("a place whose name has a number in it is still a place", () => {
  const text = "**Club 33** — members only.\n\n**1900 Park Fare** — character dining.";
  const names = namedInReply(text, { said: "Where to eat?", area: AREA }).map((p) => p.name);
  assert.deepEqual(names, ["Club 33", "1900 Park Fare"]);
});
