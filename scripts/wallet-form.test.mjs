import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { catalogByKind, CATALOG } = jiti("../lib/rewards-catalog.js");
const { formatPoints } = jiti("../lib/rewards.js");
const board = readFileSync(new URL("../app/wallet/RewardsBoard.js", import.meta.url), "utf8");
const picker = readFileSync(new URL("../app/wallet/ProgramPicker.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

test("searchable picker exposes the whole catalog without a lookup requirement", () => {
  assert.equal(catalogByKind().flatMap(g => g.items).length, CATALOG.length);
  assert.match(picker, /Search cards or rewards programs/);
  assert.match(picker, /Can’t find yours\? Add it manually/);
  assert.doesNotMatch(picker, /fetch\(/);
});
test("optional program, account, and card history fields start collapsed", () => {
  for (const title of ["Account details", "Card history", "Program information"]) {
    assert.match(board, new RegExp(`<summary[^>]*>[^<]*${title}`));
  }
  assert.doesNotMatch(board.slice(board.indexOf("function ProgramForm")), /<details[^>]*\bopen\b/);
  assert.match(board, /Saving\\u2026/);
  assert.match(board, /Your details are still here/);
});
test("balances retain zero and use an explicit responsive layout", () => {
  assert.equal(formatPoints(0), "0");
  assert.equal(formatPoints(null), null);
  assert.equal(formatPoints(1234567), "1,234,567");
  assert.match(css, /@container \(min-width: 520px\)/);
  assert.match(css, /\.wallet-program-balance/);
});
