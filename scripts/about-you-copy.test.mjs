import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const {
  ABOUT_ME_MICRO_PROMPTS,
  ABOUT_ME_CHIP_GROUPS,
  aboutMeFromParts,
  splitAboutMe,
} = await jiti.import("../lib/travelers/profile.js");
const { aboutChipSentence, hasAboutChip, toggleAboutChip } = await jiti.import(
  "../lib/travelers/aboutChips.js",
);
const { buildSportsChipItems, sportsChipItemsForPlaceWords } =
  await jiti.import("../lib/travelers/sports.js");

test("five distinct questions retain stable storage labels", () => {
  assert.equal(ABOUT_ME_MICRO_PROMPTS.length, 5);
  assert.equal(new Set(ABOUT_ME_MICRO_PROMPTS.map((p) => p.question)).size, 5);
  for (const p of ABOUT_ME_MICRO_PROMPTS) {
    assert.ok(p.question.endsWith("?"));
    assert.ok(p.placeholder.startsWith("For example:"));
  }
  const original =
    "What you love doing: Hiking.\n\nWhat you're interested in: Architecture.\n\nWhat you're particular about: Quiet rooms.\n\nWhat you'd rather skip: Cruises.\n\nWhat you're like: Slow mornings.";
  assert.equal(aboutMeFromParts(splitAboutMe(original)), original);
});

test("old headings and unstructured text are preserved", () => {
  const parts = splitAboutMe(
    "What you’re into right now: History.\n\nAnything else worth knowing: I need breaks.\n\nMy own paragraph.",
  );
  assert.equal(parts.into, "History.");
  assert.equal(parts.else, "I need breaks. My own paragraph.");
  assert.deepEqual(splitAboutMe(aboutMeFromParts(parts)), parts);
});

test("every suggestion belongs to a question and can be added and removed", () => {
  const keys = new Set(ABOUT_ME_MICRO_PROMPTS.map((p) => p.key));
  for (const group of ABOUT_ME_CHIP_GROUPS) {
    assert.ok(keys.has(group.target));
    const items =
      group.key === "sports"
        ? [
            ...new Set([
              ...buildSportsChipItems(null, null),
              ...sportsChipItemsForPlaceWords("Nashville, Tennessee"),
            ]),
          ]
        : group.items;
    assert.ok(items.length > 0);
    assert.equal(new Set(items).size, items.length);
    for (const item of items) {
      const sentence = aboutChipSentence(group, item);
      const before = "My own answer.";
      const after = toggleAboutChip(before, sentence);
      assert.equal(after, `${before} ${sentence}`);
      assert.equal(hasAboutChip(after, sentence), true);
      assert.equal(toggleAboutChip(after, sentence), before);
      assert.equal(toggleAboutChip("", sentence), sentence);
      assert.equal(toggleAboutChip(sentence, sentence), "");
    }
  }
});

test("pill state follows text edits and preserves qualified answers", () => {
  const sentence = "I like hiking.";
  const qualified = "I like hiking, but only short trails.";
  assert.equal(hasAboutChip(qualified, sentence), false);
  assert.equal(
    toggleAboutChip(qualified, sentence),
    `${qualified} ${sentence}`,
  );
  assert.equal(
    toggleAboutChip("I like hiking. I also need breaks.", sentence),
    "I also need breaks.",
  );
  assert.equal(
    toggleAboutChip("I like music.\nI like hiking.\nI need breaks.", sentence),
    "I like music.\nI need breaks.",
  );
});

test("exact matching escapes punctuation and does not match inside words", () => {
  const sentence = "I follow St. Louis City SC.";
  assert.equal(hasAboutChip("I follow StX Louis City SC.", sentence), false);
  assert.equal(hasAboutChip(`Maybe${sentence}`, sentence), false);
  assert.equal(toggleAboutChip(sentence, sentence), "");
});

test("blank and multiline answers survive serialization", () => {
  const blank = splitAboutMe("");
  assert.equal(aboutMeFromParts(blank), "");
  const filled = {
    ...blank,
    love: "I like music.\nI like hiking.",
    skip: "Crowds.",
  };
  assert.deepEqual(splitAboutMe(aboutMeFromParts(filled)), filled);
});
