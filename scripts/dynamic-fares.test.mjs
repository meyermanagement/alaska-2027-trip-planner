import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { manyBrief, verifiedModelFares } = jiti("../lib/deals/forwarded.js");
const { hardParse } = jiti("../lib/deals/parse.js");
const { buildPromptText } = jiti("../lib/inbox/parser.js");
const source = { name: "Example fare newsletter" };
const base = { origin: "ORD", destination: "London", destination_code: "LHR", price: 499 };
const verify = (candidate, text) => verifiedModelFares(JSON.stringify({ fares: [candidate] }), { text, source });
test("unfamiliar prose and split table evidence pass without a sender template", () => {
  for (const [text, evidence, fare_text] of [
    ["Try London (LHR) from ORD for $499 round-trip this November.", ["Try London (LHR) from ORD for $499 round-trip this November."], "Try London (LHR) from ORD for $499 round-trip this November."],
    ["TO: London (LHR)\nFROM | USD RETURN\nORD | $499", ["TO: London (LHR)", "ORD | $499"], "ORD | $499"],
  ]) assert.equal(verify({ ...base, evidence, fare_text }, text).length, 1);
});
test("a cash offer can coexist with an award but its taxes cannot become a fare", () => {
  const cash = "Chicago ORD to London LHR costs $499 round-trip.";
  const text = `${cash}\nBook with Example: 42k miles each way plus $220 fees.`;
  assert.equal(verify({ ...base, evidence: [cash], fare_text: cash }, text).length, 1);
  assert.equal(verify({ ...base, price: 220, evidence: [text], fare_text: text }, text).length, 0);
});
test("fabricated quotes, unsupported prices and unproved route codes are refused", () => {
  const text = "Chicago ORD to London LHR costs $499 round-trip.\nBoston BOS to Paris CDG costs $399.";
  for (const candidate of [
    { ...base, evidence: ["ORD to London LHR $499 imagined"] },
    { ...base, price: 399, evidence: [text.split("\n")[0]] },
    { ...base, origin: "BOS", evidence: [text.split("\n")[0]] },
    { ...base },
  ]) assert.equal(verify(candidate, text).length, 0);
});
test("missing price evidence and malformed award objects cannot pass or crash validation", () => {
  const text = "Chicago ORD to London LHR. Ask for pricing.";
  assert.equal(verify({ ...base, evidence: [text] }, text).length, 0);
  for (const options of [{}, [null], [], "not an array"]) {
    assert.equal(verify({ ...base, evidence: [text], award_pricing: { options } }, text).length, 0);
  }
});
test("long fare emails retain later routes and oversized ones explicitly fail", () => {
  const text = `${"Newsletter context. ".repeat(2000)}\nORD to London LHR $499`;
  const built = buildPromptText({ from_email: "jared@deals.thriftytraveler.com", text_body: text });
  assert.ok(built.includes("ORD to London LHR $499"));
  assert.ok(manyBrief(built, hardParse(built), source).includes("ORD to London LHR $499"));
  assert.throws(() => manyBrief("x".repeat(80001), hardParse(""), source), /too long.*No fares were saved/);
});
test("HTML-only fares retain row boundaries, cells, numeric currency entities and subject", () => {
  const text = buildPromptText({
    from_email: "jared@deals.thriftytraveler.com", subject: "London business class",
    html_body: "<style>ignore</style><h2>London (LHR)</h2><table><tr><td>ORD</td><td>&#36;499</td></tr><tr><td>STL</td><td>&#x24;599</td></tr></table>",
  });
  assert.match(text, /Subject: London business class/);
  assert.match(text, /ORD \| \$499 \|\s*\n\s*STL \| \$599/);
  assert.doesNotMatch(text, /ignore/);
});
