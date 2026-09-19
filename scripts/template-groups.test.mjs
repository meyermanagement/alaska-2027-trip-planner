import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url, { alias: { "@": fileURLToPath(new URL("..", import.meta.url)) } });
const { templateGroups } = jiti("../lib/packing/templateGroups.js");
const rows = [
  { id: 1, item: "Shirt", category: "Clothes", assignee: "Mark" },
  { id: 2, item: "Toothbrush", category: "Toiletries", assignee: "Veda" },
  { id: 3, item: "Jacket", category: "Clothes", assignee: "Veda" },
  { id: 4, item: "Charger", category: "", assignee: null },
  { id: 5, item: "Sunscreen", category: "Toiletries", assignee: "Old name" },
];
test("templates group categories once across people and retain row identity/order", () => {
  const groups = templateGroups(rows);
  assert.deepEqual(groups.map(([name, items]) => [name, items.map(i => i.id)]), [
    ["Clothes", [1, 3]], ["General", [4]], ["Toiletries", [2, 5]],
  ]);
  assert.equal(groups[0][1][0], rows[0]);
});
test("person, category and search filters combine without dropping stale owners", () => {
  assert.deepEqual(templateGroups(rows, { who: "Veda", category: "Clothes" })[0][1].map(i => i.id), [3]);
  assert.equal(templateGroups(rows, { who: "Shared" })[0][0], "General");
  assert.equal(templateGroups(rows, { who: "Old name" })[0][1][0].id, 5);
  assert.equal(templateGroups(rows, { find: "sunscreen" })[0][1][0].id, 5);
  assert.deepEqual(templateGroups(rows, { who: "Nobody" }), []);
  assert.deepEqual(templateGroups([]), []);
});
