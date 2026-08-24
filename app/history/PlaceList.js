"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_ICONS, formatShortDay } from "@/lib/format";

export default function PlaceList({ groups, trips }) {
  const supabase = useMemo(() => createClient(), []);
  const [tripFilter, setTripFilter] = useState("all");
  // Local edits so a rating sticks immediately without a page refresh.
  const [edits, setEdits] = useState({});

  async function save(id, patch) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    await supabase.from("itinerary_items").update(patch).eq("id", id);
  }

  const shown = groups
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => tripFilter === "all" || i.trip_id === tripFilter,
      ),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div>
      {trips.length > 1 && (
        <div className="no-print mb-6 flex flex-wrap gap-1.5">
          <FilterChip
            active={tripFilter === "all"}
            onClick={() => setTripFilter("all")}
          >
            All trips
          </FilterChip>
          {trips.map((t) => (
            <FilterChip
              key={t.id}
              active={tripFilter === t.id}
              onClick={() => setTripFilter(t.id)}
            >
              {t.cover_emoji} {t.name}
            </FilterChip>
          ))}
        </div>
      )}

      {shown.length === 0 && (
        <p className="card p-5 text-sm text-ink-soft">
          Nothing saved for that trip in these categories.
        </p>
      )}

      <div className="space-y-9">
        {shown.map((group) => (
          <section key={group.key}>
            <div className="flex items-center gap-3">
              <h2 className="font-display text-xl font-semibold">
                {group.label}
              </h2>
              <span className="h-px flex-1 bg-sand-deep" aria-hidden="true" />
              <span className="text-xs font-semibold text-ink-soft">
                {group.items.length}
              </span>
            </div>
            <p className="mt-1 text-sm text-ink-soft">{group.blurb}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <Place
                  key={item.id}
                  item={{ ...item, ...(edits[item.id] || {}) }}
                  showTrip={tripFilter === "all"}
                  onSave={save}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "border-teal bg-teal text-white"
          : "border-sand-deep bg-white text-ink-soft hover:border-teal/40 hover:text-teal"
      }`}
    >
      {children}
    </button>
  );
}

function Place({ item, showTrip, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.review || "");
  const [busy, setBusy] = useState(false);

  async function saveReview(e) {
    e.preventDefault();
    setBusy(true);
    await onSave(item.id, { review: draft.trim() || null });
    setBusy(false);
    setEditing(false);
  }

  return (
    <article className="card flex flex-col p-4">
      <div className="flex items-start gap-2.5">
        <span className="text-xl leading-none" aria-hidden="true">
          {CATEGORY_ICONS[item.category] || "📍"}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold leading-snug">
            {item.title}
          </h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            {item.location && <span>{item.location}</span>}
            {item.location && item.item_date && (
              <span aria-hidden="true"> · </span>
            )}
            {item.item_date && <span>{formatShortDay(item.item_date)}</span>}
          </p>
          {showTrip && item.trip && (
            <p className="mt-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.04em] text-ink-soft">
              {item.trip.cover_emoji} {item.trip.name}
            </p>
          )}
        </div>
      </div>

      {item.notes && (
        <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">
          {item.notes}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-sand-deep pt-2.5">
        <Stars
          value={item.rating || 0}
          onPick={(rating) =>
            onSave(item.id, { rating: rating === item.rating ? null : rating })
          }
        />
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(item.review || "");
              setEditing(true);
            }}
            className="no-print text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-4"
          >
            {item.review ? "Edit note" : "Add a note"}
          </button>
        )}
      </div>

      {editing ? (
        <form onSubmit={saveReview} className="no-print mt-2.5 space-y-2">
          <textarea
            className="field text-sm"
            rows={2}
            autoFocus
            value={draft}
            placeholder="Would we go back? What should we remember?"
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="btn btn-primary px-3 py-1.5 text-xs"
              disabled={busy}
            >
              Save
            </button>
            <button
              type="button"
              className="btn btn-ghost px-3 py-1.5 text-xs"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        item.review && (
          <p className="mt-2.5 rounded-xl bg-sand px-3 py-2 text-sm leading-relaxed">
            {item.review}
          </p>
        )
      )}
    </article>
  );
}

function Stars({ value, onPick }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onPick(n)}
          aria-label={`${n} star${n === 1 ? "" : "s"}`}
          aria-pressed={value === n}
          className="text-base leading-none transition hover:scale-110"
        >
          <span className={n <= value ? "text-amber" : "text-sand-deep"}>★</span>
        </button>
      ))}
      {value > 0 && (
        <span className="ml-1.5 text-xs font-semibold text-ink-soft">
          {value}/5
        </span>
      )}
    </div>
  );
}
