// Synthetic fixture. Copy to app/login/qa-now-longrange/page.js for local QA
// only; remove the route before building or deploying production. Every date,
// price and place below is invented.
import NowAhead from "@/app/now/NowAhead";
import NowEmpty from "@/app/now/NowEmpty";

const trip = {
  id: "qa-trip",
  slug: "qa-trip",
  name: "Thanksgiving at Walt Disney World",
  destination: "Orlando, Florida",
  start_date: "2026-11-24",
  end_date: "2026-12-01",
  status: "upcoming",
  emoji: "🎢",
  trip_type: "vacation",
};

const card = {
  id: trip.id,
  trip,
  name: trip.name,
  destination: trip.destination,
  start_date: trip.start_date,
  end_date: trip.end_date,
  days: 64,
  todo: 7,
  going: ["Mark", "Steph", "Veda"],
  href: "/trips/qa-trip",
  tasksHref: "/trips/qa-trip?tab=tasks",
  budgetHref: "/trips/qa-trip?tab=budget",
  needs: [
    { id: "n1", on: "2026-10-02", title: "Book park reservations" },
    { id: "n2", on: "2026-10-10", title: "Final resort payment" },
    { id: "n3", on: "2026-11-01", title: "Confirm airport transfer" },
  ],
};

const dates = [
  {
    id: "d1",
    on: "2026-09-30",
    title: "Lisbon · $412 round trip",
    why: "Last day to book at that price.",
    scope: "Fares",
  },
  {
    id: "d2",
    on: "2026-10-02",
    title: "Book park reservations",
    why: "Thanksgiving week fills first.",
    scope: "Disney Thanksgiving 2026",
  },
  {
    id: "d3",
    on: "2026-10-10",
    title: "Final resort payment",
    why: "The room is held until then.",
    scope: "Disney Thanksgiving 2026",
  },
  {
    id: "d4",
    on: "2026-10-18",
    title: "Explorer Card bonus ends",
    why: "60,000 points after $4,000 spend",
    scope: "Wallet",
  },
];

const pick = {
  title: "Yellowstone",
  why: "You ticked September and October, and one of them is now.",
  planHref: "/trips/new?from=qa-place",
};

const season = {
  heading: "In season before spring",
  rows: [
    {
      id: "s1",
      months: "September to October",
      place: "Yellowstone",
      why: "Elk rut, and the crowds have gone.",
    },
    { id: "s2", months: "October", place: "Kyoto", why: "Maples turn." },
    { id: "s3", months: "January to February", place: "Iceland", why: null },
    { id: "s4", months: "February", place: "Curaçao", why: "Dry season." },
  ],
  planHref: "/trips/new?from=s1",
  more: 2,
  total: 6,
};

const watching = {
  chips: [
    { count: 3, label: "fares" },
    { count: 1, label: "card bonus" },
    { count: 2, label: "emails to file" },
  ],
  sentence:
    "Forward a fare alert or a booking to your inbox address and Aly reads it against the places you have saved.",
};

const log = [
  {
    id: "l1",
    name: "Des Moines Horse Show",
    when: "Jul 18",
    note: "Des Moines, Iowa",
    href: "/trips/qa-past",
  },
  {
    id: "l2",
    name: "A week by the coast",
    when: "Mar 10",
    note: "Maui, Hawaii",
    href: "/trips/qa-past-two",
  },
];

export default function Fixture() {
  return (
    <main className="screen px-5 pb-16 pt-7">
      <section id="ahead">
        <NowAhead card={card} dates={dates} pick={pick} />
      </section>
      <section id="empty">
        <NowEmpty season={season} watching={watching} log={log} />
      </section>
    </main>
  );
}
