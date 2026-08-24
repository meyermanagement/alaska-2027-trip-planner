"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORY_ICONS,
  STATUS_STYLES,
  formatDay,
  formatTime,
  parseDate,
} from "@/lib/format";

const UNSCHEDULED = "unscheduled";
const DAY_MS = 86400000;

/** Every calendar day of the trip, so empty days can still be reached. */
function buildDayKeys(start, end, itemDates) {
  const keys = [];
  if (start && end) {
    const [ys, ms, ds] = start.split("-").map(Number);
    const [ye, me, de] = end.split("-").map(Number);
    let cursor = Date.UTC(ys, ms - 1, ds);
    const last = Date.UTC(ye, me - 1, de);
    // A guard so a bad pair of dates can never spin forever.
    for (let n = 0; cursor <= last && n < 400; n += 1) {
      keys.push(new Date(cursor).toISOString().slice(0, 10));
      cursor += DAY_MS;
    }
  }
  // Anything scheduled outside the trip window still deserves a day.
  itemDates.forEach((d) => {
    if (d && !keys.includes(d)) keys.push(d);
  });
  keys.sort();
  return keys;
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
    start_time: item.start_time ? item.start_time.slice(0, 5) : "",
    category: item.category || "activity",
    status: item.status || "planned",
    location: item.location || "",
    notes: item.notes || "",
    confirmation_number: item.confirmation_number || "",
  };
}

function ItemFields({ draft, setDraft }) {
  const set = (patch) => setDraft({ ...draft, ...patch });
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
            Date
          </span>
          <input
            className="field"
            type="date"
            value={draft.item_date}
            onChange={(e) => set({ item_date: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-soft">
            Time
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
            onChange={(e) => set({ category: e.target.value })}
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
        <input
          className="field"
          placeholder="Location"
          value={draft.location}
          onChange={(e) => set({ location: e.target.value })}
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

function payload(draft) {
  return {
    title: draft.title.trim(),
    item_date: draft.item_date || null,
    start_time: draft.start_time || null,
    category: draft.category,
    status: draft.status,
    location: draft.location.trim() || null,
    notes: draft.notes.trim() || null,
    confirmation_number: draft.confirmation_number.trim() || null,
  };
}

export default function Itinerary({
  items,
  tripId,
  onChange,
  tripStart,
  tripEnd,
}) {
  const supabase = useMemo(() => createClient(), []);
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
    () => buildDayKeys(tripStart, tripEnd, items.map((i) => i.item_date)),
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

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  }, []);

  // Open on today when the trip is happening, otherwise on the first day.
  const [selected, setSelected] = useState(() =>
    dayKeys.includes(today) ? today : (dayKeys[0] ?? UNSCHEDULED),
  );

  useEffect(() => {
    if (railKeys.length && !railKeys.includes(selected)) {
      setSelected(railKeys.includes(today) ? today : railKeys[0]);
    }
  }, [railKeys, selected, today]);

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
  useEffect(() => {
    const tile = railRef.current?.querySelector('[data-active="true"]');
    tile?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [selected]);

  const index = railKeys.indexOf(selected);
  const step = useCallback(
    (delta) => {
      const next = index + delta;
      if (next >= 0 && next < railKeys.length) setSelected(railKeys[next]);
    },
    [index, railKeys],
  );

  const touchX = useRef(null);
  function onTouchStart(e) {
    touchX.current = e.touches[0]?.clientX ?? null;
  }
  function onTouchEnd(e) {
    if (touchX.current === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
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
          <button
            className="btn btn-ghost"
            onClick={() => window.print()}
            type="button"
          >
            Print
          </button>
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
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-rose/10 px-4 py-3 text-sm font-medium text-rose">
          {error}
        </p>
      )}

      {adding && (
        <form onSubmit={addItem} className="card mb-5 space-y-3 p-4">
          <ItemFields draft={draft} setDraft={setDraft} />
          <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>
            {busy ? "Saving…" : "Add to itinerary"}
          </button>
        </form>
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
                    {key === UNSCHEDULED
                      ? "Not scheduled yet"
                      : `Day ${i + 1}`}
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

      <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {railKeys.map((date, i) => {
          const dayItems = byDay.get(date) ?? [];
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
            <div className="space-y-2">
              {dayItems.map((item) => {
                const status = STATUS_STYLES[item.status];

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
                      <ItemFields draft={editDraft} setDraft={setEditDraft} />
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
                        <div className="no-print mt-3 flex flex-wrap items-center gap-1.5">
                          <button
                            onClick={() => startEdit(item)}
                            className="rounded-full bg-teal/10 px-3 py-1 text-[0.68rem] font-bold uppercase tracking-wide text-teal hover:bg-teal/20"
                          >
                            Edit
                          </button>
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
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              {dayItems.length === 0 && (
                <div className="card p-6 text-center">
                  <p className="text-sm text-ink-soft">
                    {filter === "all"
                      ? "Nothing planned for this day."
                      : "Nothing on this day matches the filter."}
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
