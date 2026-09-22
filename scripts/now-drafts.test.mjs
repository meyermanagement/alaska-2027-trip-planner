import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { alias: { "@": process.cwd() } });
const { draftsWaiting } = jiti("../lib/now/drafts.js");

const draft = (over = {}) => ({
  id: over.id || "d1",
  name: "Maui week",
  slug: "maui-week",
  public_id: "2abcde",
  status: "draft",
  ...over,
});

test("nothing to say when no trip is a draft", () => {
  assert.equal(draftsWaiting([]), null);
  assert.equal(draftsWaiting([{ id: "t", status: "planned" }]), null);
  assert.equal(draftsWaiting(null), null);
});

test("one draft is named, and opened", () => {
  const found = draftsWaiting([
    { id: "t", status: "planned", name: "Alaska" },
    draft({ destination: "Maui", date_note: "first week of March" }),
  ]);
  assert.equal(found.count, 1);
  assert.equal(found.name, "Maui week");
  assert.match(found.href, /2abcde/);
  assert.equal(found.progress, "2 of 7 answered");
});

test("a draft with nothing answered says nothing about progress", () => {
  const found = draftsWaiting([draft()]);
  assert.equal(found.count, 1);
  assert.equal(found.progress, null);
});

test("several drafts are counted and sent to the drafts filter", () => {
  const found = draftsWaiting([draft(), draft({ id: "d2", name: "Nashville" })]);
  assert.equal(found.count, 2);
  assert.equal(found.href, "/trips?view=drafts");
  assert.equal(found.name, undefined);
});

test("a draft put away is not waiting for anybody", () => {
  assert.equal(draftsWaiting([draft({ archived_at: "2026-09-01" })]), null);
  assert.equal(draftsWaiting([draft({ status: "draft", archived: true })])?.count, 1);
});
