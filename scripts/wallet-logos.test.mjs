import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { createJiti } from "jiti";
const jiti = createJiti(import.meta.url);
const { WALLET_LOGOS, walletLogo, walletInitials } = jiti("../lib/wallet-logos.js");

test("every supported brand resolves to bundled artwork with matching kind", () => {
  for (const entry of WALLET_LOGOS) {
    assert.ok(existsSync(new URL(`../public/wallet-logos/${entry.file}.webp`, import.meta.url)));
    for (const brand of entry.aliases) {
      assert.equal(walletLogo({ kind: entry.kind, brand }).src, `/wallet-logos/${entry.file}.webp`);
    }
  }
});
test("card variants and co-branded loyalty accounts never share a guessed match", () => {
  assert.notEqual(walletLogo({ kind: "credit_card", brand: "Chase Sapphire Preferred" }).src,
    walletLogo({ kind: "credit_card", brand: "Chase Sapphire Reserve" }).src);
  for (const brand of ["Chase Sapphire Reserve for Business", "American Express Business Platinum",
    "Delta SkyMiles Gold American Express", "Capital One Venture Rewards"]) {
    assert.equal(walletLogo({ kind: "credit_card", brand, program_name: "Delta SkyMiles" }), null);
  }
  assert.equal(walletLogo({ kind: "credit_card", brand: "Delta SkyMiles" }), null);
});
test("normalization tolerates case, trademarks, and punctuation but not arbitrary URLs", () => {
  assert.match(walletLogo({ kind: "credit_card", brand: "  CHASE Sapphire® Reserve™ " }).src, /sapphire-reserve/);
  assert.match(walletLogo({ kind: "credit_card", brand: "Citi® / AAdvantage® Executive World Legend Mastercard®" }).src, /citi-executive/);
  assert.equal(walletLogo({ kind: "hotel", brand: "https://evil.example/logo.png" }), null);
  assert.equal(walletLogo(null), null);
});
test("unmatched and empty names have a readable decorative fallback", () => {
  assert.equal(walletInitials({ brand: "Local Rewards" }), "LR");
  assert.equal(walletInitials({ brand: "Custom" }), "C");
  assert.equal(walletInitials(null), "?");
});
