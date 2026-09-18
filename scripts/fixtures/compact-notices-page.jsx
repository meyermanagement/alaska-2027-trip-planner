"use client";
// Synthetic local QA only. Never deploy this route.
import HeaderUpdates from "@/components/HeaderUpdates";
import ProTips from "@/components/ProTips";
import Reminders from "@/components/Reminders";
import Tasks from "@/components/Tasks";
import NowBands from "@/app/now/NowBands";
const trip = { id: "qa-trip", slug: "qa-trip", name: "European Christmas markets", start_date: "2026-12-01", end_date: "2026-12-10", status: "upcoming" };
const tip = {
  id: "qa-tip", trip_id: trip.id, trips: trip, scope: "trip",
  title: "Reserve your market tour", body: "Pick a time before the evening slots fill up.",
  urgency: "now", status: "active", act_by: "2026-09-18",
};
const tasks = [
  { id: "qa-task1", title: "Check passport dates", detail: "Leave enough time for renewals.", timing: "now", due_date: "2026-09-17", priority: "high", assignee: "Shared", trip, is_done: false },
  { id: "qa-task2", title: "Choose walking shoes", timing: "week_before", priority: "normal", assignee: "Shared", trip, is_done: false },
];
export default function Fixture() {
  return <>
    <HeaderUpdates tips={[tip]} today="2026-09-18" />
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <h1 className="font-display text-2xl">Compact reminders and separate tip actions</h1>
      <div data-testid="trip-tips"><ProTips tips={[tip]} today="2026-09-18" tripId={trip.id} scope="trip" canLook={false} showEmpty /></div>
      <div data-testid="now-reminders">
        <h2 className="mb-3 font-display text-xl">Now reminders</h2>
        <NowBands pressing={[{ id: "qa-task1", title: "Check passport dates", tripName: trip.name }]} />
        <Reminders tasks={tasks} today="2026-09-18" userId="qa-user" />
      </div>
      <div data-testid="trip-reminders">
        <h2 className="mb-3 font-display text-xl">Trip reminders</h2>
        <Tasks items={tasks} tripId={trip.id} trip={trip} travelers={["Shared"]} userId="qa-user" today="2026-09-18" onChange={() => {}} />
      </div>
    </main>
  </>;
}
