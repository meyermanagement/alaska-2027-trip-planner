import test from "node:test";
import assert from "node:assert/strict";
import { tidyAnswer } from "../lib/agent/tidy.js";
import { parseRich } from "../lib/agent/rich.js";

test("citation markers with no sources are removed", () => {
  assert.equal(
    tidyAnswer("Try Narcoossee's for seafood [INDEX: 1.1.2, 1.1.5, 1.1.7]."),
    "Try Narcoossee's for seafood.",
  );
  assert.equal(tidyAnswer("Book early.[INDEX: 1.3.2]\nThen go."), "Book early.\nThen go.");
});

test("maths arrows and symbols become characters", () => {
  assert.equal(
    tidyAnswer("Contemporary $\\rightarrow$ TTC $\\rightarrow$ Polynesian"),
    "Contemporary → TTC → Polynesian",
  );
  assert.equal(tidyAnswer("About $75^\\circ$F"), "About 75°F");
  assert.equal(tidyAnswer("A $\\times 2$ pack"), "A × 2 pack");
  assert.equal(tidyAnswer("Parking is $15 \\times 2 nights"), "Parking is $15 × 2 nights");
  assert.equal(tidyAnswer("Walk \\rightarrow ride"), "Walk → ride");
});

test("prices are left alone", () => {
  const s = "Entrees run $25 to $30, and parking is $15.";
  assert.equal(tidyAnswer(s), s);
  assert.equal(tidyAnswer("$120 per night, $40 resort fee"), "$120 per night, $40 resort fee");
});

test("the panel tidies answers kept before the fix", () => {
  const blocks = parseRich("Monorail $\\rightarrow$ Grand Floridian [INDEX: 1.4.1]");
  const words = blocks.flatMap((b) => b.spans.map((s) => s.v || "")).join("");
  assert.equal(words, "Monorail → Grand Floridian");
});
