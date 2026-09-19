import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Child access is a filled button inside Household settings, not a standalone link", () => {
  const page = readFileSync(new URL("../app/family/page.js", import.meta.url), "utf8");
  const household = page.slice(page.indexOf('<details className="optional-section"'), page.indexOf("</details>"));
  assert.match(household, /Household settings/);
  assert.match(household, /forwarding & child access/);
  assert.match(household, /href="\/family\/child-access" className="btn btn-primary w-full sm:w-auto"/);
  assert.ok(household.indexOf('href="/family/child-access"') < household.indexOf("<HouseholdName"));
  assert.equal((page.match(/href="\/family\/child-access"/g) || []).length, 1);
  assert.match(household, /some\(t => t\.date_of_birth\)/);
});
