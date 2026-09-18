"use client";
// Synthetic local QA only. Copy to app/login/qa-fares/page.js; remove before build.
import Deals from "@/components/Deals";
const cities = ["Brussels", "Amsterdam", "Paris", "Copenhagen", "Bergen", "Oslo", "Stockholm", "Tallinn", "Vilnius", "Warsaw", "Zurich", "London", "Helsinki", "Gdansk", "Gothenburg", "Stavanger"];
const deals = ["ORD", "STL"].flatMap((origin) => cities.map((destination, i) => ({
  id: `${origin}-${i}`, origin, destination, price: 401 + i * 6,
  message_id: "qa-europe-email", source_name: "Thrifty Traveler",
  source_url: "https://example.com/alert", created_at: "2026-09-18T14:00:00Z",
  status: "open", travel_months: [11, 12, 1, 2], airline: "SAS",
  verdict: { headline: "Worth a look", facts: [
    "This destination could fit your European Christmas markets idea.",
    "Check the dates before booking: not every fare includes December.",
  ] },
})));
export default function Fixture() {
  return <main className="mx-auto max-w-3xl px-4 py-8">
    <h1 className="mb-4 font-display text-2xl">Bucket list</h1>
    <Deals deals={deals} trips={[{ id: "qa-trip", name: "Christmas markets" }]} />
  </main>;
}
