import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("home hero cannot be hidden and replayed when the motion root arms", () => {
  const home = readFileSync(new URL("../app/HomeLanding.js", import.meta.url), "utf8");
  const hero = home.split('<section className="home-hero"')[1].split("</section>")[0];
  assert.ok(!/className="ma-(in|fade)/.test(hero));
  assert.ok(hero.includes("Alyeska has your back."));
  assert.ok(home.includes('className="section-label ma-in"'), "scroll reveals remain in scenes");
});
