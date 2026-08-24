"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { daysUntil, formatRange, isPastTrip } from "@/lib/format";
import MembershipChips from "./MembershipChips";
import TripForm from "./TripForm";
import Itinerary from "./Itinerary";
import Packing from "./Packing";
import Tasks from "./Tasks";
import Notes from "./Notes";
import AskAlyDrawer from "./AskAlyDrawer";

const TABS = [
  { id: "itinerary", label: "Itinerary" },
  { id: "packing", label: "Packing" },
  { id: "tasks", label: "Tasks" },
  { id: "notes", label: "Notes" },
];

export default function TripView({
  trip,
  initialItinerary,
  initialPacking,
  initialTasks,
  initialNotes,
  travelers,
  people = [],
  initialGoing = [],
  userId,
  userName,
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState("itinerary");
  const [itinerary, setItinerary] = useState(initialItinerary);
  const [packing, setPacking] = useState(initialPacking);
  const [tasks, setTasks] = useState(initialTasks);
  const [notes, setNotes] = useState(initialNotes);
  const [going, setGoing] = useState(initialGoing);
  const [rosterBusy, setRosterBusy] = useState(null);
  // The trip row itself can change under us: the database keeps the dates in
  // step with the itinerary, and anyone in the family can edit the details.
  const [info, setInfo] = useState(trip);
  const [editing, setEditing] = useState(false);

  const refetch = useCallback(
    async (table) => {
      if (table === "trips") {
        const { data } = await supabase
          .from("trips")
          .select("*")
          .eq("id", trip.id)
          .maybeSingle();
        if (data) setInfo(data);
      } else if (table === "itinerary_items") {
        const { data } = await supabase
          .from("itinerary_items")
          .select("*")
          .eq("trip_id", trip.id)
          .order("item_date", { ascending: true })
          .order("sort_order", { ascending: true });
        if (data) setItinerary(data);
        // A new first or last day shifts the trip's own dates.
        const { data: row } = await supabase
          .from("trips")
          .select("*")
          .eq("id", trip.id)
          .maybeSingle();
        if (row) setInfo(row);
      } else if (table === "packing_items") {
        const { data } = await supabase
          .from("packing_items")
          .select("*")
          .eq("trip_id", trip.id)
          .order("category", { ascending: true })
          .order("sort_order", { ascending: true });
        if (data) setPacking(data);
      } else if (table === "predeparture_tasks") {
        const { data } = await supabase
          .from("predeparture_tasks")
          .select("*")
          .eq("trip_id", trip.id)
          .order("sort_order", { ascending: true });
        if (data) setTasks(data);
      } else if (table === "trip_travelers") {
        const { data } = await supabase
          .from("trip_travelers")
          .select("traveler_id")
          .eq("trip_id", trip.id);
        if (data) setGoing(data.map((r) => r.traveler_id));
      } else if (table === "trip_notes") {
        const { data } = await supabase
          .from("trip_notes")
          .select("*")
          .eq("trip_id", trip.id)
          .order("pinned", { ascending: false })
          .order("created_at", { ascending: false });
        if (data) setNotes(data);
      }
    },
    [supabase, trip.id],
  );

  // Live sync across every family member's device.
  useEffect(() => {
    const tables = [
      "itinerary_items",
      "packing_items",
      "predeparture_tasks",
      "trip_notes",
      "trip_travelers",
    ];
    const channel = supabase.channel(`trip-${trip.id}`);
    tables.forEach((table) => {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `trip_id=eq.${trip.id}`,
        },
        () => refetch(table),
      );
    });
    channel.on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "trips",
        filter: `id=eq.${trip.id}`,
      },
      () => refetch("trips"),
    );
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, trip.id, refetch]);

  // Who is on the trip. Tapping a name saves straight away.
  async function toggleTraveler(person, nowGoing) {
    setRosterBusy(person.id);
    setGoing((prev) =>
      nowGoing ? [...prev, person.id] : prev.filter((id) => id !== person.id),
    );
    if (nowGoing) {
      await supabase
        .from("trip_travelers")
        .insert({ trip_id: trip.id, traveler_id: person.id });
    } else {
      await supabase
        .from("trip_travelers")
        .delete()
        .eq("trip_id", trip.id)
        .eq("traveler_id", person.id);
    }
    setRosterBusy(null);
  }

  async function saveTrip(values) {
    const { data, error } = await supabase
      .from("trips")
      .update(values)
      .eq("id", trip.id)
      .select("*")
      .maybeSingle();
    if (error) return error.message;
    if (data) setInfo(data);
    setEditing(false);
    return null;
  }

  // What the dates would be if they follow the itinerary.
  const dated = itinerary
    .map((i) => i.item_date)
    .filter(Boolean)
    .sort();
  const autoStart = dated[0] || null;
  const autoEnd = dated[dated.length - 1] || null;

  const past = isPastTrip(info);
  const goingNames = people
    .filter((p) => going.includes(p.id))
    .map((p) => p.name);

  const countdown = daysUntil(info.start_date);
  const packedCount = packing.filter((p) => p.is_packed).length;
  const taskCount = tasks.filter((t) => t.is_done).length;
  const openBookings = itinerary.filter(
    (i) => i.status === "needs_booking",
  ).length;

  const stats = [
    { label: "Packed", value: `${packedCount}/${packing.length}` },
    { label: "Tasks done", value: `${taskCount}/${tasks.length}` },
    { label: "Needs booking", value: openBookings },
  ];

  return (
    <main className="mx-auto max-w-5xl px-5 pb-20 pt-6">
      <section className="card overflow-hidden">
        {editing ? (
          <div className="p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">Trip details</h2>
            </div>
            <TripForm
              trip={info}
              autoStart={autoStart}
              autoEnd={autoEnd}
              onCancel={() => setEditing(false)}
              onSave={saveTrip}
            />
          </div>
        ) : (
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-3xl">{info.cover_emoji}</span>
              {countdown !== null && countdown >= 0 && (
                <span className="chip bg-teal-soft text-teal">
                  {countdown} days away
                </span>
              )}
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="no-print text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
              >
                Edit trip
              </button>
            </div>
            <h1 className="font-display mt-2 text-3xl font-semibold leading-tight">
              {info.name}
            </h1>
            <p className="mt-1 text-sm font-semibold text-ink-soft">
              {formatRange(info.start_date, info.end_date)}
              {info.dates_auto !== false && (
                <span className="no-print ml-1.5 font-normal text-ink-soft/80">
                  · from the itinerary
                </span>
              )}
            </p>
            {info.destination && (
              <p className="mt-1 text-sm text-ink-soft">{info.destination}</p>
            )}
            {info.summary && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
                {info.summary}
              </p>
            )}

            {people.length > 0 && (
              <div className="mt-4">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft">
                  {past ? "Who went" : "Who is going"}
                  <span className="no-print ml-1.5 font-normal normal-case tracking-normal">
                    — tap a name to change it
                  </span>
                </p>
                <div className="mt-1.5">
                  <MembershipChips
                    items={people.map((p) => ({
                      id: p.id,
                      label: p.name,
                      color: p.color,
                    }))}
                    activeIds={going}
                    busyId={rosterBusy}
                    onToggle={toggleTraveler}
                  />
                </div>
                <p className="mt-1.5 hidden text-sm text-ink-soft print:block">
                  {goingNames.length ? goingNames.join(", ") : "Nobody yet"}
                </p>
              </div>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-3 text-center sm:gap-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-sand px-3 py-2">
                <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft">
                  {s.label}
                </dt>
                <dd className="font-display text-lg font-semibold">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        )}

        <nav className="no-print flex gap-1 overflow-x-auto border-t border-sand-deep bg-sand/60 px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold whitespace-nowrap transition ${
                tab === t.id
                  ? "bg-white text-teal shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </section>

      <div className="mt-6">
        {tab === "itinerary" && (
          <Itinerary
            items={itinerary}
            tripId={trip.id}
            onChange={() => refetch("itinerary_items")}
          />
        )}
        {tab === "packing" && (
          <Packing
            items={packing}
            tripId={trip.id}
            travelers={travelers}
            userId={userId}
            onChange={() => refetch("packing_items")}
          />
        )}
        {tab === "tasks" && (
          <Tasks
            items={tasks}
            tripId={trip.id}
            travelers={travelers}
            userId={userId}
            onChange={() => refetch("predeparture_tasks")}
          />
        )}
        {tab === "notes" && (
          <Notes
            items={notes}
            tripId={trip.id}
            userId={userId}
            userName={userName}
            onChange={() => refetch("trip_notes")}
          />
        )}
      </div>

      <AskAlyDrawer
        trip={trip}
        focus={tab}
        onApplied={() => {
          refetch("itinerary_items");
          refetch("packing_items");
          refetch("predeparture_tasks");
          refetch("trip_notes");
        }}
      />
    </main>
  );
}
