import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";
import { fileURLToPath } from "node:url";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { shortlistLabel } = jiti("../lib/places/cards.js");

test("the heading over a reply's cards counts what they are", () => {
  const eat = { name: "A", kind: "eat" };
  assert.equal(shortlistLabel([eat, { ...eat, name: "B" }, { ...eat, name: "C" }]), "3 places to eat");
  assert.equal(shortlistLabel([{ name: "Inn", kind: "stay" }]), "1 place to stay");
  assert.equal(shortlistLabel([eat, { name: "Inn", kind: "stay" }]), "2 suggestions");
  assert.equal(shortlistLabel([{ kind: "eat" }]), "");
  assert.equal(shortlistLabel(undefined), "");
});
