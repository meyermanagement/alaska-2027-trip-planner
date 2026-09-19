// Synthetic local QA only. Copy temporarily to app/login/qa-history/page.js.
import { cookies } from "next/headers";
import { Suspense } from "react";
import Deals from "@/components/Deals";
import NavTabs from "@/components/NavTabs";
const initial = [
  { id: "valid-one", destination: "Zurich", status: "dismissed", book_by: "2099-01-01" },
  { id: "valid-two", destination: "Paris", status: "dismissed", book_by: null },
  { id: "expired-open", destination: "Rome", status: "open", book_by: "2000-01-01" },
  { id: "expired-refused", destination: "Tokyo", status: "dismissed", book_by: "2000-01-01", dismissed_reason: "Dates do not work" },
  { id: "estimated", destination: "London", status: "dismissed", book_by: "2000-01-01", book_by_inferred: true, origin: "STL", message_id: "other" },
];
export default async function Fixture() {
  const restored = (await cookies()).get("qa-restored")?.value === "yes";
  const deals = initial.map((deal) => ({
    origin: "ORD", message_id: "email", source_name: "Sample fare email",
    price: 496, price_basis: "round_trip", created_at: "2026-09-19", cabin_class: "economy",
    ...deal,
    ...(restored && deal.id.startsWith("valid-") ? { status: "open" } : {}),
  }));
  return <Suspense>
    <NavTabs drafts={3} planned={7} logged={12} showAsk={false} />
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 font-display text-2xl">Fare history test</h1>
      <Deals deals={deals} trips={[]} places={[]} />
    </main>
  </Suspense>;
}
