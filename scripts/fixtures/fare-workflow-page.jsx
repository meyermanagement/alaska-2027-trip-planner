"use client";
// Synthetic local QA. Copy under app/login only temporarily.
import Deals from "@/components/Deals";
const trips = [
  { id: "upcoming", name: "Disney Thanksgiving 2026", slug: "disney", public_id: "3rdp5s", status: "planning", start_date: "2099-11-20", end_date: "2099-11-30" },
  { id: "draft", name: "European Christmas markets", slug: "europe", public_id: "4rdp5s", status: "draft" },
  { id: "past", name: "Previous trip", status: "complete", start_date: "2020-01-01" },
  { id: "stale", name: "Past dates but still planning", status: "planning", end_date: "2020-01-01" },
  { id: "active", name: "Current trip", status: "active" },
];
const deals = [
  { id: "one", origin: "ORD", destination: "Zurich", price: 496, price_basis: "round_trip", message_id: "email", status: "open" },
  { id: "two", origin: "ORD", destination: "Paris", price: 325, price_basis: "one_way", message_id: "email", status: "open" },
  { id: "three", origin: "STL", destination: "London", price: 500, price_basis: "unspecified", message_id: "email", status: "open" },
  { id: "saved", origin: "ORD", destination: "Zurich", price: 496, price_basis: "round_trip", status: "taken", trip_id: "upcoming", verdict: { trip: trips[1] } },
  { id: "refused", origin: "ORD", destination: "Rome", price: 700, status: "dismissed" },
].map((deal) => ({ source_name: "Forwarded fare alert", created_at: "2026-09-19", ...deal }));
export default function Fixture() {
  return <main className="mx-auto max-w-3xl px-4 py-8">
    <h1 className="mb-4 font-display text-2xl">Bucket list</h1>
    <Deals deals={deals} trips={trips} places={[{ id: "place", place: "Christmas markets", status: "open" }]} />
  </main>;
}
