import { isDraftTrip, isPastTrip } from "@/lib/format";

// Match the board's own classification, including manual completion and drafts
// with old tentative dates. A direct trip link needs no browser-history entry.
export function tripReturnTarget(trip, today) {
  const view = isDraftTrip(trip) ? "drafts" : isPastTrip(trip, today) ? "past" : "upcoming";
  const label = { drafts: "Drafts", past: "Trip log", upcoming: "Planned" }[view];
  return { href: `/trips?view=${view}`, label: `Back to ${label}` };
}
