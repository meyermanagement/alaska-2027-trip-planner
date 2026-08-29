"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ProTips from "./ProTips";
import { createClient } from "@/lib/supabase/client";
import LocationField from "@/components/LocationField";
import AddToCalendar from "@/components/AddToCalendar";
import { eventFromItem, eventFromTask } from "@/lib/calendar";
import {
  scrollWon,
  selectionText,
  startsInControl,
  swipeDirection,
} from "@/lib/gestures/swipe";
import {
  CATEGORY_ICONS,
  STATUS_STYLES,
  carryEnd,
  earliestEnd,
  endDateLabel,
  formatDay,
  formatNights,
  formatShortDay,
  formatStayRange,
  formatTime,
  homeToday,
  isSpanning,
  livedDay,
  localToday,
  openingDay,
  parseDate,
  stayNights,
} from "@/lib/format";
import Stars from "@/components/Stars";
import { canReviewNow, reviewTarget } from "@/lib/reviews/when";

const UNSCHEDULED = "unscheduled";
const DAY_MS = 86400000;

/** Every day from one date to another, inclusive, as YYYY-MM-DD. */
function daysBetween(start, end) {
  const out = [];
  if (!start || !end) return out;
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  let cursor = Date.UTC(ys, ms - 1, ds);
  const last = Date.UTC(ye, me - 1, de);
  // A guard so a bad pair of dates can never spin forever.
  for (let n = 0; cursor <= last && n < 400; n += 1) {
    out.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += DAY_MS;
  }
  return out;
}

/** Every calendar day of the trip, so empty days can still be reached. */
function buildDayKeys(start, end, itemDates) {
  const keys = daysBetween(start, end);
  // Anything scheduled outside the trip window still deserves a day. A stay
  // that runs past the last planned day brings its own days along with it.
  itemDates.forEach((d) => {
    if (d && !keys.includes(d)) keys.push(d);
  });
  keys.sort();
  return keys;
}

/**
 * A stay is filed under its first day as a full card, and shows up on the days
 * in between as a quiet one-line reminder of where everyone is sleeping. The
 * last day gets the check-out line instead, since that morning you are leaving.
 */
function buildStays(items) {
  const map = new Map();
  (items || []).forEach((item) => {
    if (!isSpanning(item.category)) return;
    const nights = stayNights(item.item_date, item.end_date);
    if (!nights) return;
    daysBetween(item.item_date, item.end_date).forEach((day, i) => {
      if (i === 0) return; // the first day already has the full card
      if (!map.has(day)) map.set(day, []);
      const leaving = i === nights;
      // On the last day nobody sleeps there, so there is no night to number.
      map
        .get(day)
        .push({ item, night: leaving ? null : i + 1, nights, leaving });
    });
  });
  return map;
}

const CATEGORIES = [
  "activity",
  "flight",
  "lodging",
  "cruise",
  "excursion",
  "dining",
  "transport",
  "note",
];
const STATUSES = [
  "confirmed",
  "planned",
  "optional",
  "needs_booking",
  "cancelled",
];

const EMPTY = {
  title: "",
  item_date: "",
  end_date: "",
  start_time: "",
  category: "activity",
  status: "planned",
  location: "",
  notes: "",
  confirmation_number: "",
};

function toDraft(item) {
  return {
    title: item.title || "",
    item_date: item.item_date || "",
    end_date: item.end_date || "",
    start_time: item.start_time ? item.start_time.slice(0, 5) : "",
    category: item.category || "activity",
    status: item.status || "planned",
    location: item.location || "",
    notes: item.notes || "",
    confirmation_number: item.confirmation_number || "",
  };
}

function ItemFields({ draft, setDraft, destination = "" }) {
  const set = (patch) => setDraft({ ...draft, ...patch });
  const spanning = isSpanning(draft.category);
  const nights = formatNights(draft.item_date, draft.end_date);
  // Changing a hotel into a dinner should not leave a check-out date sitting
  // in a field nobody can see any more.
  // Moving the check-in moves the whole stay: the check-out keeps its distance
  // where it can, and never lands on or before the day the stay begins.
  const setCheckIn = (item_date) => {
    if (!isSpanning(draft.category)) return set({ item_date });
    return set({
      item_date,
      end_date: carryEnd(draft.item_date, draft.end_date, item_date, 1),
    });
  };
  // Becoming a stay earns a check-out date; ceasing to be one gives it up.
  const setCategory = (category) => {
    if (!isSpanning(category)) return set({ category, end_date: "" });
    return set({
      category,
      end_date:
        stayNights(draft.item_date, draft.end_date) || !draft.item_date
          ? draft.end_date
          : earliestEnd(draft.item_date),
    });
  };
  return (
    <>
      <input
        className="field"
        placeholder="What is happening?"
        value={draft.title}
        onChange={(e) => set({ title: e.target.value })}
        required
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-soft">
            {spanning ? "Check in" : "Date"}
          </span>
          <input
            className="field"
            type="date"
            value={draft.item_date}
            onChange={(e) => setCheckIn(e.target.value)}
          />
        </label>
        {spanning && (
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-ink-soft">
              {endDateLabel(draft.category)}
              {nights && (
                <span className="ml-1.5 font-normal text-ink-faint">
                  {nights}
                </span>
              )}
            </span>
            <input
              className="field"
              type="date"
              value={draft.end_date}
              min={earliestEnd(draft.item_date) || undefined}
              onChange={(e) => set({ end_date: e.target.value })}
            />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-soft">
            {spanning ? "Check-in time" : "Time"}
          </span>
          <input
            className="field"
            type="time"
            value={draft.start_time}
            onChange={(e) => set({ start_time: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-soft">
            Type
          </span>
          <select
            className="field"
            value={draft.category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_ICONS[c]} {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-soft">
            Status
          </span>
          <select
            className="field"
            value={draft.status}
            onChange={(e) => set({ status: e.target.value })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_STYLES[s].label}
              </option>
            ))}
          </select>
        </label>
        <LocationField
          value={draft.location}
          onChange={(location) => set({ location })}
          // What is happening is usually where it is happening, so the box
          // searches for the title when it has nothing of its own to go on.
          title={draft.title}
          category={draft.category}
          destination={destination}
        />
        <input
          className="field"
          placeholder="Confirmation number"
          value={draft.confirmation_number}
          onChange={(e) => set({ confirmation_number: e.target.value })}
        />
      </div>
      <textarea
        className="field"
        rows={3}
        placeholder="Notes"
        value={draft.notes}
        onChange={(e) => set({ notes: e.target.value })}
      />
    </>
  );
}

/** "Flights to Curacao - not booked" becomes "Book flights to Curacao". */
/**
 * The stars and the note, on an itinerary row for something that has happened.
 *
 * Reads from and writes to `target` rather than the row it is drawn under, so the
 * four nights of one hotel share one opinion. It says so out loud when those are
 * different rows -- a note that appears under a different night than the one you
 * typed it on would otherwise look like a bug.
 *
 * The note stays closed until asked for. Every finished item growing a textarea
 * would turn the last day of a trip into a wall of empty boxes.
 */
function ReviewRow({ item, target, busy, onSave }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(target.review || "");
  const saving = busy === target.id;
  const elsewhere = target.id !== item.id;

  // The note belongs to the place, and the place can be reviewed from any of its
  // nights. Somebody rating it from night four should not find night two's stale
  // draft in the box.
  useEffect(() => {
    if (!open) setDraft(target.review || "");
  }, [target.review, open]);

  async function submit(e) {
    e.preventDefault();
    const err = await onSave(item, { review: draft.trim() || null });
    if (!err) setOpen(false);
  }

  return (
    <div className="no-print mt-3 border-t border-[var(--line)] pt-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Stars
            size="sm"
            value={target.rating || 0}
            onPick={(rating) =>
              onSave(item, {
                rating: rating === target.rating ? null : rating,
              })
            }
          />
          {!target.rating && !target.review && (
            <span className="text-xs text-ink-faint">
              Been here now — how was it?
            </span>
          )}
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => {
              setDraft(target.review || "");
              setOpen(true);
            }}
            className="whitespace-nowrap text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal"
          >
            {target.review ? "Edit note" : "Add a note"}
          </button>
        )}
      </div>

      {elsewhere && (
        <p className="mt-1.5 text-xs text-ink-faint">
          Saved once for every night of this stay.
        </p>
      )}

      {open ? (
        <form onSubmit={submit} className="mt-2 space-y-2">
          <textarea
            className="field text-sm"
            rows={2}
            autoFocus
            value={draft}
            placeholder="Would we go back? What should we remember?"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary px-3 py-1.5 text-xs"
              disabled={saving}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="btn btn-ghost px-3 py-1.5 text-xs"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        target.review && (
          <p className="mt-2 rounded-xl bg-sand px-3 py-2 text-sm leading-relaxed">
            {target.review}
          </p>
        )
      )}
    </div>
  );
}

function bookingTaskTitle(title) {
  let t = (title || "").trim();
  t = t.replace(/[\s—-]*\(?not\s+booked\)?\.?$/i, "").trim();
  t = t.replace(/^book\s+/i, "").trim();
  if (!t) return "Book this";
  // Leave acronyms like "STL to CUR" alone; lowercase an ordinary first word.
  const firstWord = t.split(/\s+/)[0];
  const body =
    firstWord.length > 1 && firstWord === firstWord.toUpperCase()
      ? t
      : t[0].toLowerCase() + t.slice(1);
  return `Book ${body}`;
}

/** How soon a booking task ought to sit, judged by the trip's own dates. */
function bookingTiming(itemDate) {
  if (!itemDate) return "now";
  const days = Math.round((parseDate(itemDate) - new Date()) / 86400000);
  if (days <= 7) return "week_before";
  if (days <= 45) return "month_before";
  return "now";
}

function payload(draft) {
  return {
    title: draft.title.trim(),
    item_date: draft.item_date || null,
    // The second date is only kept when it belongs to this kind of item and
    // actually lands after the first, so switching a hotel to a dinner cannot
    // leave an orphaned check-out date behind.
    end_date:
      isSpanning(draft.category) && stayNights(draft.item_date, draft.end_date)
        ? draft.end_date
        : null,
    start_time: draft.start_time || null,
    category: draft.category,
    status: draft.status,
    location: draft.location.trim() || null,
    notes: draft.notes.trim() || null,
    confirmation_number: draft.confirmation_number.trim() || null,
  };
}

// readOnly is a secondary traveler. They are meant to see the plan -- that is
// most of the point of their having an account -- and to change none of it. What
// survives is everything that reads: the items, their status pills, the tips, and
// "Add to calendar", which writes nothing here.
export default function Itinerary({
  items,
  tripId,
  onChange,
  tripStart,
  tripEnd,
  tasks = [],
  onTaskChange = () => {},
  onOpenTasks = () => {},
  tripName,
  destination = "",
  tips = [],
  readOnly = false,
  // Today, worked out on the server in the family's own zone and handed down so
  // the first frame the browser draws opens on the same day it would have picked
  // for itself. Named apart from the value used below because there is a fallback.
  today: todayProp = "",
}) {
  const supabase = useMemo(() => createClient(), []);
  // Grouped once rather than filtered inside every card, because a long day in
  // Alaska is thirty cards and thirty passes over the same list.
  const tipsByItem = useMemo(() => {
    const map = new Map();
    for (const tip of tips) {
      if (!tip.itinerary_item_id) continue;
      const list = map.get(tip.itinerary_item_id) || [];
      list.push(tip);
      map.set(tip.itinerary_item_id, list);
    }
    return map;
  }, [tips]);
  const tipsFor = useCallback((id) => tipsByItem.get(id) || [], [tipsByItem]);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const visible = items.filter((i) =>
    filter === "all"
      ? true
      : filter === "open"
        ? i.status === "needs_booking" || i.status === "optional"
        : i.status === "confirmed",
  );

  // The rail is built from the trip window, not from what happens to be
  // booked, so a quiet day is still somewhere you can go and add to.
  const dayKeys = useMemo(
    () =>
      buildDayKeys(
        tripStart,
        tripEnd,
        items.flatMap((i) =>
          stayNights(i.item_date, i.end_date)
            ? daysBetween(i.item_date, i.end_date)
            : [i.item_date],
        ),
      ),
    [tripStart, tripEnd, items],
  );
  const hasUnscheduled = items.some((i) => !i.item_date);
  const railKeys = useMemo(
    () => (hasUnscheduled ? [...dayKeys, UNSCHEDULED] : dayKeys),
    [dayKeys, hasUnscheduled],
  );

  const byDay = useMemo(() => {
    const map = new Map();
    visible.forEach((item) => {
      const key = item.item_date || UNSCHEDULED;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }, [visible]);

  const staysByDay = useMemo(() => buildStays(visible), [visible]);

  // What day it is, handed down from the server in the family's own zone. This
  // screen used to work it out from the raw browser clock, which let three things
  // disagree at once on the day of a trip: this rail, the band at the top of the
  // page counting which day of the trip it is, and the first frame the server drew
  // -- Vercel runs in UTC, so from seven in the evening in Missouri the server had
  // already moved on to tomorrow and marked the wrong tile. It is state rather than
  // a constant because the effect further down may hand it to the device instead
  // once the browser is awake and can say where it is. The fallback is only for a
  // caller that forgets the prop.
  const [today, setToday] = useState(() => todayProp || homeToday());

  // Open on the day the family is living, not on the first morning of the trip.
  const [selected, setSelected] = useState(
    () => openingDay(dayKeys, today) ?? UNSCHEDULED,
  );

  // Re-decide only when the day that was chosen no longer exists -- an item moved,
  // a stay stretched, the trip's dates redrawn. Doing it whenever anything changed
  // would drag somebody who is reading day six back to today under them.
  useEffect(() => {
    if (railKeys.length && !railKeys.includes(selected)) {
      setSelected(openingDay(railKeys, today) ?? railKeys[0]);
    }
  }, [railKeys, selected, today]);

  // Once, on arrival: if the phone in the hand says a different day than home does
  // and that day belongs to this trip, that is the day being lived. Alaska is four
  // hours behind Missouri, so without this an evening in Ketchikan would open on
  // tomorrow's tour. Deliberately after hydration rather than during render, so the
  // browser draws the server's frame first and there is nothing to mismatch, and
  // deliberately once, so a day somebody has chosen by hand is never moved under
  // them.
  const settled = useRef(false);
  useEffect(() => {
    if (settled.current) return;
    settled.current = true;
    const lived = livedDay(today, localToday(), dayKeys);
    if (lived === today) return;
    setToday(lived);
    setSelected(openingDay(dayKeys, lived) ?? UNSCHEDULED);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The time of day on the device, "HH:MM", or null until the browser says.
  //
  // Null on purpose for the first frame. The server cannot know what time it is
  // where the family is standing, so if this started as a guess the server would
  // render one set of rows as reviewable and the browser would render another, and
  // React would paper over the difference. Null means no timed item on today counts
  // as done yet, which is a thing both sides can agree on.
  //
  // The device clock rather than home's, for the same reason the day above follows
  // the device: the question is whether dinner has happened where the family is
  // sitting, and in Ketchikan that is four hours off Missouri.
  const [nowHM, setNowHM] = useState(null);
  useEffect(() => {
    const read = () => {
      const d = new Date();
      setNowHM(
        `${String(d.getHours()).padStart(2, "0")}:${String(
          d.getMinutes(),
        ).padStart(2, "0")}`,
      );
    };
    read();
    // A trip is a screen people leave open. Seven o'clock arriving while the page
    // sits on a nightstand should bring the dinner's stars with it.
    const timer = setInterval(read, 60000);
    return () => clearInterval(timer);
  }, []);

  const railRef = useRef(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || typeof ResizeObserver === "undefined") return;
    const measure = () =>
      setOverflowing(rail.scrollWidth > rail.clientWidth + 4);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(rail);
    return () => ro.disconnect();
  }, [railKeys.length]);
  // Center the chosen day inside the rail by moving the rail's own horizontal
  // scroll, never the page's. scrollIntoView() here also scrolled the window
  // down far enough to show the rail, so opening a trip landed on the pro tips
  // instead of the top of the page.
  useEffect(() => {
    const rail = railRef.current;
    const tile = rail?.querySelector('[data-active="true"]');
    if (!rail || !tile) return;
    // Measured, not offsetLeft: the rail is not a positioned ancestor, so
    // offsets would be read against whatever box above it is.
    const railBox = rail.getBoundingClientRect();
    const tileBox = tile.getBoundingClientRect();
    const left =
      rail.scrollLeft +
      (tileBox.left - railBox.left) -
      (rail.clientWidth - tileBox.width) / 2;
    const max = rail.scrollWidth - rail.clientWidth;
    rail.scrollLeft = Math.max(0, Math.min(left, max));
    // Runs again when the arrows appear or go. They are drawn only once the rail
    // has been measured and found to overflow, and drawing them takes about a
    // hundred pixels off its width -- so on a narrow phone the day was centred in
    // a rail that was about to get smaller, and ended up hanging three pixels off
    // the right edge on first load. Measured at 320px: the rail went from 312 wide
    // to 205 between the two paints.
  }, [selected, overflowing, railKeys.length]);

  const index = railKeys.indexOf(selected);
  const step = useCallback(
    (delta) => {
      const next = index + delta;
      if (next >= 0 && next < railKeys.length) setSelected(railKeys[next]);
    },
    [index, railKeys],
  );

  // Tasks made from an itinerary item keep a link back to it, so the button
  // can show what has already been handed off to the Tasks tab.
  const taskByItem = useMemo(() => {
    const map = new Map();
    tasks.forEach((t) => {
      if (t.itinerary_item_id) map.set(t.itinerary_item_id, t);
    });
    return map;
  }, [tasks]);
  const [taskBusyId, setTaskBusyId] = useState(null);
  const [reviewBusy, setReviewBusy] = useState(null);

  // Everything about this trip that has a date on it, so the whole thing can go
  // across in one file: the itinerary first, then the tasks that are still open.
  const tripEvents = useMemo(() => {
    const trip = { name: tripName, start_date: tripStart, end_date: tripEnd };
    const fromItems = items
      .filter((i) => i.item_date && i.status !== "cancelled")
      .map((i) => eventFromItem(i, trip));
    const fromTasks = tasks
      .filter((t) => !t.is_done)
      .map((t) => eventFromTask(t, trip));
    return [...fromItems, ...fromTasks].filter(Boolean);
  }, [items, tasks, tripName, tripStart, tripEnd]);

  async function makeBookingTask(item) {
    setTaskBusyId(item.id);
    setError("");
    const bits = [
      item.item_date
        ? `On the itinerary for ${formatDay(item.item_date)}`
        : null,
      item.location || null,
    ].filter(Boolean);
    const { error: err } = await supabase.from("predeparture_tasks").insert({
      trip_id: tripId,
      itinerary_item_id: item.id,
      title: bookingTaskTitle(item.title),
      detail: bits.length ? bits.join(" · ") : null,
      assignee: "Shared",
      timing: bookingTiming(item.item_date),
      sort_order: 99,
    });
    setTaskBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    onTaskChange();
  }

  const untracked = useMemo(
    () =>
      items.filter(
        (i) => i.status === "needs_booking" && !taskByItem.has(i.id),
      ),
    [items, taskByItem],
  );

  async function makeAllBookingTasks() {
    setTaskBusyId("all");
    setError("");
    const rows = untracked.map((item) => ({
      trip_id: tripId,
      itinerary_item_id: item.id,
      title: bookingTaskTitle(item.title),
      detail:
        [
          item.item_date
            ? `On the itinerary for ${formatDay(item.item_date)}`
            : null,
          item.location || null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
      assignee: "Shared",
      timing: bookingTiming(item.item_date),
      sort_order: 99,
    }));
    const { error: err } = await supabase
      .from("predeparture_tasks")
      .insert(rows);
    setTaskBusyId(null);
    if (err) {
      setError(err.message);
      return;
    }
    onTaskChange();
  }

  // A finger on the day panel might be flicking to the next day, or scrolling
  // down a long one, or dragging a selection handle across a note. Only the
  // first should move the day, so the gesture is watched the whole way rather
  // than judged on where it happened to finish.
  const touch = useRef(null);
  function onTouchStart(e) {
    if (e.touches.length > 1 || startsInControl(e.target)) {
      touch.current = null;
      return;
    }
    const t = e.touches[0];
    if (!t) return;
    touch.current = {
      x: t.clientX,
      y: t.clientY,
      at: Date.now(),
      canceled: false,
    };
  }
  function onTouchMove(e) {
    const start = touch.current;
    if (!start || start.canceled) return;
    if (e.touches.length > 1) {
      start.canceled = true;
      return;
    }
    const t = e.touches[0];
    if (!t) return;
    if (scrollWon(t.clientX - start.x, t.clientY - start.y)) {
      start.canceled = true;
    }
  }
  function onTouchEnd(e) {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dir = swipeDirection({
      dx: t.clientX - start.x,
      dy: t.clientY - start.y,
      elapsed: Date.now() - start.at,
      canceled: start.canceled,
      hasSelection: !!selectionText(),
    });
    if (dir) step(dir);
  }

  function addToDay(key) {
    cancelEdit();
    setDraft({ ...EMPTY, item_date: key === UNSCHEDULED ? "" : key });
    setAdding(true);
  }

  function startEdit(item) {
    setAdding(false);
    setError("");
    setEditingId(item.id);
    setEditDraft(toDraft(item));
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(EMPTY);
    setError("");
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editDraft.title.trim()) return;
    setBusy(true);
    setError("");
    const { error: err } = await supabase
      .from("itinerary_items")
      .update(payload(editDraft))
      .eq("id", editingId);
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    cancelEdit();
    onChange();
  }

  async function updateStatus(item, status) {
    await supabase.from("itinerary_items").update({ status }).eq("id", item.id);
    onChange();
  }

  // A rating or a note about a place, written the evening it happened rather than
  // a fortnight later on another screen.
  //
  // Written to the row reviewTarget picks, not always the row that was pressed. A
  // hotel typed in as four separate nights is one place with one opinion, and the
  // Preferences tab collapses it to one card -- a note saved against the wrong
  // night would save cleanly and then be invisible there.
  async function saveReview(item, patch) {
    const target = reviewTarget(item, items) || item;
    setReviewBusy(target.id);
    const { error: err } = await supabase
      .from("itinerary_items")
      .update(patch)
      .eq("id", target.id);
    setReviewBusy(null);
    if (err) {
      setError(err.message);
      return err;
    }
    setError("");
    onChange();
    return null;
  }

  async function remove(item) {
    if (!window.confirm(`Delete “${item.title}” from the itinerary?`)) return;
    await supabase.from("itinerary_items").delete().eq("id", item.id);
    onChange();
  }

  async function addItem(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error: err } = await supabase
      .from("itinerary_items")
      .insert({ trip_id: tripId, ...payload(draft), sort_order: 99 });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setDraft(EMPTY);
    setAdding(false);
    onChange();
  }

  return (
    <section>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-white p-1 text-xs font-semibold shadow-sm ring-1 ring-sand-deep">
          {[
            { id: "all", label: "All" },
            { id: "confirmed", label: "Confirmed" },
            { id: "open", label: "Still open" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-3 py-1.5 ${
                filter === f.id ? "bg-teal text-white" : "text-ink-soft"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <AddToCalendar
            events={tripEvents}
            title={tripName ? `${tripName} itinerary` : "Trip itinerary"}
            label="Add trip to calendar"
          />
          <button
            className="btn btn-ghost"
            onClick={() => window.print()}
            type="button"
          >
            Print
          </button>
          {!readOnly && (
            <button
              className="btn btn-primary"
              onClick={() => {
                if (adding) {
                  setAdding(false);
                  return;
                }
                addToDay(selected);
              }}
            >
              {adding ? "Close" : "+ Add"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-rose/10 px-4 py-3 text-sm font-medium text-rose">
          {error}
        </p>
      )}

      {adding && !readOnly && (
        <form onSubmit={addItem} className="card mb-5 space-y-3 p-4">
          <ItemFields
            draft={draft}
            setDraft={setDraft}
            destination={destination}
          />
          <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>
            {busy ? "Saving…" : "Add to itinerary"}
          </button>
        </form>
      )}

      {untracked.length > 1 && !readOnly && (
        <div className="no-print card mb-4 flex flex-wrap items-center justify-between gap-3 border-amber/30 bg-amber/5 p-3.5">
          <p className="text-sm text-ink-soft">
            <span className="font-semibold text-ink">
              {untracked.length} things still need booking
            </span>{" "}
            and are not on the task list yet.
          </p>
          <button
            type="button"
            onClick={makeAllBookingTasks}
            disabled={taskBusyId === "all"}
            className="btn btn-ghost text-[0.8rem]"
          >
            {taskBusyId === "all"
              ? "Adding…"
              : `Make ${untracked.length} tasks`}
          </button>
        </div>
      )}

      {railKeys.length > 1 && (
        <div className="no-print mb-4 flex items-center gap-2">
          {overflowing && (
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={index <= 0}
              aria-label="Previous day"
              className="day-arrow"
            >
              ‹
            </button>
          )}
          <div
            ref={railRef}
            role="tablist"
            aria-label="Days of this trip"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                step(1);
              }
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                step(-1);
              }
            }}
            className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 sm:gap-1.5"
          >
            {railKeys.map((key, i) => {
              const count = byDay.get(key)?.length ?? 0;
              const active = key === selected;
              const date = key === UNSCHEDULED ? null : parseDate(key);
              return (
                <button
                  key={key}
                  role="tab"
                  aria-selected={active}
                  data-active={active}
                  onClick={() => setSelected(key)}
                  className={`day-tile ${date ? "" : "day-tile-wide"} ${
                    active ? "day-tile-on" : ""
                  }`}
                >
                  {date ? (
                    <>
                      <span className="day-tile-top">
                        {date.toLocaleDateString("en-US", { weekday: "short" })}
                      </span>
                      <span className="day-tile-num">{date.getDate()}</span>
                      <span className="day-tile-foot">
                        {date.toLocaleDateString("en-US", { month: "short" })}
                      </span>
                    </>
                  ) : (
                    <span className="day-tile-loose">No date</span>
                  )}
                  <span className="day-tile-dots" aria-hidden="true">
                    {count === 0 ? (
                      <span className="day-tile-empty" />
                    ) : (
                      Array.from({ length: Math.min(count, 4) }).map((_, d) => (
                        <span key={d} className="day-tile-dot" />
                      ))
                    )}
                  </span>
                  <span className="sr-only">
                    {key === UNSCHEDULED ? "Not scheduled yet" : `Day ${i + 1}`}
                    , {count} {count === 1 ? "item" : "items"}
                    {key === today ? ", today" : ""}
                  </span>
                  {key === today && (
                    <span className="day-tile-today" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
          {overflowing && (
            <button
              type="button"
              onClick={() => step(1)}
              disabled={index >= railKeys.length - 1}
              aria-label="Next day"
              className="day-arrow"
            >
              ›
            </button>
          )}
        </div>
      )}

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touch.current = null;
        }}
      >
        {railKeys.map((date, i) => {
          const dayItems = byDay.get(date) ?? [];
          const stays = staysByDay.get(date) ?? [];
          const active = date === selected;
          return (
            <div
              key={date}
              className={`day-panel ${active ? "" : "hidden print:block"} print:mb-5`}
              role="tabpanel"
            >
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h3 className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-soft">
                  {date === UNSCHEDULED ? "Not scheduled yet" : formatDay(date)}
                </h3>
                {date !== UNSCHEDULED && dayKeys.length > 1 && (
                  <span className="text-[0.72rem] text-ink-faint">
                    Day {i + 1} of {dayKeys.length}
                  </span>
                )}
              </div>
              {stays.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {stays.map(({ item, night, nights, leaving }) => (
                    <li
                      key={`${item.id}-stay`}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border border-dashed border-[var(--line)] bg-sand/50 px-3 py-1.5 text-sm text-ink-soft"
                    >
                      <span aria-hidden="true">
                        {CATEGORY_ICONS[item.category]}
                      </span>
                      <span>
                        {leaving ? "Check out of " : "Staying at "}
                        <span className="font-semibold text-ink">
                          {item.title}
                        </span>
                      </span>
                      {!leaving && (
                        <span className="text-xs text-ink-faint">
                          night {night} of {nights}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-2">
                {dayItems.map((item) => {
                  const status = STATUS_STYLES[item.status];
                  const nights = formatNights(item.item_date, item.end_date);

                  if (editingId === item.id) {
                    return (
                      <form
                        key={item.id}
                        onSubmit={saveEdit}
                        className="card space-y-3 border-teal/40 p-4 ring-1 ring-teal/30"
                      >
                        <p className="tabular text-[0.8rem] font-semibold tracking-[0.01em] text-teal">
                          Editing this item
                        </p>
                        <ItemFields
                          draft={editDraft}
                          setDraft={setEditDraft}
                          destination={destination}
                        />
                        <div className="flex flex-wrap gap-2">
                          <button className="btn btn-primary" disabled={busy}>
                            {busy ? "Saving…" : "Save changes"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={cancelEdit}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    );
                  }

                  return (
                    <article key={item.id} className="card p-4">
                      <div className="flex items-start gap-3">
                        <span className="text-xl leading-none">
                          {CATEGORY_ICONS[item.category]}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.start_time && (
                              <span className="tabular text-[0.8rem] font-semibold tracking-[0.01em] text-teal">
                                {formatTime(item.start_time)}
                              </span>
                            )}
                            <h4 className="font-semibold leading-snug">
                              {item.title}
                            </h4>
                            <span className={`chip ${status.cls}`}>
                              {status.label}
                            </span>
                          </div>
                          {nights && (
                            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-ink-soft">
                              <span className="tabular tracking-[0.01em]">
                                {formatStayRange(item.item_date, item.end_date)}
                              </span>
                              <span className="text-xs text-ink-faint">
                                {nights}
                              </span>
                            </p>
                          )}
                          {item.location && (
                            <p className="mt-0.5 text-sm text-ink-soft">
                              {item.location}
                            </p>
                          )}
                          {item.confirmation_number && (
                            <p className="mt-1 font-mono text-xs text-ink-soft">
                              Conf: {item.confirmation_number}
                            </p>
                          )}
                          {item.notes && (
                            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                              {item.notes}
                            </p>
                          )}
                          {/* Somewhere the family has now actually been. The
                              stars appear on the walk home rather than a
                              fortnight later on another tab. */}
                          {!readOnly &&
                            canReviewNow(item, { today, nowHM }) && (
                              <ReviewRow
                                item={item}
                                target={reviewTarget(item, items) || item}
                                busy={reviewBusy}
                                onSave={saveReview}
                              />
                            )}
                          {item.status === "needs_booking" &&
                            (taskByItem.has(item.id) ? (
                              <p className="no-print mt-2 flex flex-wrap items-center gap-1.5 text-[0.78rem] text-ink-soft">
                                <span aria-hidden="true">✓</span>
                                {taskByItem.get(item.id).is_done
                                  ? "Booking task is done"
                                  : "On the task list"}
                                <button
                                  type="button"
                                  onClick={onOpenTasks}
                                  className="font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal"
                                >
                                  Open Tasks
                                </button>
                              </p>
                            ) : readOnly ? null : (
                              <button
                                type="button"
                                onClick={() => makeBookingTask(item)}
                                disabled={taskBusyId === item.id}
                                className="no-print mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber/40 bg-amber/10 px-3 py-1 text-[0.72rem] font-semibold text-amber hover:border-amber hover:bg-amber/15 disabled:opacity-60"
                              >
                                {taskBusyId === item.id
                                  ? "Adding…"
                                  : "Make this a task"}
                              </button>
                            ))}
                          <div className="no-print mt-3 flex flex-wrap items-center gap-1.5">
                            {!readOnly && (
                              <button
                                onClick={() => startEdit(item)}
                                className="rounded-full bg-teal/10 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-teal hover:bg-teal/20"
                              >
                                Edit
                              </button>
                            )}
                            {item.item_date && (
                              <AddToCalendar
                                compact
                                event={eventFromItem(item, { name: tripName })}
                              />
                            )}
                            {!readOnly && (
                              <>
                                <span
                                  className="mx-1 h-4 w-px bg-sand-deep"
                                  aria-hidden
                                />
                                {STATUSES.filter((s) => s !== item.status).map(
                                  (s) => (
                                    <button
                                      key={s}
                                      onClick={() => updateStatus(item, s)}
                                      className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.68rem] font-semibold text-ink-soft hover:border-teal hover:text-teal"
                                    >
                                      {STATUS_STYLES[s].label}
                                    </button>
                                  ),
                                )}
                                <button
                                  onClick={() => remove(item)}
                                  className="ml-auto rounded-full border border-transparent px-2.5 py-1 text-[0.68rem] font-semibold text-rose/80 hover:border-rose/30"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </div>
                          {/* Advice about this one booking, under it rather than
                              anywhere else, because a tip about the ferry is
                              useless three screens away from the ferry. */}
                          <ProTips
                            tips={tipsFor(item.id)}
                            today={today}
                            tripId={tripId}
                            scope="item"
                            itemId={item.id}
                            relatedDate={item.start_date}
                            everLooked
                            compact
                            heading="Worth knowing"
                            readOnly={readOnly}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
                {dayItems.length === 0 && (
                  <div className="card p-6 text-center">
                    <p className="text-sm text-ink-soft">
                      {filter !== "all"
                        ? "Nothing on this day matches the filter."
                        : stays.some((s) => !s.leaving)
                          ? "A free day, with the room already booked."
                          : stays.length > 0
                            ? "Nothing else planned before you head off."
                            : "Nothing planned for this day."}
                    </p>
                    <button
                      type="button"
                      onClick={() => addToDay(date)}
                      className="no-print mt-3 text-sm font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal"
                    >
                      Add something to this day
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {railKeys.length === 0 && (
          <p className="card p-6 text-center text-sm text-ink-soft">
            Nothing on the itinerary yet.
          </p>
        )}
      </div>
    </section>
  );
}
