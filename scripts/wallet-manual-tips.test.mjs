import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("Wallet explicitly disables automatic looks while keeping the manual chained look", () => {
  const page = readFileSync(new URL("../app/wallet/page.js", import.meta.url), "utf8");
  assert.match(page, /autoLook=\{false\}/);
  assert.match(page, /\bcanLook\b/);
  assert.match(page, /chain=\{\[\{ scope: "wallet" \}, \{ scope: "offers" \}\]\}/);
  assert.doesNotMatch(page, /wallet_looked_at/);
});
