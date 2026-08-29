"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORY_ICONS, formatStayRange } from "@/lib/format";
import Stars from "@/components/Stars";
import { tripPath } from "@/lib/trips/route";
import {
  GROUPINGS,
  SECTION_CAP,
  SORTS,
  browsePlaces,
  defaultGroupBy,
  tripFilterAsList,
  tripOptions,
  tripYears,
} from "@/lib/reviews/browse";

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
  // Local edits so a rating sticks immediately without a page refresh.
  const [edits, setEdits] = useState({});

  const [query, setQuery] = useState("");
  const [tripFilter, setTripFilter] = useState("all");
  const [unjudgedOnly, setUnjudgedOnly] = useState(false);
  const [sort, setSort] = useState("recent");
  const [by, setBy] = useState(() => defaultGroupBy((trips || []).length));
  // Which headings the reader has opened or closed against the default, and
  // which sections they have asked to see all of.
  const [toggled, setToggled] = useState({});
  const [expanded, setExpanded] = useState({});

  // The kinds are what the server grouped by; we regroup ourselves, so the flat
  // list is the thing to work from.
  const items = useMemo(
    () =>
      (groups || []).flatMap((g) =>
        g.items.map((i) => ({ ...i, ...(edits[i.id] || {}) })),
      ),
    [groups, edits],
  );
  const kinds = useMemo(
    () =>
      (groups || []).map(({ key, label, blurb, categories }) => ({
        key,
        label,
        blurb,
        categories,
      })),
    [groups],
  );

  const view = useMemo(
    () =>
      browsePlaces({
        items,
        trips: trips || [],
        kinds,
        query,
        tripId: tripFilter,
        unjudgedOnly,
        sort,
        by,
      }),
    [items, trips, kinds, query, tripFilter, unjudgedOnly, sort, by],
  );

  // Changing what is on screen changes which headings ought to be open, so the
  // reader's earlier opening and closing of other sections stops applying. Left
  // in place it would hide the very rows a search just found.
  useEffect(() => {
    setToggled({});
    setExpanded({});
  }, [by, query, tripFilter, unjudgedOnly]);

  const isOpen = (key) =>
    key in toggled ? toggled[key] : view.open.includes(key);

  const options = useMemo(
    () => tripOptions({ items, trips: trips || [] }),
    [items, trips],
  );
  const asList = tripFilterAsList((trips || []).length);

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

  const filtered =
    Boolean(query.trim()) || unjudgedOnly || tripFilter !== "all";

  return (
    <div>
      <div className="no-print mb-4 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-w-[12rem] flex-1">
            <span className="sr-only">Search these places</span>
            <input
              type="search"
              className="field"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a name, a town, or something we wrote"
            />
          </label>
          {asList && (
            <label className="min-w-[10rem] flex-1 sm:max-w-[16rem]">
              <span className="sr-only">Which trip</span>
              <select
                className="field"
                value={tripFilter}
                onChange={(e) => setTripFilter(e.target.value)}
              >
                <option value="all">All {options.length} trips</option>
                {tripYears(options).map((year) => (
                  <optgroup
                    key={year.year || "_none"}
                    label={year.year || "No dates"}
                  >
                    {year.trips.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · {t.count}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip
            active={unjudgedOnly}
            onClick={() => setUnjudgedOnly((on) => !on)}
          >
            {unjudgedOnly ? "✓ " : ""}Nothing said yet · {view.tally.unjudged}
          </FilterChip>
          <span
            className="mx-1 hidden h-5 w-px bg-sand-deep sm:block"
            aria-hidden="true"
          />
          <span className="text-xs font-semibold text-ink-soft">Group</span>
          {GROUPINGS.map((g) => (
            <FilterChip
              key={g.value}
              active={by === g.value}
              onClick={() => setBy(g.value)}
            >
              {g.label}
            </FilterChip>
          ))}
          <label className="ml-auto flex items-center gap-1.5">
            <span className="text-xs font-semibold text-ink-soft">Sort</span>
            <select
              className="rounded-full border border-[var(--line)] bg-white px-2.5 py-1 text-xs font-semibold text-ink-soft"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!asList && (trips || []).length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            <FilterChip
              active={tripFilter === "all"}
              onClick={() => setTripFilter("all")}
            >
              All trips
            </FilterChip>
            {options.map((t) => (
              <FilterChip
                key={t.id}
                active={tripFilter === t.id}
                onClick={() => setTripFilter(t.id)}
              >
                {t.name}
              </FilterChip>
            ))}
          </div>
        )}

        <p className="text-xs text-ink-soft">
          {filtered
            ? `${view.shown} of ${view.total} places`
            : `${view.total} ${view.total === 1 ? "place" : "places"} from ${
                options.length
              } ${options.length === 1 ? "trip" : "trips"}`}
          {view.shown > 0 && (
            <>
              {" · "}
              {view.tally.judged} rated or written up
              {view.tally.unjudged > 0 && `, ${view.tally.unjudged} not yet`}
            </>
          )}
        </p>
      </div>

      {view.sections.length === 0 && (
        <p className="card p-5 text-sm text-ink-soft">
          {query.trim()
            ? `Nothing matches “${query.trim()}”. Try a shorter search, or clear the filters.`
            : unjudgedOnly
              ? "Everything showing has a rating or a note on it already."
              : "Nothing saved for that trip in these categories."}
        </p>
      )}

      <div className="space-y-6">
        {view.sections.map((section) => {
          const open = isOpen(section.key);
          const showAll = Boolean(expanded[section.key]);
          const capped =
            !showAll && section.items.length > SECTION_CAP
              ? section.items.slice(0, SECTION_CAP)
              : section.items;
          const judged = section.items.filter(
            (i) => i.rating || String(i.review || "").trim(),
          ).length;
          return (
            <section key={section.key}>
              <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                  setToggled((prev) => ({ ...prev, [section.key]: !open }))
                }
                className="flex w-full items-center gap-3 text-left"
              >
                <span
                  className={`text-ink-faint transition ${open ? "rotate-90" : ""}`}
                  aria-hidden="true"
                >
                  ▶
                </span>
                <h2 className="font-display text-xl font-semibold">
                  {section.label}
                </h2>
                <span className="h-px flex-1 bg-sand-deep" aria-hidden="true" />
                <span className="whitespace-nowrap text-xs font-semibold text-ink-soft">
                  {section.items.length}
                  {judged < section.items.length && (
                    <span className="font-normal">
                      {" "}
                      · {section.items.length - judged} to rate
                    </span>
                  )}
                </span>
              </button>
              {open && (
                <>
                  {section.blurb ? (
                    <p className="mt-1 pl-7 text-sm text-ink-soft">
                      {section.blurb}
                    </p>
                  ) : section.trip ? (
                    <p className="mt-1 pl-7 text-sm text-ink-soft">
                      {section.trip.destination && (
                        <span>{section.trip.destination} · </span>
                      )}
                      <Link
                        href={tripPath(section.trip)}
                        className="font-semibold text-teal underline decoration-teal/30 underline-offset-2"
                      >
                        Open the trip
                      </Link>
                    </p>
                  ) : null}
                  <div className="mt-3 grid items-start gap-3 sm:grid-cols-2">
                    {capped.map((item) => (
                      <Place
                        key={item.id}
                        item={item}
                        showTrip={by !== "trip" && tripFilter === "all"}
                        onSave={save}
                        onSaveDetails={saveDetails}
                      />
                    ))}
                  </div>
                  {capped.length < section.items.length && (
                    <button
                      type="button"
                      className="btn btn-ghost mt-3 px-3 py-1.5 text-xs"
                      onClick={() =>
                        setExpanded((prev) => ({
                          ...prev,
                          [section.key]: true,
                        }))
                      }
                    >
                      Show all {section.items.length}
                    </button>
                  )}
                </>
              )}
            </section>
          );
        })}
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
            {item.item_date && (
              <span>{formatStayRange(item.item_date, item.end_date)}</span>
            )}
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

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[var(--line)] pt-2.5">
        <Stars
          value={item.rating || 0}
          onPick={(rating) =>
            onSave(item.id, { rating: rating === item.rating ? null : rating })
          }
        />
        {!editing && (
          <div className="no-print flex items-center gap-3 whitespace-nowrap">
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
