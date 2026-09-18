import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { needsProminence } = jiti("../lib/ui/notices.js");
const { tabKeyDown } = jiti("../lib/ui/tabs.js");

test("urgent, overdue, today and tomorrow notices never fold away", () => {
  for (const tip of [
    { urgency: "now" },
    { act_by: "2026-09-17" },
    { act_by: "2026-09-18" },
    { act_by: "2026-09-19" },
  ]) {
    assert.equal(needsProminence(tip, "2026-09-18"), true);
  }
  assert.equal(needsProminence({ act_by: "2026-09-20" }, "2026-09-18"), false);
  assert.equal(needsProminence({ urgency: "soon" }, "2026-09-18"), false);
  assert.equal(needsProminence({ act_by: "2027-01-01" }, "2026-12-31"), true);
  assert.equal(needsProminence({ act_by: "2026-09-20" }, undefined), true);
});
test("tabs wrap, activate, and support Home and End", () => {
  let selected = -1,
    focused = -1,
    prevented = 0;
  const list = { querySelectorAll: () => tabs };
  const tabs = [0, 1, 2].map((i) => ({
    closest: () => list,
    focus: () => (focused = i),
    click: () => (selected = i),
  }));
  const press = (key, index) =>
    tabKeyDown({
      key,
      currentTarget: list,
      target: tabs[index],
      preventDefault: () => prevented++,
    });
  press("ArrowLeft", 0);
  assert.equal(selected, 2);
  press("ArrowRight", 2);
  assert.equal(selected, 0);
  press("End", 0);
  assert.equal(selected, 2);
  press("Home", 2);
  assert.equal(selected, 0);
  assert.equal(focused, 0);
  assert.equal(prevented, 4);
  press("Tab", 0);
  assert.equal(prevented, 4);
});
test("tabs skip disabled and nested tabs", () => {
  let selected;
  const list = { querySelectorAll: () => tabs };
  const tabs = [
    { closest: () => list, focus() {}, click: () => (selected = 0) },
    { disabled: true, closest: () => list },
    { closest: () => ({}) },
    { closest: () => list, focus() {}, click: () => (selected = 3) },
  ];
  tabKeyDown({
    key: "ArrowRight",
    currentTarget: list,
    target: tabs[0],
    preventDefault() {},
  });
  assert.equal(selected, 3);
});
