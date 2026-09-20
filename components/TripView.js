"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { tabKeyDown } from "@/lib/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { sortItinerary } from "@/lib/day/order";
import {
  countdownSaid,
  daysUntil,
  formatRange,
  isDraftTrip,
  isPastTrip,
  localToday,
} from "@/lib/format";
import { openingTabForLink } from "@/lib/trips/opening";
import PromoteDraft from "./PromoteDraft";
import ArchiveTrip from "./ArchiveTrip";
import TripBackdrop from "./TripBackdrop";
import TripBackLink from "./TripBackLink";
import { PencilIcon } from "./Icons";
import TripOverview from "./TripOverview";
import TripForm from "./TripForm";
import { houseListOnto } from "@/lib/tasks/onto";
import Itinerary from "./Itinerary";
import Packing from "./Packing";
import Tasks from "./Tasks";
import Notes from "./Notes";
import Budget from "./Budget";
import Insurance from "./Insurance";
import AskAlyDrawer from "./AskAlyDrawer";
import ProTips from "./ProTips";
import LookForTips from "./LookForTips";
import OnTripTips from "./OnTripTips";
import { localDay, onTripWindow } from "@/lib/tips/onTrip";
import TripChanges from "./TripChanges";
import ClearedTips from "./ClearedTips";
import { lookSummary } from "@/lib/tips/run";
import { lookedToday } from "@/lib/tips/tip";
import { onTipResolved } from "@/lib/tips/cleared";
import { isComing } from "@/lib/pets/pets";
import CoverQueue from "./CoverQueue";
import { coverQueuePatch } from "@/lib/covers/queue";
import { SECONDARY } from "@/lib/travelers/access";
import NavCount from "./NavCount";
import {
  withLeaves,
  holdingGroup,
  opensASecondRow,
  countPlacement,
} from "@/lib/nav/groups";

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
      <h3 className="text-xs font-bold uppercase tracking-[0.09em] text-ink-soft">
        Tips on other tabs
      </h3>
      {summary.places.length ? (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
            {justNow ? "Aly also added " : "There are "}
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
                className="btn btn-ghost px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em]"
              >
                {`Read ${place.label.replace(/^the /, "")}`}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
          {everLooked
            ? "No tips on the Itinerary or Packing tabs right now. When Aly finds advice for your plans or packing list, it appears on those tabs."
            : "Select Check for pro tips at the top of this trip. Advice for your plans and packing list appears on the Itinerary and Packing tabs."}
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
  { id: "tasks", label: "Reminders" },
  // Money comes after the two lists it is worked out from and after the tasks,
  // because it is the tab you go to on purpose rather than the one you live on.
  { id: "budget", label: "Budget" },
  // Insurance keeps the budget company behind the Money door. It is not a cost
  // -- an annual plan is bought once and covers three trips -- but it is the
  // other half of the same subject: one tab is what the trip costs, the other
  // is what happens when it goes wrong.
  { id: "insurance", label: "Insurance" },
  { id: "notes", label: "Notes" },
];

/**
 * The seven, gathered into four doors.
 *
 * Seven equal tabs told you nothing about which one was worth opening, and they
 * did not fit on a phone: the last two lived off the right edge, so Budget and
 * Notes existed only for somebody who thought to drag the bar. And the seven are
 * not seven kinds of thing. They are four -- what the trip is, what the days
 * hold, what has to be done before anybody leaves, and what it costs -- with
 * three of them happening to be stored in different tables.
 *
 * So the bar carries the four, and a lighter second row appears only inside a
 * door that has more than one thing behind it. Nothing is hidden, nothing
 * scrolls out of sight, and the grouping is about what you came to do rather
 * than which table the rows came from.
 *
 * The selected leaf remains the unit of state, so ?tab=tasks, the change card's
 * landing tab and Aly's focus all keep working untouched.
 */
const TAB_GROUPS = [
  { id: "g-trip", label: "Trip", tabs: ["overview", "notes"] },
  { id: "g-days", label: "Days", tabs: ["itinerary"] },
  { id: "g-ready", label: "Getting ready", tabs: ["packing", "tasks", "tips"] },
  { id: "g-money", label: "Money", tabs: ["budget", "insurance"] },
];

export default function TripView({
  trip,
  initialItinerary,
  initialPacking,
  initialDayPack = [],
  initialTasks,
  initialNotes,
  initialCosts = [],
  travelers,
  people = [],
  initialGoing = [],
  pets = [],
  initialPetLinks = [],
  tips = [],
  everLooked = false,
  // When the trip was last researched, ISO. Null on a trip nobody has ever
  // looked at. Used to decide whether opening the trip should run the look on
  // its own: yes if a new day has started since the last one, or the
  // itinerary has moved since the last one; no otherwise, because a look
  // costs most of a minute of grounded model time and nothing on the trip
  // has changed that would give a different answer.
  lastLookedAt = null,
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
  initialTab = null,
  // The forwarded fares that matched this trip, and the forwarding instructions
  // while a seat is still to buy. Rendered on the server and handed down, so it
  // arrives with the page rather than after it. It sits under Overview, which is
  // the tab that answers what this trip is and how it is coming along.
  fares = null,
  // Two things about the household this trip may no longer match, both worked out
  // on the server on every draw and stored nowhere. `contradictions` is
  // arithmetic -- a dog on a sailing that takes no dogs -- and cannot be waved
  // off. `changes` is drift from the circumstances the trip was last planned
  // against, and can be answered either by looking again or by saying it's fine.
  contradictions = [],
  changes = [],
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
  // Money goes with the notes for a secondary traveler, and this one is the
  // database's choice as well as ours: trip_costs is readable only by a full
  // member of the family, so a minor or a friend along for the ride would open
  // the tab onto half a budget. What the trip costs is not their business.
  const tabs = readOnly
    ? TABS.filter((t) => t.id !== "notes" && t.id !== "budget")
    : TABS;
  const [tab, setTab] = useState(() =>
    openingTabForLink(trip, today, initialTab, tabs.map(t => t.id)));
  const openedTripRef = useRef(null);
  // The four doors, holding only the leaves this reader is allowed to see: a
  // secondary traveler loses Notes and Budget, so their Money door holds
  // Insurance alone. That is deliberate rather than an oversight -- what the
  // trip cost is not their business, but the evacuation number is, and a minor
  // stuck in a clinic abroad should be able to read the policy without waiting
  // on a parent's phone.
  const groups = useMemo(() => withLeaves(TAB_GROUPS, tabs), [tabs]);
  const group = holdingGroup(groups, tab);
  // Where you were inside each door. Coming back to Getting ready should return
  // to the tasks you were working through, not start again at Packing.
  const [lastLeaf, setLastLeaf] = useState({});
  useEffect(() => {
    if (!group) return;
    setLastLeaf((prev) =>
      prev[group.id] === tab ? prev : { ...prev, [group.id]: tab },
    );
  }, [group, tab]);
  const openGroup = useCallback(
    (g) => {
      const wanted = lastLeaf[g.id];
      setTab(g.leaves.some((t) => t.id === wanted) ? wanted : g.leaves[0].id);
    },
    [lastLeaf],
  );
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
    const btn = bar?.querySelector(`[data-tab="${group?.id}"]`);
    if (!bar || !btn) return;
    // Moved by hand rather than with scrollIntoView, which walks every ancestor
    // and is entitled to scroll the page itself to satisfy the request. Pressing
    // a tab should never move the page under the reader, so only this bar's
    // horizontal offset is touched, and only when the tab is actually outside it.
    const left = btn.offsetLeft;
    const right = left + btn.offsetWidth;
    if (left < bar.scrollLeft) bar.scrollLeft = Math.max(0, left - 12);
    else if (right > bar.scrollLeft + bar.clientWidth)
      bar.scrollLeft = right - bar.clientWidth + 12;
  }, [group?.id]);

  // Resolve the device's calendar once per arrival, not on every refreshed trip
  // object. Explicit links win, and subsequent manual tab changes stay put.
  useEffect(() => {
    const key = `${trip.id}:${initialTab || ""}`;
    if (openedTripRef.current === key) return;
    openedTripRef.current = key;
    const wanted = new URLSearchParams(window.location.search).get("tab");
    setTab(openingTabForLink(trip, localToday(), wanted, tabs.map(t => t.id)));
  }, [trip, initialTab, tabs]);
  const [itinerary, setItinerary] = useState(initialItinerary);
  const [packing, setPacking] = useState(initialPacking);
  // The bags carried on particular days. Held beside the suitcase list rather than
  // inside it because the two lists mean different things by "packed".
  const [dayPack, setDayPack] = useState(initialDayPack);
  const [tasks, setTasks] = useState(initialTasks);
  const [notes, setNotes] = useState(initialNotes);
  const [costs, setCosts] = useState(initialCosts);
  const [going, setGoing] = useState(initialGoing);
  // Which animals are on this trip, and under what arrangement. Decided here
  // rather than on the Family tab: "is the dog coming to Curaçao" is a fact
  // about Curaçao, and answering it used to mean opening the dog.
  const [petLinks, setPetLinks] = useState(initialPetLinks);

  // Who is on the trip is also what the contradictions are about, and those are
  // worked out on the server on every draw. So the roster keeps its own state --
  // the chips have to answer the tap immediately -- and then asks the server to
  // draw the page again, because otherwise the one thing the tap most needed to
  // cause cannot happen. Adding a horse to a trip with a sailing on it saved the
  // horse, moved the packing list, and said nothing at all about the sailing
  // until somebody happened to reload the page, which is exactly the load nobody
  // does after they have just finished a thing.
  const rosterChanged = useCallback(
    (next, apply) => {
      apply(next);
      router.refresh();
    },
    [router],
  );
  const goingChanged = useCallback(
    (next) => rosterChanged(next, setGoing),
    [rosterChanged],
  );
  const petLinksChanged = useCallback(
    (next) => rosterChanged(next, setPetLinks),
    [rosterChanged],
  );

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
      } else if (table === "day_pack_items") {
        const { data } = await supabase
          .from("day_pack_items")
          .select("*")
          .eq("trip_id", trip.id)
          .order("item_date", { ascending: true })
          .order("sort_order", { ascending: true });
        if (data) setDayPack(data);
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
      } else if (table === "trip_costs") {
        const { data } = await supabase
          .from("trip_costs")
          .select("*")
          .eq("trip_id", trip.id)
          .order("created_at", { ascending: true });
        if (data) setCosts(data);
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
      "day_pack_items",
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
    // The status field on this form is the second of the three ways a trip can
    // stop being a draft, so it asks for a picture the same way the first one
    // does -- one extra column on the write already happening.
    const { data, error } = await supabase
      .from("trips")
      .update({ ...values, ...(coverQueuePatch(info, values) || {}) })
      .eq("id", trip.id)
      .select("*")
      .maybeSingle();
    if (error) return error.message;
    if (data) setInfo(data);
    setEditing(false);
    // And the second of the three ways is also the second place the house list
    // has to be attached: a trip whose status field was changed from Draft by
    // hand is out of Drafts just as surely as one moved with the button, and
    // until now only the button's route ever put the bins on it.
    if (isDraftTrip(info) && data && !isDraftTrip(data)) {
      await houseListOnto(trip.id);
      refetch("predeparture_tasks");
    }
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
  const [deviceToday, setDeviceToday] = useState(null);
  useEffect(() => {
    const update = () => setDeviceToday(localDay(Intl.DateTimeFormat().resolvedOptions().timeZone));
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const onTrip = Boolean(onTripWindow(info, deviceToday));

  // Whether opening this trip should ask Aly to check for pro tips on its own,
  // rather than waiting for somebody to press the button. Two ways in: a new
  // calendar day has started since the last check, or the itinerary has moved
  // since the last check (a booking added, a time shifted, a card removed).
  // Both matter: a look on Tuesday morning may find advice that yesterday's
  // did not, and an itinerary change can invalidate advice that was true
  // against the old one. A trip that has never been looked at qualifies too.
  //
  // This gate is only for upcoming trips. On-trip visits use OnTripTips instead,
  // with a fresh focused conditions check on every open and foreground return.
  // Draft and past trips are out: a draft has nothing to research yet, and
  // advice for a trip that is over is a footnote.
  const shouldAutoLook = (() => {
    if (readOnly) return false;
    if (isDraftTrip(info)) return false;
    if (past) return false;
    // Not looked since local midnight. A look yesterday afternoon and one at
    // 8am today should both count as "once a day", so the boundary is the wall
    // clock's midnight rather than a rolling 24 hours. Shared with the Wallet,
    // which runs the same gate on its own look.
    if (!lookedToday(lastLookedAt)) return true;
    const looked = Date.parse(lastLookedAt);
    // Newest itinerary edit. If the trip changed after the last look, the
    // advice may no longer fit -- a flight added at 6am wants the check to
    // notice by 6:01.
    const newestEdit = itinerary
      .map((row) => Date.parse(row?.updated_at || ""))
      .filter((n) => Number.isFinite(n))
      .reduce((a, b) => (b > a ? b : a), 0);
    if (newestEdit > looked) return true;
    return false;
  })();

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
    { label: "Reminders done", value: `${taskCount}/${tasks.length}` },
    { label: "Needs booking", value: openBookings },
  ];

  return (
    <main className="screen px-5 pb-20 pt-6">
      <TripBackLink trip={info} today={today} />
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
      {/* Headless. If this trip was promoted and its picture was never asked
          for, this is what asks. */}
      <CoverQueue trips={[info]} />
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
          /* What is worth carrying between tabs, and nothing else: what this
             trip is called, when it is, where it is, and how far away. The
             description, the roster and the counting tiles moved to the
             Overview tab, because a header that is read once should not take a
             third of the screen on the four tabs where it is not being read.

             Set on the trip's own plate now -- the illustration and the coast
             behind it, the same picture the card on the trip list carries -- so
             opening a trip lands you somewhere rather than on a white strip. */
          <div className={tab === "overview" ? "trip-plate on-photo min-h-[216px] justify-end sm:min-h-[228px]" : "trip-working-header"}>
            {tab === "overview" && <TripBackdrop trip={info} shape="head" />}
            <div className={`relative flex flex-col gap-3.5 p-5 sm:flex-row sm:items-end sm:justify-between ${tab === "overview" ? "pt-10" : ""}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="emoji-badge" aria-hidden="true">
                    {info.cover_emoji}
                  </span>
                  <h1 className="font-display text-2xl leading-tight font-semibold sm:text-2xl">
                    {info.name}
                  </h1>
                  {countdown !== null && countdown >= 0 && (
                    <span className="chip chip-shade">
                      {countdownSaid(countdown)}
                    </span>
                  )}
                </div>
                {/* Dates and place on one line where there is room, and on two
                    where there is not. The separator dot belongs to the place, so
                    a wrap can never leave a dot stranded at the start of a line
                    the way an inline "· {destination}" did at 320px. */}
                <p className="mt-1.5 text-sm">
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

                  Side by side over the picture on a wide screen, stacked full
                  width on a phone. Both carry an icon, which is what tells them
                  apart at a glance now that they sit together rather than in a
                  column. */}
              <div className="no-print flex shrink-0 flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="btn btn-ghost btn-sm no-print"
                  >
                    <PencilIcon />
                    Edit trip
                  </button>
                )}
                {onTrip ? <OnTripTips key={trip.id} tripId={trip.id} readOnly={readOnly} /> : <LookForTips
                  tripId={trip.id}
                  chain={lookAt}
                  scope="trip"
                  hasTips={tips.length > 0}
                  onLooked={setLanded}
                  onGo={setTab}
                  readOnly={readOnly}
                  autoRun={Boolean(deviceToday) && shouldAutoLook}
                />}
                {/* Only on a trip that is over, and quieter than the two buttons
                    above it: tidying the shelf is not why anybody opened this
                    screen. Both directions live here, so the way out of the
                    archive is on the trip you archived. */}
                {!readOnly && past && (
                  <span className="flex justify-end sm:ml-1">
                    <ArchiveTrip trip={info} />
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* What the family has changed since this trip was planned, and what on it
          cannot happen at all. Between the header and the tabs on purpose: it is
          about the whole trip rather than any one tab, and a reader who has just
          added a wheelchair on the Family tab should meet it before choosing
          where to look. Nothing is drawn when nothing has drifted. */}
      <TripChanges
        contradictions={contradictions}
        changes={changes}
        tripId={trip.id}
        readOnly={readOnly}
        onGo={setTab}
        onDone={() => router.refresh()}
      />

      {/* Four doors, and a second row only where a door has more than one thing
          behind it. The bar can still scroll sideways -- a long trip name does
          not change its width, but a translation or a large font could -- and the
          mask fades the last few pixels so it looks like it continues rather than
          like it failed.

          Out of the card and onto the page. It was a strip of deeper sand
          inside the header card with the selected tab drawn as a white pill,
          which read as a row of buttons of which one happened to be lit. The
          shape a tab wants is the other one: a rule under the whole bar, the
          selected tab tinted and squared into that rule with a short accent bar
          sitting on it, so the tab and the panel below it are visibly one
          surface and the rest are behind it. */}
      <div className="relative mt-4 min-w-0">
        <nav ref={tabBarRef} className="tabbar no-print" role="tablist" aria-label="Trip sections" onKeyDown={tabKeyDown}>
          {groups.map((g) => {
            const here = group?.id === g.id;
            // Where the red count sits, decided by the rule both navigations
            // now share rather than by this bar alone: on the door while the
            // thing it counts is not what you are looking at, on the leaf once
            // the door is open and you are somewhere else inside it.
            const placed = countPlacement(g, tab, { tips: tipCount });
            return (
              <button
                key={g.id}
                data-tab={g.id}
                type="button"
                role="tab"
                id={`trip-group-${g.id}`}
                aria-controls="trip-group-panel"
                tabIndex={here ? 0 : -1}
                aria-selected={here}
                aria-current={here ? "page" : undefined}
                onClick={() => openGroup(g)}
                className="tab"
              >
                {g.label}
                <NavCount n={placed.onDoor} what="tips to read" />
              </button>
            );
          })}
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

      {/* Lighter than the bar above it on purpose: these are the same door, not
          four more of them. A door with one thing behind it draws nothing, so
          Days and Money stay silent. */}
      <div role="tabpanel" id="trip-group-panel" aria-labelledby={`trip-group-${group?.id}`} tabIndex={0}>
      {opensASecondRow(group) && (
        <div
          className="no-print mt-3 flex flex-wrap gap-2"
          role="tablist"
          onKeyDown={tabKeyDown}
          aria-label={`Inside ${group.label}`}
        >
          {group.leaves.map((t) => {
            const here = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`trip-tab-${t.id}`}
                aria-controls="trip-content-panel"
                tabIndex={here ? 0 : -1}
                aria-selected={here}
                onClick={() => setTab(t.id)}
                className={here ? "chip chip-shade font-semibold" : "chip"}
              >
                {t.label}
                <NavCount
                  n={t.id === "tips" ? tipCount : 0}
                  what="tips to read"
                  size="leaf"
                />
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-4" id="trip-content-panel"
        role={opensASecondRow(group) ? "tabpanel" : undefined}
        aria-labelledby={opensASecondRow(group) ? `trip-tab-${tab}` : undefined}
        tabIndex={opensASecondRow(group) ? 0 : undefined}>
        {tab === "packing" && <p className="scope-caption">For this trip · {info.name}</p>}
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
            emptyFresh="Nothing here yet. Check for pro tips, at the top of this trip, and anything genuinely useful about these particular plans will show up here."
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
              daypack: tips.filter((tip) => tip.scope === "daypack").length,
            }}
            everLooked={everLooked}
            onGo={setTab}
          />
        )}
        {/* And what this trip has already been told and cleared, under the tips
            it came from rather than at the foot of the Reminders screen, which
            is where it used to be: a record of every trip's cleared advice on a
            page about none of them. */}
        {tab === "tips" && !readOnly && <ClearedTips tripId={trip.id} />}
        {tab === "overview" && (
          <>
            <TripOverview
              trip={info}
              people={people}
              pets={pets}
              going={going}
              onGoingChange={goingChanged}
              petLinks={petLinks}
              onPetLinksChange={petLinksChanged}
              packing={packing}
              stats={stats}
              readOnly={readOnly}
              past={past}
              onPackingChanged={() => refetch("packing_items")}
            />
            {fares}
          </>
        )}
        {tab === "itinerary" && (
          <Itinerary
            items={itinerary}
            tripId={trip.id}
            familyId={info.family_id}
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
            dayPack={dayPack}
            dayTips={tips.filter((tip) => tip.scope === "daypack")}
            people={goingNames}
            userId={userId}
            onDayPackChange={() => {
              // A day pack write can touch the case too: adding something puts it
              // on the list when it is not there, and taking it off can remove it
              // when the family says so. Refreshing only the one table left the
              // packing screen a version behind.
              return Promise.all([refetch("day_pack_items"), refetch("packing_items")]);
            }}
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
            dayPack={dayPack}
            dayTips={tips.filter((tip) => tip.scope === "daypack")}
            onDayPackChange={() => {
              // Both tables, for the reason given on the itinerary above.
              return Promise.all([refetch("day_pack_items"), refetch("packing_items")]);
            }}
            today={today}
            everLooked={everLooked}
            travelers={travelers}
            going={goingNames}
            userId={userId}
            templates={packingTemplates}
            templateItems={packingTemplateItems}
            tripTemplateIds={tripTemplateIds}
            templatesChosen={templatesChosen}
            tasks={tasks}
            trip={info}
            onTaskChange={() => refetch("predeparture_tasks")}
            onOpenTasks={() => setTab("tasks")}
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
        {tab === "budget" && (
          <Budget
            trip={info}
            itinerary={itinerary}
            costs={costs}
            onChange={() => refetch("trip_costs")}
            onTripChange={() => refetch("itinerary_items")}
            readOnly={readOnly}
          />
        )}
        {tab === "insurance" && (
          <Insurance
            trip={info}
            people={people}
            going={going}
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
          refetch("trip_costs");
        }}
        // Aly can change the trip itself, or another trip entirely, and only the
        // server can redraw those. Held until the drawer closes.
        onRefresh={() => router.refresh()}
      />
    </main>
  );
}
