"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sortItinerary } from "@/lib/day/order";
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
import { lookSummary } from "@/lib/tips/run";
import { syncPackingForTraveler } from "@/lib/packing/roster";
import { SECONDARY } from "@/lib/travelers/access";
import { syncPackingForPet } from "@/lib/pets/packing";
import { ARRANGEMENTS, arrangementLabel, isComing } from "@/lib/pets/pets";

/**
 * What the look put on the other tabs, said on the tab that started it.
 *
 * The Tips tab's button walks five places and files each tip against whichever one
 * it belongs to, so most of what a press produces appears somewhere the person who
 * pressed it is not looking. Reporting a bare total there is the same fault as a
 * scheduled job that fails in silence, inverted: work happened and the screen
 * showed no sign of it.
 *
 * The counts are of tips that are actually on those tabs right now, read from the
 * same list the tabs render, rather than a remembered claim about what a look once
 * did. A number that is checkable is worth more than a number that is a memory.
 */
function ElsewhereTips({ landed, counts, everLooked, onGo }) {
  const summary = lookSummary({ byScope: counts });
  const justNow = landed?.summary?.places?.some(
    (place) => place.tab && place.tab !== "tips" && place.tab !== "trip",
  );

  return (
    <section aria-label="Tips on the other tabs" className="card mb-5 p-5">
      <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.09em] text-ink-soft">
        Elsewhere on this trip
      </h3>
      {summary.places.length ? (
        <>
          <p className="mt-1.5 text-[0.86rem] leading-relaxed text-ink-soft">
            {justNow ? "That look also filed " : "There are "}
            {summary.places
              // "2 on the Itinerary" is shorter than "2 tips on the Itinerary"
              // and worse: the noun is what makes the number mean anything, and
              // it only needs saying once.
              .map(
                (place, i) =>
                  `${place.count}${i ? "" : place.count === 1 ? " tip" : " tips"} on ${place.label}`,
              )
              .join(", ")
              .replace(/, ([^,]*)$/, " and $1")}
            .
          </p>
          <div className="no-print mt-2 flex flex-wrap gap-2">
            {summary.places.map((place) => (
              <button
                key={place.tab || place.label}
                type="button"
                onClick={() => place.tab && onGo(place.tab)}
                className="btn-ghost px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em]"
              >
                {`Read ${place.label.replace(/^the /, "")}`}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-1.5 text-[0.86rem] leading-relaxed text-ink-soft">
          {everLooked
            ? "Nothing on the Itinerary or Packing tabs at the moment. A look covers your next few bookings and your packing list as well as the trip itself, so anything worth saying about those will land there."
            : "A look here covers your next few bookings and your packing list too. Whatever it finds about those lands on the Itinerary and Packing tabs, and this will say how much went where."}
        </p>
      )}
    </section>
  );
}

const TABS = [
  // Itinerary first, because that is what a trip opens on and what somebody
  // living inside a trip came for. Tips sits second: it is where the advice about
  // the trip as a whole lives, and the one place that can ask for a look, but it
  // is a thing you go to rather than a thing you land on.
  { id: "itinerary", label: "Itinerary" },
  { id: "tips", label: "Tips" },
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
  pets = [],
  initialPetLinks = [],
  tips = [],
  everLooked = false,
  packingTemplates = [],
  packingTemplateItems = [],
  userId,
  userName,
  // "secondary" for a minor or a friend along for the ride. They may read this
  // trip and check off their own things, so the write affordances come off the
  // screen rather than failing when pressed -- a forbidden UPDATE does not raise
  // in Postgres, it matches no rows, so an ungated button would look like it
  // worked and change nothing.
  level = null,
  // Worked out on the server and handed down, so "overdue" means the same thing
  // in the first frame the browser draws as it does after it wakes up.
  today,
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const readOnly = level === SECONDARY;
  // Notes are a place the family talks to itself. The tab goes for a secondary
  // traveler, and it is worth being exact about why, because the comment that used
  // to sit here was wrong: notes_secondary_insert stops them writing one, but
  // nothing stops them reading one -- probed as Veda, eleven rows came back. So
  // this is our choice, not the database's, and it stands only because Notes.js
  // has no read-only mode: showing the tab today would show a compose box that
  // saves nothing.
  const tabs = readOnly ? TABS.filter((t) => t.id !== "notes") : TABS;
  const [tab, setTab] = useState("itinerary");
  // What the last look filed, and where. Held here rather than inside the tips
  // card so the Tips tab can keep saying it after somebody has been off to
  // read the tips on another tab and come back.
  const [landed, setLanded] = useState(null);
  // Whether the tab bar has anything past its right edge. Measured, not guessed
  // from a breakpoint: the labels are words, and how many fit depends on the font
  // the device actually used.
  const tabBarRef = useRef(null);
  const [moreTabs, setMoreTabs] = useState(false);
  useEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return;
    const measure = () =>
      setMoreTabs(bar.scrollWidth - bar.clientWidth - bar.scrollLeft > 2);
    measure();
    bar.addEventListener("scroll", measure, { passive: true });
    // Rotating the phone changes the answer, and so does a font finally loading.
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => {
      bar.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, []);
  // Switching tabs from somewhere other than the bar -- a "Read Packing" press on
  // the Tips tab, or a ?tab= link -- can select a tab that is off the right edge,
  // leaving the bar looking as though nothing happened.
  useEffect(() => {
    const bar = tabBarRef.current;
    const btn = bar?.querySelector(`[data-tab="${tab}"]`);
    if (btn) btn.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

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
  // Which animals are on this trip, and under what arrangement. Decided here
  // rather than on the Family tab: "is the dog coming to Curaçao" is a fact
  // about Curaçao, and answering it used to mean opening the dog.
  const [petLinks, setPetLinks] = useState(initialPetLinks);
  const [petBusy, setPetBusy] = useState(null);
  const [petNote, setPetNote] = useState("");
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
        // The same order the page was rendered in. Sorting here and not there
        // was how an edit could quietly rearrange the day it was made on.
        if (data) setItinerary(sortItinerary(data));
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
          .is("stashed_at", null)
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
  //
  // The chip hands back its own shape — { id, label, color } — not the traveler
  // it was built from, so the real person has to be looked up here. Passing the
  // chip straight through was the whole reason a roster tap on this page never
  // touched the packing list: the sync had no name to work with and quietly did
  // nothing, which is how somebody's things came to sit on a list they were not
  // traveling on.
  async function toggleTraveler(chip, nowGoing) {
    const person = people.find((p) => p.id === chip?.id) || chip;
    if (!person?.id || !person?.name) return;
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

  // A tap says the animal is on the trip; the arrangement that appears next to
  // it says what that means. A tap alone lands on "coming", because that is what
  // somebody tapping a pet's name on a trip almost always means, and boarding or
  // a sitter is one more choice away rather than a question up front.
  async function setPetArrangement(pet, arrangement) {
    if (!pet?.id) return;
    setPetBusy(pet.id);
    setPetNote("");

    if (!arrangement) {
      await supabase
        .from("trip_pets")
        .delete()
        .eq("trip_id", trip.id)
        .eq("pet_id", pet.id);
      setPetLinks((prev) => prev.filter((l) => l.pet_id !== pet.id));
    } else {
      // The row is the decision, not its absence, so changing an arrangement is
      // an upsert rather than a delete and an insert.
      const { error } = await supabase
        .from("trip_pets")
        .upsert(
          { trip_id: trip.id, pet_id: pet.id, arrangement },
          { onConflict: "trip_id,pet_id" },
        );
      if (error) {
        setPetNote(error.message);
        setPetBusy(null);
        return;
      }
      setPetLinks((prev) => [
        ...prev.filter((l) => l.pet_id !== pet.id),
        { trip_id: trip.id, pet_id: pet.id, arrangement },
      ]);
    }

    // Their things follow them, exactly as a person's do.
    const sync = await syncPackingForPet({
      supabase,
      tripId: trip.id,
      familyId: trip.family_id,
      pet,
      arrangement: arrangement || null,
    });
    if (sync.added || sync.removed || sync.restored)
      await refetch("packing_items");
    setPetNote(sync.message || sync.error || "");
    setPetBusy(null);
  }

  function togglePet(chip, nowOn) {
    // The chip only carries an id, a label and a color, so the real record has
    // to be looked up here. Passing the chip straight through is the bug that
    // once broke the roster packing sync.
    const pet = pets.find((p) => p.id === chip?.id);
    if (!pet) return;
    setPetArrangement(pet, nowOn ? "coming" : null);
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
  // In the pets' own order, not the order the links were written, so the list
  // does not reshuffle itself every time somebody changes an arrangement.
  const petsOnTrip = pets
    .map((pet) => {
      const link = petLinks.find((l) => l.pet_id === pet.id);
      return link ? { pet, arrangement: link.arrangement || "coming" } : null;
    })
    .filter(Boolean);
  // Only the animals actually coming are offered on the packing form: a dog with
  // a sitter does not need a line on this trip's list.
  // Which animals have anything on the packing list at all, so the set-aside
  // wording only appears where there is something to set aside.
  const petsWithLines = useMemo(
    () => new Set(packing.map((p) => p.pet_id).filter(Boolean)),
    [packing],
  );
  const petsComing = petsOnTrip
    .filter(({ arrangement }) => isComing(arrangement))
    .map(({ pet }) => pet);

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
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="no-print text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                  >
                    Edit trip
                  </button>
                )}
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
                    {!readOnly && (
                      <span className="no-print ml-1.5 font-normal normal-case tracking-normal">
                        — tap a name to change it
                      </span>
                    )}
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
                      onToggle={readOnly ? null : toggleTraveler}
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

              {pets.length > 0 && (
                <div className="mt-4">
                  <p className="section-label">
                    {past ? "Pets on this trip" : "Pets"}
                    {!readOnly && (
                      <span className="no-print ml-1.5 font-normal normal-case tracking-normal">
                        — tap an animal to settle it for this trip, then say
                        what is happening to it
                      </span>
                    )}
                  </p>
                  <div className="mt-1.5">
                    <MembershipChips
                      items={pets.map((p) => ({
                        id: p.id,
                        label: p.name,
                        color: p.color,
                      }))}
                      activeIds={petLinks.map((l) => l.pet_id)}
                      busyId={petBusy}
                      onToggle={readOnly ? null : togglePet}
                    />
                  </div>
                  {petLinks.length > 0 && (
                    <div className="no-print mt-2 space-y-1.5">
                      {petsOnTrip.map(({ pet, arrangement }) => (
                        <div
                          key={pet.id}
                          className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                        >
                          <span className="font-semibold">{pet.name}</span>
                          {readOnly ? (
                            // What is happening to the animal is worth knowing
                            // even for somebody who cannot decide it, so the
                            // answer stays and only the menu goes.
                            <span className="text-xs text-ink-soft">
                              {arrangementLabel(arrangement)}
                            </span>
                          ) : (
                            <select
                              className="field w-auto py-1 text-xs"
                              value={arrangement}
                              disabled={petBusy === pet.id}
                              onChange={(e) =>
                                setPetArrangement(pet, e.target.value)
                              }
                              aria-label={`What happens to ${pet.name} on this trip`}
                            >
                              {ARRANGEMENTS.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.label}
                                </option>
                              ))}
                            </select>
                          )}
                          {!isComing(arrangement) && (
                            <span className="text-xs text-ink-soft">
                              not traveling
                              {petsWithLines.has(pet.id)
                                ? " — their things are set aside, not deleted"
                                : ""}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {petNote && (
                    <p
                      aria-live="polite"
                      className="no-print mt-1.5 text-[0.82rem] text-ink-soft"
                    >
                      {petNote}
                    </p>
                  )}
                  <p className="mt-1.5 hidden text-sm text-ink-soft print:block">
                    {petsOnTrip.length
                      ? petsOnTrip
                          .map(
                            ({ pet, arrangement }) =>
                              `${pet.name} — ${arrangementLabel(arrangement)}`,
                          )
                          .join(", ")
                      : "No pets on this trip"}
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

        {/* Five tabs do not fit on a narrow phone, so the bar scrolls sideways.
            It always did, but with four it only just overflowed and the cut fell
            in the gap between two tabs, which read as an edge. With five the cut
            lands mid-word, which reads as broken. The mask fades the last few
            pixels so the bar looks like it continues rather than like it failed,
            and tightening the padding below 640px buys back enough room that only
            the last tab is ever clipped. */}
        <div className="relative min-w-0">
          <nav
            ref={tabBarRef}
            className="no-print flex min-w-0 gap-1 overflow-x-auto border-t border-[var(--line)] bg-sand/60 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                data-tab={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-2.5 py-2 text-sm font-semibold whitespace-nowrap transition sm:px-4 ${
                  tab === t.id
                    ? "bg-white text-teal shadow-sm"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          {/* Pointer-events off: a gradient that eats taps on the last tab would
              be a worse fault than the one it is fixing. */}
          {moreTabs ? (
            <span
              aria-hidden="true"
              className="no-print pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-sand to-transparent"
            />
          ) : null}
        </div>
      </section>

      <div className="mt-6">
        {/* The Tips tab holds the advice about the trip as a whole, and it is
            the one place on the page that can ask for a look.

            It used to sit on the itinerary tab, on the reasoning that most of
            these tips are about dates and bookings. But one press walks the trip,
            the packing list and the next few bookings, so the same button on
            three tabs was three ways to spend the same minute with no way to tell
            which one had already been pressed — and the tab it was pressed on was
            usually not the tab that changed. So the button lives here, once, and
            says where its tips went. */}
        {tab === "tips" && (
          <ProTips
            tips={tips.filter((tip) => tip.scope === "trip")}
            today={today}
            tripId={trip.id}
            scope="trip"
            everLooked={everLooked}
            chain={lookAt}
            heading="Pro tips for this trip"
            onLooked={setLanded}
            onGo={setTab}
            readOnly={readOnly}
          />
        )}
        {/* Where the other tips are. A pointer to two tabs, writing nothing, and
            no reason for a secondary traveler to be sent to the Tips tab and told
            less about it than everybody else. */}
        {tab === "tips" && (
          <ElsewhereTips
            landed={landed}
            counts={{
              item: tips.filter((tip) => tip.scope === "item").length,
              packing: tips.filter((tip) => tip.scope === "packing").length,
            }}
            everLooked={everLooked}
            onGo={setTab}
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
            readOnly={readOnly}
            today={today}
          />
        )}
        {tab === "packing" && (
          <Packing
            pets={petsComing}
            items={packing}
            tripId={trip.id}
            tips={tips.filter((tip) => tip.scope === "packing")}
            today={today}
            start={trip.start_date}
            end={trip.end_date}
            everLooked={everLooked}
            travelers={travelers}
            going={goingNames}
            userId={userId}
            templates={packingTemplates}
            templateItems={packingTemplateItems}
            onChange={() => refetch("packing_items")}
            readOnly={readOnly}
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
            readOnly={readOnly}
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
