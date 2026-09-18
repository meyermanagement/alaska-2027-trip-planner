import test from "node:test";
import assert from "node:assert/strict";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { tipUpdate, visibleHeaderTips } = jiti("../lib/tips/update.js");
test("hide from top never changes the tip status or resolution", () => {
  assert.deepEqual(tipUpdate({ header_hidden: true }, "user", "now"), { header_hidden_at: "now" });
  assert.deepEqual(tipUpdate({ header_hidden: false }, "user"), { header_hidden_at: null });
});
test("clear from trip remains a reversible resolution", () => {
  assert.deepEqual(tipUpdate({ status: "cleared" }, "user", "now"), { status: "cleared", resolved_by: "user", resolved_at: "now" });
  assert.deepEqual(tipUpdate({ status: "active" }, "user"), { status: "active", resolved_by: null, resolved_at: null, header_hidden_at: null });
});
test("mixed, missing, and invalid operations are rejected", () => {
  for (const body of [null, {}, { status: "deleted" }, { header_hidden: "yes" }, { header_hidden: true, status: "cleared" }])
    assert.equal(tipUpdate(body, "user"), null);
});
test("header filter leaves legacy tips visible and source rows unchanged", () => {
  const rows = [{ id: "a", status: "active" }, { id: "b", status: "active", header_hidden_at: "now" }];
  assert.deepEqual(visibleHeaderTips(rows).map(t => t.id), ["a"]);
  assert.equal(rows[1].status, "active");
  assert.equal(rows.length, 2);
});
