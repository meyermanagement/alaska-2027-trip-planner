"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { daysUntil, formatRange, isDraftTrip, isPastTrip } from "@/lib/format";
import PromoteDraft from "./PromoteDraft";
import MembershipChips from "./MembershipChips";
import TripForm from "./TripForm";
import Itinerary from "./Itinerary";
import Packing from "./Packing";
import Tasks from "./Tasks";
import Notes from "./Notes";
import AskAlyDrawer from "./AskAlyDrawer";
import ProTips from "./ProTips";
import { syncPackingForTraveler } from "@/lib/packing/roster";

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
  tips = [],
  everLooked = false,
  packingTemplates = [],
  packingTemplateItems = [],
  userId,
  userName,
  // Worked out on the server and handed down, so "overdue" means the same thing
  // in the first frame the browser draws as it does after it wakes up.
  today,
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [tab, setTab] = useState("itinerary");

  // Reminders links straight at a trip's task list, so honour ?tab= on arrival.
  // It is read after mount rather than during render so the server and the
  // browser always draw the same first frame.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted && TABS.some((t) => t.id === wanted)) setTab(wanted);
  }, []);
  const [itinerary, setItinerary] = useState(initialItinerary);
  const [packing, setPacking] = useState(initialPacking);
  const [tasks, setTasks] = useState(initialTasks);
  const [notes, setNotes] = useState(initialNotes);
  const [going, setGoing] = useState(initialGoing);
  const [rosterBusy, setRosterBusy] = useState(null);
  // What the packing list did about it, said out loud. A list that grows by six
  // lines while you tap a name is unnerving otherwise, and the reason two of
  // somebody's things survived being taken off has to be visible to be trusted.
  const [rosterNote, setRosterNote] = useState("");
  // The trip row itself can change under us: the database keeps the dates in
  // step with the itinerary, and anyone in the family can edit the details.
  const [info, setInfo] = useState(trip);
  const [editing, setEditing] = useState(false);

  // What a look at this trip covers: the trip, the packing list, and the next
  // three bookings that have not happened yet. Bounded because each one is a
  // separate call to the model, and because advice about day nine is not urgent
  // while day one is still unbooked.
  const lookAt = useMemo(
    () => [
      { scope: "trip" },
      { scope: "packing" },
      ...itinerary
        .filter((item) => item.item_date && item.item_date >= today)
        .slice(0, 3)
        .map((item) => ({ scope: "item", itemId: item.id })),
    ],
    [itinerary, today],
  );

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
    setRosterNote("");
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
    // The roster and the packing list were two facts that only agreed at the
    // moment the trip was made. Now the tap carries both: their own lines from
    // the base list arrive with them, and go when they do.
    const sync = await syncPackingForTraveler({
      supabase,
      tripId: trip.id,
      familyId: trip.family_id,
      person,
      going: nowGoing,
    });
    if (sync.added || sync.removed) await refetch("packing_items");
    setRosterNote(sync.message || "");
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

  // Counting down to a draft would dress up a guess as a departure date.
  const countdown = isDraftTrip(info) ? null : daysUntil(info.start_date);
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
      {/* A draft is still an idea, and the whole page otherwise reads like a
          trip that is really happening — so it says so, once, at the top. */}
      {isDraftTrip(info) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--line-strong)] bg-sand-deep/30 px-4 py-3">
          <p className="text-sm leading-relaxed text-ink-soft">
            <span className="font-semibold text-amber">Draft.</span> Keep
            changing it as much as you like — nothing here is on the family
            calendar until you move it across.
          </p>
          <PromoteDraft trip={info} onDone={() => refetch("trips")} />
        </div>
      )}
      <section className="card overflow-hidden">
        {editing ? (
          <div className="p-5">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">
                Trip details
              </h2>
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
                <span className="emoji-badge" aria-hidden="true">
                  {info.cover_emoji}
                </span>
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
                  <p className="section-label">
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
                  {rosterNote && (
                    <p
                      aria-live="polite"
                      className="no-print mt-1.5 text-[0.82rem] text-ink-soft"
                    >
                      {rosterNote}
                    </p>
                  )}
                  <p className="mt-1.5 hidden text-sm text-ink-soft print:block">
                    {goingNames.length ? goingNames.join(", ") : "Nobody yet"}
                  </p>
                </div>
              )}
            </div>
            <dl className="grid grid-cols-3 gap-3 text-center sm:gap-4">
              {stats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-[var(--line)] bg-sand/70 px-3.5 py-2.5"
                >
                  <dt className="section-label">{s.label}</dt>
                  <dd className="font-display mt-0.5 text-xl font-semibold">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <nav className="no-print flex min-w-0 gap-1 overflow-x-auto border-t border-[var(--line)] bg-sand/60 px-3 py-2">
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
        {/* Tips about the trip as a whole live on the itinerary tab, not above
            all of them. They are nearly all about plans and dates — when a thing
            can be booked, when a window opens — so they belong beside the plans.
            Standing above the tabs meant the same booking advice followed you
            onto packing, tasks and notes, where it was noise. Packing advice has
            its own place on the packing tab for the same reason. */}
        {tab === "itinerary" && (
          <ProTips
            tips={tips.filter((tip) => tip.scope === "trip")}
            today={today}
            tripId={trip.id}
            scope="trip"
            everLooked={everLooked}
            chain={lookAt}
            heading="Pro tips for this trip"
          />
        )}
        {tab === "itinerary" && (
          <Itinerary
            items={itinerary}
            tripId={trip.id}
            tripStart={info.start_date}
            tripEnd={info.end_date}
            tripName={info.name}
            // Where the trip is, so place searches lean towards it rather than
            // towards whatever the geocoder finds first anywhere on earth.
            destination={info.destination || ""}
            tasks={tasks}
            onTaskChange={() => refetch("predeparture_tasks")}
            onOpenTasks={() => setTab("tasks")}
            tips={tips.filter((tip) => tip.scope === "item")}
            onChange={() => refetch("itinerary_items")}
          />
        )}
        {tab === "packing" && (
          <Packing
            items={packing}
            tripId={trip.id}
            tips={tips.filter((tip) => tip.scope === "packing")}
            today={today}
            everLooked={everLooked}
            travelers={travelers}
            userId={userId}
            templates={packingTemplates}
            templateItems={packingTemplateItems}
            onChange={() => refetch("packing_items")}
          />
        )}
        {tab === "tasks" && (
          <Tasks
            items={tasks}
            tripId={trip.id}
            trip={info}
            travelers={travelers}
            userId={userId}
            today={today}
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
        // These read straight from the database on the client, so the tabs
        // update as soon as something is saved without disturbing the page.
        onApplied={() => {
          refetch("itinerary_items");
          refetch("packing_items");
          refetch("predeparture_tasks");
          refetch("trip_notes");
        }}
        // Aly can change the trip itself, or another trip entirely, and only the
        // server can redraw those. Held until the drawer closes.
        onRefresh={() => router.refresh()}
      />
    </main>
  );
}
