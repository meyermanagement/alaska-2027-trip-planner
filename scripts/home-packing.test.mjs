import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url);
const { HERO_CONVERSATION, heroConversationLines } = jiti("../lib/home/heroConversation.js");
const pack = HERO_CONVERSATION.find((turn) => turn.pack).pack;

test("home demo proposes individual packing names separately from explanations", () => {
  assert.deepEqual(pack.items.map(({ item }) => item), [
    "Sunscreen", "Mia's light jacket", "Photo ID", "Cash for the balance",
    "Dani's motion sickness tablets", "Water", "Snacks",
  ]);
  for (const { item, reason } of pack.items) {
    assert.ok(item && reason);
    assert.ok(!item.includes(" and ") && !item.includes(" — "));
    assert.ok(heroConversationLines().includes(`${item}: ${reason}`));
  }
  assert.equal(new Set(pack.items.map(({ item }) => item)).size, pack.items.length);
});

test("demo action counts actual items instead of a stale hardcoded total", () => {
  const component = readFileSync(new URL("../components/home/AskDemo.js", import.meta.url), "utf8");
  assert.ok(component.includes("Add {pack.items.length} to the day pack"));
  assert.ok(component.includes("pack.items.map(({ item, reason })"));
  assert.ok(!component.includes("{pack.action}"));
});

test("home hero cannot be hidden and replayed when the motion root arms", () => {
  const home = readFileSync(new URL("../app/HomeLanding.js", import.meta.url), "utf8");
  const hero = home.split('<section className="home-hero"')[1].split("</section>")[0];
  assert.ok(!/className="ma-(in|fade)/.test(hero));
  assert.ok(hero.includes("Alyeska has your back."));
  assert.ok(home.includes('className="section-label ma-in"'), "scroll reveals remain in scenes");
});
