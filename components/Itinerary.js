"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CATEGORY_ICONS,
  STATUS_STYLES,
  formatDay,
  formatTime,
} from "@/lib/format";

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
const STATUSES = ["confirmed", "planned", "optional", "needs_booking", "cancelled"];

export default function Itinerary({ items, tripId, onChange }) {
  const supabase = useMemo(() => createClient(), []);
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    title: "",
    item_date: "",
    start_time: "",
    category: "activity",
    status: "planned",
    location: "",
    notes: "",
    confirmation_number: "",
  });

  const visible = items.filter((i) =>
    filter === "all"
      ? true
      : filter === "open"
        ? i.status === "needs_booking" || i.status === "optional"
        : i.status === "confirmed"
  );

  const days = useMemo(() => {
    const map = new Map();
    visible.forEach((item) => {
      const key = item.item_date || "unscheduled";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return Array.from(map.entries());
  }, [visible]);

  async function updateStatus(item, status) {
    await supabase.from("itinerary_items").update({ status }).eq("id", item.id);
    onChange();
  }

  async function remove(item) {
    await supabase.from("itinerary_items").delete().eq("id", item.id);
    onChange();
  }

  async function addItem(e) {
    e.preventDefault();
    await supabase.from("itinerary_items").insert({
      trip_id: tripId,
      title: draft.title.trim(),
      item_date: draft.item_date || null,
      start_time: draft.start_time || null,
      category: draft.category,
      status: draft.status,
      location: draft.location.trim() || null,
      notes: draft.notes.trim() || null,
      confirmation_number: draft.confirmation_number.trim() || null,
      sort_order: 99,
    });
    setDraft({
      title: "",
      item_date: "",
      start_time: "",
      category: "activity",
      status: "planned",
      location: "",
      notes: "",
      confirmation_number: "",
    });
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
          <button className="btn btn-primary" onClick={() => setAdding(!adding)}>
            {adding ? "Close" : "+ Add"}
          </button>
        </div>
      </div>

      {adding && (
        <form onSubmit={addItem} className="card mb-5 space-y-3 p-4">
          <input
            className="field"
            placeholder="What is happening?"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              className="field"
              type="date"
              value={draft.item_date}
              onChange={(e) => setDraft({ ...draft, item_date: e.target.value })}
            />
            <input
              className="field"
              type="time"
              value={draft.start_time}
              onChange={(e) =>
                setDraft({ ...draft, start_time: e.target.value })
              }
            />
            <select
              className="field"
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_ICONS[c]} {c}
                </option>
              ))}
            </select>
            <select
              className="field"
              value={draft.status}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_STYLES[s].label}
                </option>
              ))}
            </select>
            <input
              className="field"
              placeholder="Location"
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
            />
            <input
              className="field"
              placeholder="Confirmation number"
              value={draft.confirmation_number}
              onChange={(e) =>
                setDraft({ ...draft, confirmation_number: e.target.value })
              }
            />
          </div>
          <textarea
            className="field"
            rows={2}
            placeholder="Notes"
            value={draft.notes}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
          />
          <button className="btn btn-primary w-full sm:w-auto">
            Add to itinerary
          </button>
        </form>
      )}

      <div className="space-y-5">
        {days.map(([date, dayItems]) => (
          <div key={date}>
            <h3 className="font-display mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
              {date === "unscheduled" ? "Unscheduled" : formatDay(date)}
            </h3>
            <div className="space-y-2">
              {dayItems.map((item) => {
                const status = STATUS_STYLES[item.status];
                return (
                  <article key={item.id} className="card p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-xl leading-none">
                        {CATEGORY_ICONS[item.category]}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {item.start_time && (
                            <span className="font-display text-sm font-semibold text-teal">
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
                          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                            {item.notes}
                          </p>
                        )}
                        <div className="no-print mt-3 flex flex-wrap gap-1.5">
                          {STATUSES.filter((s) => s !== item.status).map((s) => (
                            <button
                              key={s}
                              onClick={() => updateStatus(item, s)}
                              className="rounded-full border border-sand-deep px-2.5 py-1 text-[0.68rem] font-semibold text-ink-soft hover:border-teal hover:text-teal"
                            >
                              {STATUS_STYLES[s].label}
                            </button>
                          ))}
                          <button
                            onClick={() => remove(item)}
                            className="rounded-full border border-transparent px-2.5 py-1 text-[0.68rem] font-semibold text-rose/80 hover:border-rose/30"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
        {days.length === 0 && (
          <p className="card p-6 text-center text-sm text-ink-soft">
            Nothing matches this filter yet.
          </p>
        )}
      </div>
    </section>
  );
}
