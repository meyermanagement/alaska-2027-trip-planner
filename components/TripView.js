"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { daysUntil, formatRange } from "@/lib/format";
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
  userId,
  userName,
}) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState("itinerary");
  const [itinerary, setItinerary] = useState(initialItinerary);
  const [packing, setPacking] = useState(initialPacking);
  const [tasks, setTasks] = useState(initialTasks);
  const [notes, setNotes] = useState(initialNotes);

  const refetch = useCallback(
    async (table) => {
      if (table === "itinerary_items") {
        const { data } = await supabase
          .from("itinerary_items")
          .select("*")
          .eq("trip_id", trip.id)
          .order("item_date", { ascending: true })
          .order("sort_order", { ascending: true });
        if (data) setItinerary(data);
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
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, trip.id, refetch]);

  const countdown = daysUntil(trip.start_date);
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
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-3xl">{trip.cover_emoji}</span>
              {countdown !== null && countdown >= 0 && (
                <span className="chip bg-teal-soft text-teal">
                  {countdown} days away
                </span>
              )}
            </div>
            <h1 className="font-display mt-2 text-3xl font-semibold leading-tight">
              {trip.name}
            </h1>
            <p className="mt-1 text-sm font-semibold text-ink-soft">
              {formatRange(trip.start_date, trip.end_date)}
            </p>
            {trip.destination && (
              <p className="mt-1 text-sm text-ink-soft">{trip.destination}</p>
            )}
            {trip.summary && (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
                {trip.summary}
              </p>
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
