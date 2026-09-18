"use client";
// Synthetic local QA. Copy under app/login/qa-award/page.js; remove before build.
import Deals from "@/components/Deals";
const award = {
  id: "qa-award", message_id: "qa-aa-email", origin: "ORD", destination: "London",
  destination_code: "LHR", price: null, status: "open", cabin: "business",
  airline: "American Airlines", source_name: "Thrifty Traveler",
  created_at: "2026-09-18T14:00:00Z",
  award_pricing: { options: [{
    program: "American AAdvantage", points_min: 97000, points_max: 97000,
    points_unit: "miles", points_basis: "one_way", cash_amount: 6,
    cash_currency: "USD", cash_basis: "one_way", round_trip_cash: 420,
    route_text: "Chicago (ORD) - 97k",
    pricing_text: "Book with American AAdvantage miles\nAmerican is charging 72k to 97k miles each way. Taxes & fees are $6 one-way or $420 R/T.",
  }] },
  verdict: { headline: "Worth a look", facts: [
    "This fare needs miles or points as well as cash. The fees alone are not compared with your cash fare limit or trip budget.",
    "Check award seats and the return price before transferring points.",
  ] },
};
export default function Fixture() {
  return <main className="mx-auto max-w-3xl px-4 py-8">
    <h1 className="mb-4 font-display text-2xl">Bucket list fares</h1>
    <Deals deals={[award, {
      id: "qa-cash", message_id: "qa-cash-email", origin: "ORD", destination: "London",
      price: 499, status: "open", source_name: "Thrifty Traveler", cabin: "economy",
      verdict: { facts: ["A separate cash fare from a different alert."] },
    }]} />
    <div className="mt-6"><Deals deals={[{ ...award, id: "qa-history", status: "dismissed" }]} /></div>
  </main>;
}
