"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sortItinerary } from "@/lib/day/order";
import { daysUntil, formatRange, isDraftTrip, isPastTrip } from "@/lib/format";
import PromoteDraft from "./PromoteDraft";
import TripOverview from "./TripOverview";
import TripForm from "./TripForm";
import Itinerary from "./Itinerary";
import Packing from "./Packing";
import Tasks from "./Tasks";
import Notes from "./Notes";
import AskAlyDrawer from "./AskAlyDrawer";
import ProTips from "./ProTips";
import LookForTips from "./LookForTips";
import { lookSummary } from "@/lib/tips/run";
import { onTipResolved } from "@/lib/tips/cleared";
import { isComing } from "@/lib/pets/pets";
import { SECONDARY } from "@/lib/travelers/access";

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
            : "A look covers your next few bookings and your packing list too — press Look for tips at the top of this trip. Whatever it finds about those lands on the Itinerary and Packing tabs, and this will say how much went where."}
        </p>
      )}
    </section>
  );
}

const TABS = [
  // Overview first, and the one a trip opens on. It holds what a trip is --
  // who is going, what it is for, how it is coming along -- which used to be
  // stacked in the header above every other tab whether or not it was being
  // read. Then the two tabs a trip is actually worked on, Itinerary and Packing.
  // Tips comes after them, because it is now only a place to read what a look
  // found: the button that starts one moved to the header, where it keeps
  // running whichever tab you move on to.
  { id: "overview", label: "Overview" },
  { id: "itinerary", label: "Itinerary" },
  { id: "packing", label: "Packing" },
  { id: "tips", label: "Tips" },
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
  tripTemplateIds = [],
  templatesChosen = false,
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
  const [tab, setTab] = useState("overview");
  // What the last look filed, and where. Held here rather than inside the tips
  // card so the Tips tab can keep saying it after somebody has been off to
  // read the tips on another tab and come back.
  const [landed, setLanded] = useState(null);
  // Tips cleared on this screen since it loaded. The count on the Tips tab is
  // worked out from the server's list, and clearing a tip is optimistic -- the
  // card goes at once and the row is written behind it -- so without this the
  // number would sit there counting a tip that is no longer on the tab. The
  // same window event the header band listens to carries it.
  const [gone, setGone] = useState(() => new Set());
  useEffect(
    () =>
      onTipResolved((id, status) =>
        setGone((prev) => {
          const next = new Set(prev);
          if (status) next.add(id);
          else next.delete(id);
          return next;
        }),
      ),
    [],
  );
  // What the Tips tab is holding, counted for the badge. Trip-scope only,
  // because that is what the tab shows: a look also files against the Itinerary
  // and Packing tabs, and those tips are counted on the cards they belong to.
  const tipCount = tips.filter(
    (tip) => tip.scope === "trip" && !gone.has(tip.id),
  ).length;
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
          /* What is worth carrying between tabs, and nothing else: what this
             trip is called, when it is, where it is, and how far away. The
             description, the roster and the counting tiles moved to the
             Overview tab, because a header that is read once should not take a
             third of the screen on the four tabs where it is not being read. */
          <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <span className="emoji-badge" aria-hidden="true">
                  {info.cover_emoji}
                </span>
                <h1 className="font-display text-2xl font-semibold leading-tight">
                  {info.name}
                </h1>
                {countdown !== null && countdown >= 0 && (
                  <span className="chip bg-teal-soft text-teal">
                    {countdown} days away
                  </span>
                )}
              </div>
              {/* Dates and place on one line where there is room, and on two
                  where there is not. The separator dot belongs to the place, so
                  a wrap can never leave a dot stranded at the start of a line
                  the way an inline "· {destination}" did at 320px. */}
              <p className="mt-1 text-sm text-ink-soft">
                <span className="font-semibold">
                  {formatRange(info.start_date, info.end_date)}
                </span>
                {info.destination && (
                  <span className="block sm:inline">
                    <span className="hidden sm:inline"> · </span>
                    {info.destination}
                  </span>
                )}
              </p>
            </div>
            {/* The right hand column, and both things it holds. Edit trip was
                here on its own, leaving a blank strip below it as tall as the
                dates and the place put together -- so the look goes under it,
                which is also the only spot on the page that is on every tab.

                A look takes most of a minute. Asked for on the Tips tab, as it
                used to be, the wait happened on the tab least likely to be the
                one that changed: one press walks the trip, its packing list and
                the next few bookings. Started from here it runs while the
                itinerary is read or the packing list ticked off.

                On a phone the column drops below the title and both buttons go
                full width, which is a better tap target than a 120px stack
                squeezing the trip's name into four lines. */}
            <div className="no-print flex shrink-0 flex-col items-stretch gap-2 sm:w-44">
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="btn btn-ghost no-print w-full px-3 py-1.5 text-xs"
                >
                  Edit trip
                </button>
              )}
              <LookForTips
                tripId={trip.id}
                chain={lookAt}
                scope="trip"
                hasTips={tips.length > 0}
                onLooked={setLanded}
                onGo={setTab}
                readOnly={readOnly}
              />
            </div>
          </div>
        )}

        {/* Six tabs do not fit on a narrow phone, so the bar scrolls sideways.
            It always did, but with four it only just overflowed and the cut fell
            in the gap between two tabs, which read as an edge. Past that the cut
            lands mid-word, which reads as broken. The mask fades the last few
            pixels so the bar looks like it continues rather than like it failed,
            and tightening the padding below 640px buys back enough room.

            Louder than it was. The tabs are now the main thing on this card
            rather than a footnote under a block of trip details, so they are set
            on the deeper sand, at a readable size, and the selected one is a
            white tab with a teal rule under it -- a shape that says "this one"
            from across the room instead of a slightly different grey. */}
        <div className="relative min-w-0">
          <nav
            ref={tabBarRef}
            className="no-print flex min-w-0 gap-1 overflow-x-auto border-t border-[var(--line)] bg-sand-deep/40 px-2 py-1.5 [scrollbar-width:none] sm:px-3 [&::-webkit-scrollbar]:hidden"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                data-tab={t.id}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
                className={`rounded-lg border-b-2 px-3 py-2.5 text-[0.95rem] font-semibold whitespace-nowrap transition sm:px-5 ${
                  tab === t.id
                    ? "border-teal bg-white text-teal shadow-sm"
                    : "border-transparent text-ink-soft hover:bg-white/50 hover:text-ink"
                }`}
              >
                {t.label}
                {/* The same red count the menu bar puts on Reminders, for the
                    same reason: a tab worth opening should say so from the
                    outside. Tips are the one thing on a trip that arrive
                    without anybody asking -- a look files them while you are
                    reading something else -- so the tab is the only place that
                    can mention them. */}
                {t.id === "tips" && tipCount > 0 && (
                  <span className="ml-1.5 inline-block min-w-[1.15rem] rounded-full bg-rose px-1 text-[0.7rem] font-bold leading-[1.15rem] text-white">
                    {tipCount}
                    <span className="sr-only"> tips to read</span>
                  </span>
                )}
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
        {/* The Tips tab holds the advice about the trip as a whole, and now only
            that. The button that asks for a look moved up into the header: the
            same press was never really about this tab -- it walks the trip, the
            packing list and the next few bookings -- and having it here meant
            waiting out most of a minute on the tab least likely to be the one
            that changed. */}
        {tab === "tips" && (
          <ProTips
            canLook={false}
            showEmpty
            tips={tips.filter((tip) => tip.scope === "trip")}
            today={today}
            tripId={trip.id}
            scope="trip"
            everLooked={everLooked}
            heading="Pro tips for this trip"
            emptyFresh="Nothing here yet. Look for tips, at the top of this trip, and anything genuinely useful about these particular plans will show up here."
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
        {tab === "overview" && (
          <TripOverview
            trip={info}
            people={people}
            pets={pets}
            going={going}
            onGoingChange={setGoing}
            petLinks={petLinks}
            onPetLinksChange={setPetLinks}
            packing={packing}
            stats={stats}
            readOnly={readOnly}
            past={past}
            onPackingChanged={() => refetch("packing_items")}
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
            everLooked={everLooked}
            travelers={travelers}
            going={goingNames}
            userId={userId}
            templates={packingTemplates}
            templateItems={packingTemplateItems}
            tripTemplateIds={tripTemplateIds}
            templatesChosen={templatesChosen}
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
