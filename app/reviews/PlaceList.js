"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_ICONS, formatShortDay } from "@/lib/format";

// Only the kinds this page keeps a record of. Re-filing a place as a flight
// would make it vanish from the only screen you can edit it on.
const PLACE_KINDS = [
  { value: "lodging", label: "Somewhere we stayed" },
  { value: "dining", label: "Somewhere we ate" },
  { value: "excursion", label: "An excursion" },
  { value: "activity", label: "Something we did" },
];

export default function PlaceList({ groups, trips }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [tripFilter, setTripFilter] = useState("all");
  // Local edits so a rating sticks immediately without a page refresh.
  const [edits, setEdits] = useState({});

  async function save(id, patch) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    const { error } = await supabase
      .from("itinerary_items")
      .update(patch)
      .eq("id", id);
    return error;
  }

  // What the place is, rather than what we thought of it. The name, where it
  // was and what kind of thing it is belong to every night or every booking of
  // it, so they are written to all of them. The note is about this one entry.
  async function saveDetails(item, { shared, own }) {
    setEdits((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], ...shared, ...own },
    }));
    const ids = item.rowIds?.length ? item.rowIds : [item.id];
    const { error: sharedError } = await supabase
      .from("itinerary_items")
      .update(shared)
      .in("id", ids);
    if (sharedError) return sharedError;
    const { error: ownError } = await supabase
      .from("itinerary_items")
      .update(own)
      .eq("id", item.id);
    if (ownError) return ownError;
    // A new name or a new kind changes how the page groups and de-duplicates
    // it, which only the server can work out.
    router.refresh();
    return null;
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
                  onSaveDetails={saveDetails}
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
          : "border-[var(--line)] bg-white text-ink-soft hover:border-teal/40 hover:text-teal"
      }`}
    >
      {children}
    </button>
  );
}

function Place({ item, showTrip, onSave, onSaveDetails }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.review || "");
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  async function saveReview(e) {
    e.preventDefault();
    setBusy(true);
    await onSave(item.id, { review: draft.trim() || null });
    setBusy(false);
    setEditing(false);
  }

  if (detailsOpen) {
    return (
      <Details
        item={item}
        onCancel={() => setDetailsOpen(false)}
        onSave={onSaveDetails}
      />
    );
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

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-2.5">
        <Stars
          value={item.rating || 0}
          onPick={(rating) =>
            onSave(item.id, { rating: rating === item.rating ? null : rating })
          }
        />
        {!editing && (
          <div className="no-print flex items-center gap-3">
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="text-xs font-semibold text-ink-soft underline decoration-[var(--line)] underline-offset-4 transition hover:text-teal"
            >
              Edit details
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(item.review || "");
                setEditing(true);
              }}
              className="text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-4"
            >
              {item.review ? "Edit note" : "Add a note"}
            </button>
          </div>
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

// Editing the place rather than the opinion of it: what it was called, where
// it was, what kind of thing it is, and anything worth keeping about it.
function Details({ item, onCancel, onSave }) {
  const [title, setTitle] = useState(item.title || "");
  const [location, setLocation] = useState(item.location || "");
  const [category, setCategory] = useState(item.category || "activity");
  const [notes, setNotes] = useState(item.notes || "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");

  const nights = item.rowIds?.length || 1;
  const clean = title.trim();

  async function submit(e) {
    e.preventDefault();
    if (!clean || busy) return;
    setBusy(true);
    setFailed("");
    const error = await onSave(item, {
      shared: {
        title: clean,
        location: location.trim() || null,
        category,
      },
      own: { notes: notes.trim() || null },
    });
    setBusy(false);
    if (error) {
      setFailed("That did not save. Try again.");
      return;
    }
    onCancel();
  }

  return (
    <article className="card flex flex-col p-4">
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-soft">
            Name
          </span>
          <input
            className="field"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is it called?"
            required
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-soft">
            Where
          </span>
          <input
            className="field"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Town, address or the part of the ship"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-soft">
            Kind
          </span>
          <select
            className="field"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {PLACE_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {CATEGORY_ICONS[k.value]} {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink-soft">
            Anything worth remembering
          </span>
          <textarea
            className="field"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Room 412 was quiet. Ask for the corner table."
          />
        </label>
        {nights > 1 && (
          <p className="text-xs text-ink-soft">
            The name, place and kind apply to all {nights} entries for this on
            the trip. The note stays on this one.
          </p>
        )}
        {failed && <p className="text-xs font-semibold text-rose">{failed}</p>}
        <div className="flex gap-2">
          <button
            className="btn btn-primary px-3 py-1.5 text-xs"
            disabled={busy || !clean}
          >
            {busy ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="btn btn-ghost px-3 py-1.5 text-xs"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
        </div>
      </form>
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
          <span className={n <= value ? "text-amber" : "text-sand-deep"}>
            ★
          </span>
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
