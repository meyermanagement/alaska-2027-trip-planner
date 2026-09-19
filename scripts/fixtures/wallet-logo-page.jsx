"use client";
// Synthetic QA only. Copy temporarily to app/login/qa-wallet/page.js.
import RewardsBoard from "@/app/wallet/RewardsBoard";
import Deals from "@/components/Deals";
import { WALLET_LOGOS } from "@/lib/wallet-logos";

const programs = WALLET_LOGOS.map((logo, i) => ({
  id: `sample-${i}`, kind: logo.kind, brand: logo.aliases[0],
  points_balance: i === 0 ? 0 : i === 5 ? 1234567 : i % 2 ? 42000 : null, currency_label: "points",
  status_tier: i % 2 ? "Member" : null, earn_rules: [], credits: [],
})).concat([{ id: "custom", kind: "other", brand: "Local Adventure Rewards" }]);

export default function WalletLogoFixture() {
  return <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
    <div className="flex gap-3">
      <button className="btn btn-ghost" onClick={() => { document.documentElement.dataset.skin = "daybreak"; }}>Light</button>
      <button className="btn btn-ghost" onClick={() => { document.documentElement.dataset.skin = "aurora"; }}>Dark</button>
    </div>
    <h1 className="font-display text-xl font-semibold">Wallet</h1>
    <RewardsBoard familyId="synthetic-only" travelers={[{id:"test-person",name:"Taylor"}, {id:"test-pet",name:"Test pet",is_person:false}]} programs={programs} />
    <Deals deals={[
      { id: "hawaii", origin: "ORD", destination: "Hawaii", status: "dismissed",
        book_by: "2026-09-17", book_by_inferred: true, dismissed_reason: "Wrong time of year",
        source_name: "Example newsletter", price: 496, price_basis: "round_trip" },
      { id: "valid", origin: "ORD", destination: "Paris", status: "dismissed",
        book_by: "2099-09-19", source_name: "Example newsletter", price: 499, price_basis: "round_trip" },
    ]} />
  </main>;
}
