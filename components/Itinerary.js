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
import DayBrief from "@/components/DayBrief";
import DayDone from "@/components/DayDone";
import { dayIsDone } from "@/lib/day/done";
import { directionsToPlace } from "@/lib/travel/modes";
import DayItemBrief from "@/components/DayItemBrief";
import ItemDrag, { DragGrip } from "@/components/ItemDrag";
import EarlyForecast from "@/components/EarlyForecast";
import { PHASE_CLASS, PHASE_LABEL, planDay } from "@/lib/day/phase";
import { askQuietly, readStored } from "@/components/WhereIAm";
import { nearerTruth } from "@/lib/places/here";

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
      if (!map.has(day)) map.set(day, []);
      const leaving = i === nights;
      // On the last day nobody sleeps there, so there is no night to number.
      map.get(day).push({
        item,
        night: leaving ? null : i + 1,
        nights,
        leaving,
        // The day the family checks in. It used to be skipped here, on the
        // reasoning that the check-in card is already on that day and the strip
        // would be saying it twice. But the strip and the card answer different
        // questions -- the card is a booking with a confirmation number, the
        // strip is where you are sleeping tonight -- and a first day without it
        // was the one day of a stay that never said which night it was. Both
        // now, and the card stays exactly where it was.
        arriving: i === 0,
      });
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
          // Trips start and end at the same address, and the drive to the airport
          // is the most common thing anybody ever adds. Home sits at the top of
          // the empty box so it is a tap rather than a retyped address.
          offerHome
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
/**
 * The one control that folds a finished item down to a line and opens it again.
 *
 * A chip reading "Fold up" sat among the status chips, which put a verb in a row
 * of nouns and made the way back look like another label for what the item is.
 * A chevron on the left edge is the same shape in both states -- pointing at the
 * line when it is shut, pointing down at the card when it is open -- so it reads
 * as one hinge rather than two different buttons.
 *
 * Drawn rather than typed. The glyphs that look like chevrons are Geometric
 * Shapes characters, and their weight and vertical centring vary by platform
 * enough that the same row looks off-centre on one phone and fine on another.
 */
function FoldChevron({ open }) {
  return (
    <span
      aria-hidden="true"
      className="grid size-5 shrink-0 place-items-center text-ink-faint"
    >
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className={`size-3.5 transition-transform duration-150 ${
          open ? "rotate-90" : ""
        }`}
      >
        <path
          d="M6 3.5 10.5 8 6 12.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/**
 * A folded line for something that has already happened.
 *
 * Two jobs in one strip, which is why it is a component and not the plain
 * button it used to be. The line still opens the card when it is pressed. But
 * the stars on the right are now pressable in place: a family walking out of a
 * restaurant can rate it with one tap on the line it is already looking at,
 * rather than opening the card, finding the row, and pressing again.
 *
 * That is also why the strip is a div holding two buttons rather than one
 * button holding stars. A button inside a button is not a thing a browser will
 * render, and the version that tried lost the stars entirely on Safari.
 *
 * Pressing a star opens the note box underneath, because a rating is the moment
 * somebody has an opinion in their head, and it is the only moment they will
 * ever be willing to type. Pressing the star already lit takes the rating back,
 * and does not open anything -- somebody undoing a mistake is not being asked to
 * explain themselves.
 */
/**
 * The pencil on the folded row.
 *
 * A drawn mark rather than the "✎" character: that glyph renders at wildly
 * different weights across platforms -- hairline on Android, nearly invisible at
 * small sizes on Windows -- and it sits on the text baseline, so it never
 * centred properly in its own button.
 */
function PencilMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-[1.05rem]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      <path d="m15 5 3 3" />
    </svg>
  );
}

function ClosedRow({
  item,
  rated,
  rateable,
  readOnly,
  busy,
  onSave,
  onOpen,
  children,
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState(rated?.review || "");
  const stars = rated?.rating || 0;
  const noted = Boolean(String(rated?.review || "").trim());
  const saving = busy === rated?.id;

  // Somebody else's edit, or this person rating the same place from another
  // night, should be in the box the next time it opens.
  useEffect(() => {
    if (!noteOpen) setDraft(rated?.review || "");
  }, [rated?.review, noteOpen]);

  async function pick(n) {
    const clearing = n === stars;
    const err = await onSave(item, { rating: clearing ? null : n });
    if (!err && !clearing) {
      setDraft(rated?.review || "");
      setNoteOpen(true);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const err = await onSave(item, { review: draft.trim() || null });
    if (!err) setNoteOpen(false);
  }

  return (
    <div
      className={`no-print rounded-[0.875rem] border bg-sand/40 ${
        noteOpen ? "border-teal/40" : "border-[var(--line)]"
      }`}
    >
      {/* Wraps on a phone. Five stars and a note toggle beside a title leave the
          title about six characters on a 375px screen, and a folded row whose
          whole job is to say which place this was cannot afford that. Below sm
          the title owns the first line and the stars sit right-aligned beneath
          it; from sm up they share one line as before. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pr-2">
        <button
          type="button"
          onClick={onOpen}
          aria-expanded="false"
          className="flex min-w-0 basis-full items-center gap-2 rounded-[0.875rem] px-3 py-2 text-left text-sm text-ink-soft hover:text-ink sm:basis-auto sm:flex-1"
        >
          {children}
        </button>
        {rateable &&
          (readOnly ? (
            <span
              className="tabular ml-auto shrink-0 pb-2 pl-3 text-[0.78rem] leading-none sm:pb-0 sm:pl-0"
              aria-label={stars ? `Rated ${stars} out of 5` : "Not rated"}
            >
              <span className="text-amber" aria-hidden="true">
                {"★".repeat(stars)}
              </span>
              <span className="text-sand-deep" aria-hidden="true">
                {"★".repeat(5 - stars)}
              </span>
            </span>
          ) : (
            <span className="ml-auto flex shrink-0 items-center gap-1 pb-2 pl-3 sm:pb-0 sm:pl-0">
              {/* Thumb-sized on purpose. Five stars in a row on a phone is the
                  easiest thing in the app to mis-tap, and a wrong rating saves
                  instantly. The padding is the hit area; the glyph stays small. */}
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => pick(n)}
                  disabled={saving}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  aria-pressed={stars === n}
                  className="-my-1 px-px py-1.5 text-[0.95rem] leading-none transition disabled:opacity-50"
                >
                  <span
                    className={n <= stars ? "text-amber" : "text-sand-deep"}
                  >
                    ★
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setDraft(rated?.review || "");
                  setNoteOpen((v) => !v);
                }}
                aria-expanded={noteOpen}
                aria-label={noted ? "Edit the note" : "Add a note"}
                title={noted ? "Edit the note" : "Add a note"}
                // A 24px square holding a text glyph was below the size a thumb
                // can hit and small enough to read as punctuation rather than a
                // control. Now a 36px target with a drawn pencil and a border,
                // so it looks like the button it is. Negative margins keep the
                // folded row the same height it was.
                className={`-my-1.5 ml-1 grid size-9 shrink-0 place-items-center rounded-lg border transition ${
                  noted
                    ? "border-teal/40 bg-teal/10 text-teal"
                    : "border-[var(--line)] bg-white/60 text-ink-soft hover:border-teal/40 hover:text-teal"
                }`}
              >
                <PencilMark />
              </button>
            </span>
          ))}
      </div>

      {noteOpen && (
        <form onSubmit={submit} className="space-y-2 px-3 pb-3 pt-1">
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
              {saving ? "Saving…" : "Save note"}
            </button>
            <button
              type="button"
              className="btn btn-ghost px-3 py-1.5 text-xs"
              onClick={() => setNoteOpen(false)}
            >
              Skip
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

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
            onPick={async (rating) => {
              const clearing = rating === target.rating;
              const err = await onSave(item, {
                rating: clearing ? null : rating,
              });
              // A rating is the one moment somebody has an opinion in their
              // head. Asking them to find a second button before they can write
              // it down is how the note never gets written. Not on the way back
              // to no rating, though: undoing is not a thing to explain.
              if (!err && !clearing) {
                setDraft(target.review || "");
                setOpen(true);
              }
            }}
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
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(EMPTY);
  // Which of the things already behind the family they have asked to see again.
  // Kept by id rather than by day: a family who opens this morning's flight to
  // read its seat number has not asked to un-minimize the whole morning.
  const [reopened, setReopened] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reopen = useCallback((id) => {
    setReopened((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Every item, always. There used to be an All / Confirmed / Still open switch
  // above the days; it was answering a question the itinerary is the wrong place
  // for. A trip you are reading day by day wants the whole day, including the
  // dinner nobody has booked yet -- hiding it is how it gets forgotten. The
  // things that still need booking have their own prompt further down, and the
  // status pill on each card says which is which in place.
  const visible = items;

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

  // The day a lifted card is currently pointed at, or null when nothing is being
  // dragged. It lives up here rather than inside the gesture because the thing
  // it lights is the rail at the top of the screen, which is a sibling of the
  // card being held and often a long way above it.
  const [aimedDay, setAimedDay] = useState(null);

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

  // --- what today is actually like ----------------------------------------
  //
  // The forecast, the journeys between the day's stops, and whatever Aly has
  // already found out about each of them. Fetched rather than rendered on the
  // server because all three depend on outside services that are allowed to be
  // slow or down, and a day view that waits for a geocoder before showing the
  // schedule is a worse day view than one that shows the schedule and fills in
  // the rest.
  //
  // Only ever for the day being looked at, and only when that day belongs to the
  // trip window -- an unscheduled column has no weather and no journeys.
  const [dayData, setDayData] = useState(null);
  // The phone's own position, once, for the day being lived. See askQuietly.
  const [phone, setPhone] = useState(null);
  // The exact question last put to /api/day. Every answer it gives costs geocoding
  // and routing calls, so the same question is never asked twice: a re-render, a
  // clock tick that changes nothing, and React's double mount in development all
  // used to buy the identical day again.
  const lastAsked = useRef("");
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState("");

  const dayIsReal = selected !== UNSCHEDULED && Boolean(selected);
  // Tomorrow gets the same treatment as today, so a six o'clock start is briefed
  // the evening before rather than at six o'clock.
  const withinReach =
    dayIsReal &&
    (selected === today ||
      selected ===
        new Date(parseDate(today).getTime() + DAY_MS)
          .toISOString()
          .slice(0, 10));

  // Which item the family is heading to on the day being looked at. The server
  // cannot work this out -- it depends on the clock on this device -- and it needs
  // to know, because it will ask Google about walking and transit for that one
  // journey and not for the other six.
  const nextIdOnSelected = useMemo(() => {
    if (!withinReach) return "";
    const plan = planDay(byDay.get(selected) ?? [], {
      today,
      nowHM,
      viewing: selected,
    });
    return plan.next?.id || "";
  }, [withinReach, byDay, selected, today, nowHM]);

  const loadDay = useCallback(
    async (date, nextId, { force = false } = {}) => {
      if (!tripId || !date || date === UNSCHEDULED) {
        setDayData(null);
        return;
      }
      const params = new URLSearchParams({ trip: tripId, date });
      if (nextId) params.set("next", nextId);
      // The phone first, then whatever was typed. "How long to the next thing"
      // is a question about where somebody is standing, so a live fix beats a
      // place set in the drawer an hour ago -- unless the fix is too coarse to
      // measure from, which nearerTruth is the judge of.
      const here = nearerTruth(phone, readStored());
      // Only sent for the day being lived. Measuring the first leg of a day three
      // days out from where somebody is standing now is a number about nothing.
      if (here && date === today) {
        params.set("lat", String(here.lat));
        params.set("lon", String(here.lon));
        if (here.accuracy) params.set("acc", String(here.accuracy));
        if (here.source) params.set("src", here.source);
      }
      // The same question as last time cannot have a different answer, so it is
      // not asked. force is for after a research pass, where the question is word
      // for word the same and the answer genuinely has changed.
      const query = params.toString();
      if (!force && query === lastAsked.current) return;
      lastAsked.current = query;
      try {
        const res = await fetch(`/api/day?${query}`);
        if (!res.ok) {
          // Forget it, so a day that failed can be asked for again rather than
          // being permanently the one question we refuse to repeat.
          lastAsked.current = "";
          return;
        }
        const data = await res.json();
        // A slow answer for a day nobody is looking at any more is not an answer.
        setDayData((prev) => (data.date === date ? data : prev));
      } catch {
        lastAsked.current = "";
        /* the day still renders; the extras are extras */
      }
    },
    [tripId, today, phone],
  );

  // Clearing belongs to changing days, not to loading one. It used to run on every
  // pass, so a clock tick that moved the next item -- or the phone answering with
  // a position -- blanked the weather and the journey for as long as the new answer
  // took to arrive, on a screen that had them a moment earlier.
  useEffect(() => {
    setDayData(null);
    setResearchError("");
    lastAsked.current = "";
  }, [selected]);

  useEffect(() => {
    if (!withinReach) return;
    // Nothing is asked until the device clock has been read. Before it is, the
    // next item is whatever the day starts with, which was worth a whole extra
    // day request answering a question about the wrong journey.
    if (nowHM === null) return;
    loadDay(selected, nextIdOnSelected);
  }, [selected, withinReach, loadDay, nextIdOnSelected, nowHM]);

  // Ask the phone where it is, once, and only while looking at the day of a trip
  // that is actually happening. The day is loaded first and reloaded when the fix
  // arrives, so nothing on screen waits for satellites: the times appear measured
  // from whatever was known, and correct themselves a moment later.
  useEffect(() => {
    if (!withinReach || selected !== today || phone) return;
    let live = true;
    askQuietly().then((found) => {
      if (live && found) setPhone(found);
    });
    return () => {
      live = false;
    };
  }, [withinReach, selected, today, phone]);

  // The research pass. Separate call because it is slow and because it costs
  // money, so it runs once per day per change of plan rather than on every load.
  const research = useCallback(async () => {
    if (!tripId || !dayIsReal || researching) return;
    setResearching(true);
    setResearchError("");
    try {
      const res = await fetch("/api/day/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip: tripId, date: selected }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResearchError(data.error || "Aly could not look into today.");
        return;
      }
      await loadDay(selected, nextIdOnSelected, { force: true });
    } catch {
      setResearchError("That did not get through. Try again in a moment.");
    } finally {
      setResearching(false);
    }
  }, [tripId, selected, dayIsReal, researching, loadDay, nextIdOnSelected]);

  // Automatic for today and tomorrow, once each, when there is something new to
  // look into. Deliberately not automatic for any other day: opening day nine to
  // check a booking should not start a grounded search.
  //
  // It runs for a secondary traveler too. The look writes advice about items that
  // already exist rather than changing the plan, and skipping it meant somebody
  // who woke first and opened today got a day with no dress code, no departure
  // time and nothing to explain the absence -- the same screen a primary sees,
  // with the useful half missing.
  const briefed = useRef(new Set());
  useEffect(() => {
    if (!withinReach) return;
    if (!dayData || dayData.date !== selected) return;
    if (!dayData.pending) return;
    const key = `${selected}:${dayData.pending}`;
    if (briefed.current.has(key)) return;
    briefed.current.add(key);
    research();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayData, selected, withinReach]);

  /** The insight, the journey and the sky for one item, from whatever came back. */
  const dayFor = useCallback(
    (itemId) => {
      if (!dayData) return { insight: null, leg: null, hour: null };
      const row = dayData.items?.find((r) => r.id === itemId) || null;
      return {
        insight: row?.insight || null,
        // The forecast for the hour this item happens, at the place it happens.
        // Only ever present for a day the service reaches, which is why per-item
        // weather is a today-and-tomorrow feature and not a whole-trip one.
        hour: row?.hour || null,
        leg: dayData.legs?.find((l) => l.itemId === itemId) || null,
      };
    },
    [dayData],
  );

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

  // And while a card is being dragged sideways, keep the day it is aimed at on
  // screen. On a twelve-day trip on a phone the rail shows four tiles, so by the
  // third day of travel the target had scrolled out of the rail and the only
  // thing left saying where the excursion was going was the badge by the thumb.
  // Nudged to the nearest edge rather than centred, because a tile that jumps to
  // the middle on every day crossed is a rail that will not hold still under a
  // finger already trying to aim.
  useEffect(() => {
    if (!aimedDay) return;
    const rail = railRef.current;
    const tile = rail?.querySelector('[data-aim="true"]');
    if (!rail || !tile) return;
    const railBox = rail.getBoundingClientRect();
    const tileBox = tile.getBoundingClientRect();
    const pad = 8;
    if (tileBox.left < railBox.left + pad) {
      rail.scrollLeft -= railBox.left + pad - tileBox.left;
    } else if (tileBox.right > railBox.right - pad) {
      rail.scrollLeft += tileBox.right - (railBox.right - pad);
    }
  }, [aimedDay]);

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

  // A card slid to a new time, or across to a different day. One column either
  // way, and on the time axis only ever the start: sliding a hotel's checkout up
  // the day would be a different gesture answering a different question, so a
  // row with an end date is left alone -- see the guard where ItemDrag is used.
  //
  // The day the card lands on becomes the day the family is looking at, before
  // the write is even acknowledged. Without that, a thing dragged to Thursday
  // simply vanishes from Wednesday and the family is left looking at the gap it
  // left, with no way to tell a successful move from a deleted excursion.
  async function moveItem(item, next) {
    const patch = next.date
      ? { item_date: next.date }
      : { start_time: next.time };
    if (next.date) setSelected(next.date);
    const { error: err } = await supabase
      .from("itinerary_items")
      .update(patch)
      .eq("id", item.id);
    if (err) {
      setError(err.message);
      return;
    }
    setError("");
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
      {error && (
        <p className="mb-4 rounded-xl bg-rose/10 px-4 py-3 text-sm font-medium text-rose">
          {error}
        </p>
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
                  data-aim={key === aimedDay ? "true" : undefined}
                  onClick={() => setSelected(key)}
                  className={`day-tile ${date ? "" : "day-tile-wide"} ${
                    active ? "day-tile-on" : ""
                  } ${key === aimedDay ? "day-tile-aim" : ""}`}
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
          // Which of this day's items are behind the family and which one is
          // next. Only ever meaningful for the day being lived; for every other
          // day every row comes back "future" and nothing is emphasized, which is
          // right -- there is no "next" on day nine.
          const plan = planDay(dayItems, { today, nowHM, viewing: date });
          const phaseOfItem = new Map(
            plan.items.map((r) => [r.item.id, r.phase]),
          );
          // Everything on this day is behind the family. The screen turns around
          // at that point: the brief at the top and its forecast are answering a
          // question about hours that have gone, so they are not rendered, and
          // the quiet "staying at" strip is replaced by something that says the
          // day is done and asks for the ratings while the evening is still on.
          const finished =
            date !== UNSCHEDULED &&
            dayItems.length > 0 &&
            dayIsDone(plan.items, { isToday: date === today, nowHM });
          const sleepingHere = stays.find((st) => !st.leaving) || null;
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
                {/* Said in words as well as in the ring below, because the ring
                    is invisible to a screen reader and to anybody skimming. */}
                {date === today && plan.past > 0 && plan.ahead > 0 && (
                  <span className="text-[0.72rem] text-ink-faint">
                    {plan.ahead} still to come
                  </span>
                )}
              </div>
              {/* Only on the day being lived and the one after it. A band offering
                  to look into a day four months out would be answering a question
                  nobody asked and spending money to do it. */}
              {active && !finished && withinReach && dayItems.length > 0 && (
                <DayBrief
                  tripId={tripId}
                  date={date}
                  isToday={date === today}
                  today={today}
                  next={plan.next}
                  nowHM={nowHM}
                  weather={dayData?.date === date ? dayData.weather : null}
                  weatherEnd={
                    dayData?.date === date ? dayData.weatherEnd : null
                  }
                  nextLeg={
                    dayData?.date === date && plan.next
                      ? dayData.legs?.find((l) => l.itemId === plan.next.id) ||
                        null
                      : null
                  }
                  pending={dayData?.date === date ? dayData.pending : 0}
                  onResearch={research}
                  researching={researching}
                  researchError={researchError}
                  readOnly={readOnly}
                />
              )}
              {/* And for a day further out than the brief reaches: the high, the
                  low, one sentence, and how far out it is looking. Cheap enough
                  to offer on any day of the week ahead, and honest enough to say
                  nothing at all past that. */}
              {active &&
                !finished &&
                !withinReach &&
                date !== UNSCHEDULED &&
                Boolean(date) && (
                  <EarlyForecast tripId={tripId} date={date} today={today} />
                )}
              {finished ? (
                <DayDone
                  rows={plan.items}
                  stay={sleepingHere}
                  items={items}
                  today={today}
                  isToday={date === today}
                  nowHM={nowHM}
                  readOnly={readOnly}
                  busy={reviewBusy}
                  onSave={saveReview}
                />
              ) : (
                stays.length > 0 && (
                  <ul className="mb-2 space-y-1">
                    {stays.map(({ item, night, nights, leaving }) => {
                      // The one thing on this strip anybody wants to do with it
                      // is get there. It used to be inert text, so the family
                      // read the hotel name off the screen and typed it into
                      // Maps by hand. No origin is sent: the route starts where
                      // the phone is standing, which it knows and this app does
                      // not.
                      const href = directionsToPlace(item);
                      const inside = (
                        <>
                          <span aria-hidden="true">
                            {CATEGORY_ICONS[item.category]}
                          </span>
                          <span>
                            {leaving ? "Check out of " : "Staying at "}
                            <span
                              className={`font-semibold ${
                                href ? "text-teal" : "text-ink"
                              }`}
                            >
                              {item.title}
                            </span>
                          </span>
                          {!leaving && (
                            <span className="text-xs text-ink-faint">
                              night {night} of {nights}
                            </span>
                          )}
                          {href && (
                            <span className="ml-auto shrink-0 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-teal/80">
                              Directions
                            </span>
                          )}
                        </>
                      );
                      const cls =
                        "flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-xl border border-dashed border-[var(--line)] bg-sand/50 px-3 py-1.5 text-sm text-ink-soft";
                      return (
                        <li key={`${item.id}-stay`}>
                          {href ? (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className={`${cls} w-full hover:border-teal/50 hover:bg-sand`}
                            >
                              {inside}
                            </a>
                          ) : (
                            <span className={cls}>{inside}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )
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

                  const phase = phaseOfItem.get(item.id) || "future";
                  const dayBits = active ? dayFor(item.id) : null;
                  // Something on today that has already happened folds down to
                  // one line until it is asked for. It is still there, still in
                  // order, and still printed in full -- it has just stopped
                  // spending a screenful on a thing nobody has to do anything
                  // about. See the note in lib/day/phase.js.
                  const shut = phase === "past" && !reopened.has(item.id);
                  // A place worth an opinion carries its opinion on the folded
                  // line, and can be given one there. Read through reviewTarget
                  // for the same reason the card does: a hotel typed in as four
                  // separate nights holds its rating on one of them, and a line
                  // reading "not rated" above a card showing four stars would be
                  // the app contradicting itself. Flights and transfers are not
                  // places, so they get nothing here rather than an empty row of
                  // stars.
                  const rateable = canReviewNow(item, { today, nowHM });
                  const rated = rateable
                    ? reviewTarget(item, items) || item
                    : null;
                  // Two different questions, deliberately kept apart. The first
                  // is whether this card is the kind of thing a hold-and-slide
                  // could ever move: a stay is not, a cancelled row is not, and
                  // nothing is while the page is somebody else's to read only.
                  // The second is whether it can be moved *right now*, which
                  // also needs a time on the clock to slide away from. A card
                  // that fails the first question says nothing at all; one that
                  // fails only the second wears the hollow grip, because "give
                  // it a time and you can drag it" is worth saying.
                  const draggableKind =
                    !readOnly && !item.end_date && item.status !== "cancelled";
                  const movable =
                    draggableKind && !shut && Boolean(item.start_time);

                  return (
                    <div key={item.id}>
                      {shut && (
                        <ClosedRow
                          item={item}
                          rated={rated}
                          rateable={rateable}
                          readOnly={readOnly}
                          busy={reviewBusy}
                          onSave={saveReview}
                          onOpen={() => reopen(item.id)}
                        >
                          <FoldChevron open={false} />
                          <span aria-hidden="true" className="opacity-60">
                            {CATEGORY_ICONS[item.category]}
                          </span>
                          {item.start_time && (
                            <span className="tabular shrink-0 text-[0.78rem] font-semibold tracking-[0.01em]">
                              {formatTime(item.start_time)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            {item.title}
                          </span>
                          {item.status === "cancelled" && (
                            <span className="shrink-0 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-rose/80">
                              Cancelled
                            </span>
                          )}
                        </ClosedRow>
                      )}
                      <ItemDrag
                        startTime={item.start_time}
                        // Only the trip's real days, never the "No date" tile:
                        // sliding a thing sideways off the calendar altogether
                        // is not a move, it is an unschedule, and it belongs to
                        // the form where it can be said on purpose.
                        dayKeys={dayKeys}
                        dayKey={item.item_date}
                        // Not on a folded row -- there is nothing to grab. Not
                        // while the card is being edited by hand, not for
                        // somebody who cannot write, and not on a stay, whose
                        // "time" is a check-in on a row that spans nights and
                        // whose day cannot move without its checkout moving too.
                        disabled={!movable}
                        onAim={setAimedDay}
                        onCommit={(next) => moveItem(item, next)}
                      >
                        <article
                          className={`card p-4 ${PHASE_CLASS[phase] || ""} ${
                            shut ? "hidden print:block" : ""
                          }`}
                          aria-current={phase === "next" ? "true" : undefined}
                        >
                          <div className="flex items-start gap-3">
                            {phase === "past" && (
                              <button
                                type="button"
                                onClick={() => reopen(item.id)}
                                aria-expanded="true"
                                aria-label="Fold this back to one line"
                                className="no-print -my-1 -ml-1 grid size-7 shrink-0 place-items-center rounded-lg hover:bg-sand/60"
                              >
                                <FoldChevron open />
                              </button>
                            )}
                            {/* Beside the category mark rather than out at the
                                right-hand edge: this is a fact about the whole
                                card, and the right edge already belongs to the
                                time badge that appears when the card lifts. */}
                            {draggableKind && !shut && (
                              <DragGrip ready={movable} />
                            )}
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
                                {PHASE_LABEL[phase] && (
                                  <span
                                    className={`chip ${
                                      phase === "next"
                                        ? "border-teal/40 bg-teal/10 text-teal"
                                        : "border-[var(--line)] text-ink-faint"
                                    }`}
                                  >
                                    {PHASE_LABEL[phase]}
                                  </span>
                                )}
                              </div>
                              {nights && (
                                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-ink-soft">
                                  <span className="tabular tracking-[0.01em]">
                                    {formatStayRange(
                                      item.item_date,
                                      item.end_date,
                                    )}
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
                                    event={eventFromItem(item, {
                                      name: tripName,
                                    })}
                                  />
                                )}
                                {!readOnly && (
                                  <>
                                    <span
                                      className="mx-1 h-4 w-px bg-sand-deep"
                                      aria-hidden
                                    />
                                    {STATUSES.filter(
                                      (s) => s !== item.status,
                                    ).map((s) => (
                                      <button
                                        key={s}
                                        onClick={() => updateStatus(item, s)}
                                        className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[0.68rem] font-semibold text-ink-soft hover:border-teal hover:text-teal"
                                      >
                                        {STATUS_STYLES[s].label}
                                      </button>
                                    ))}
                                    <button
                                      onClick={() => remove(item)}
                                      className="ml-auto rounded-full border border-transparent px-2.5 py-1 text-[0.68rem] font-semibold text-rose/80 hover:border-rose/30"
                                    >
                                      Delete
                                    </button>
                                  </>
                                )}
                              </div>
                              {/* What Aly worked out about this one thing today: when
                              to leave for it, what to wear, what would spoil it.
                              Above the pro tips because it is about the next hour
                              and they are about the trip. */}
                              {dayBits && (
                                <DayItemBrief
                                  item={item}
                                  insight={dayBits.insight}
                                  leg={dayBits.leg}
                                  hour={dayBits.hour}
                                  nowHM={nowHM}
                                  isNext={phase === "next"}
                                  past={phase === "past" || phase === "done"}
                                  dimmed={phase === "past" || phase === "done"}
                                />
                              )}
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
                      </ItemDrag>
                    </div>
                  );
                })}
                {dayItems.length === 0 && (
                  <div className="card p-6 text-center">
                    <p className="text-sm text-ink-soft">
                      {stays.some((s) => !s.leaving)
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

      {/* The three things you do to a whole trip rather than to one day, kept at
          the foot of it. Above the days they were the first thing on the screen
          and the least often wanted -- a header offering to print sits between
          the reader and the only question they came with, which is what is
          happening next. Adding something is a deliberate act at the end of
          reading, so the form opens here, under the button that asked for it. */}
      {adding && !readOnly && (
        <form onSubmit={addItem} className="card mt-5 space-y-3 p-4">
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

      <div className="no-print mt-5 flex flex-wrap items-center gap-2 border-t border-[var(--line)] pt-4">
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
        {/* Kept on the right, where it was when this row lived at the top of the
            screen. Add is the only one of the three that changes the trip, and
            the thumb that reaches for it should not have to learn a new corner
            just because the row moved down. ml-auto rather than
            justify-between, so it still sits right when the two others wrap. */}
        {!readOnly && (
          <button
            className="btn btn-primary ml-auto"
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
    </section>
  );
}
