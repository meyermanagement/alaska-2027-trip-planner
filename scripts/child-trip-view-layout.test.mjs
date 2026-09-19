import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const people = source("app/family/People.js");
const action = source("app/family/ChildTripViewAction.js");

test("minor trip-view action precedes profile details and editors", () => {
  const cards = people.slice(people.indexOf("{shown.map((person)"));
  assert.match(cards, /const minor = isMinorTraveler\(person\)/);
  assert.match(cards, /\{minor && \(\s*<>\s*<ChildTripViewAction person=\{person\} \/>\s*\{personSummary\}/);
  assert.ok(cards.indexOf("<ChildTripViewAction") < cards.indexOf("<PersonForm"));
  assert.match(cards, /\{!minor && personSummary\}/);
  assert.match(cards, /minor \? "btn-ghost" : "btn-primary"/);
});

test("minor action is not duplicated by the adult access row", () => {
  assert.match(people, /if \(isMinorTraveler\(person\)\) return null;/);
  assert.equal((people.match(/<ChildTripViewAction /g) || []).length, 1);
  assert.doesNotMatch(people, /Parent-managed trip view/);
  assert.match(people, /canSetLevels && !minor && \(\s*<LevelPicker/);
});

test("prominent link preserves verification route and accessible context", () => {
  assert.match(action, /btn btn-primary/);
  assert.match(action, /w-full/);
  assert.match(action, /\/family\/child-access\?traveler=\$\{encodeURIComponent\(person.id\)\}/);
  assert.match(action, /Open \{person.name\}’s trip view/);
  assert.match(action, /aria-describedby=\{`child-view-note-\$\{person.id\}`\}/);
  assert.match(action, /id=\{`child-view-note-\$\{person.id\}`\}/);
  assert.match(action, /Parent verification required · Their trips, packing/);
  assert.doesNotMatch(action, /fetch\(|signIn|handoff/);
});

test("long explanation is collapsed by default and retains security context", () => {
  assert.match(action, /<details className=/);
  assert.doesNotMatch(action, /<details[^>]*\bopen\b/);
  assert.match(action, /About this view/);
  assert.match(action, /saved theme/);
  assert.match(action, /No independent child sign-in/);
  assert.match(action, /Only their packing checkmarks and theme can change/);
  assert.match(action, /parent passkey is required to return/);
});
