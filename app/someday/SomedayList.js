"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/LinkPending";
import LocationField from "@/components/LocationField";
import { MONTHS, monthsSaid } from "@/lib/someday/months";

/**
 * The whole answer as one line, for the row that is not being edited.
 *
 * The nights and the airfare ceiling are deliberately absent. Both are still
 * stored, and Aly still writes them when somebody says a length or a price out
 * loud, but nothing checks fares on a schedule yet, so showing them here asked
 * the family to maintain numbers that changed nothing.
 */
function placeSaid(row, travelers) {
  const bits = [monthsSaid(row.months)];
  const ids = row.traveler_ids || [];
  if (ids.length) {
    const names = travelers
      .filter((person) => ids.includes(person.id))
      .map((person) => person.name);
    if (names.length) bits.push(names.join(", "));
  }
  return bits.join(" \u00b7 ");
}

const BLANK = {
  place: "",
  lat: null,
  lon: null,
  why: "",
  months: [],
  traveler_ids: [],
};

function formFrom(row) {
  if (!row) return { ...BLANK };
  return {
    place: row.place || "",
    lat: row.lat ?? null,
    lon: row.lon ?? null,
    why: row.why || "",
    months: [...(row.months || [])],
    traveler_ids: [...(row.traveler_ids || [])],
  };
}

/**
 * The bucket list, and the form that both adds to it and edits it.
 *
 * One form for both jobs on purpose: adding a place and correcting one are the
 * same four questions, and two copies of four fields is where the two copies
 * start disagreeing about what a blank answer means.
 */
export default function SomedayList({
  familyId,
  places = [],
  travelers = [],
  trips = [],
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  // "new" while adding, a row id while editing one, empty while neither.
  const [editing, setEditing] = useState("");
  const [form, setForm] = useState({ ...BLANK });
  // "form" while the form is writing, else the id of the row being changed.
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  // A write is not finished when the database answers; it is finished when the
  // page has been re-read and the row on screen is the row that was saved. The
  // refresh runs inside a transition so that wait is something we can show.
  const [refreshing, startRefresh] = useTransition();
  const awaiting = useRef(false);
  const afterward = useRef(null);

  function settle(after) {
    awaiting.current = true;
    afterward.current = after || null;
    startRefresh(() => router.refresh());
  }

  useEffect(() => {
    if (refreshing || !awaiting.current) return;
    awaiting.current = false;
    setBusy("");
    const after = afterward.current;
    afterward.current = null;
    if (after) after();
  }, [refreshing]);

  const open = places.filter((row) => row.status === "open");
  const settled = places.filter((row) => row.status !== "open");

  function start(row) {
    setError("");
    setForm(formFrom(row));
    setEditing(row ? row.id : "new");
  }

  function stop() {
    setEditing("");
    setForm({ ...BLANK });
    setError("");
  }

  function set(key, value) {
    setForm((was) => ({ ...was, [key]: value }));
  }

  function toggleMonth(month) {
    setForm((was) => ({
      ...was,
      months: was.months.includes(month)
        ? was.months.filter((m) => m !== month)
        : [...was.months, month].sort((a, b) => a - b),
    }));
  }

  function toggleTraveler(id) {
    setForm((was) => ({
      ...was,
      traveler_ids: was.traveler_ids.includes(id)
        ? was.traveler_ids.filter((one) => one !== id)
        : [...was.traveler_ids, id],
    }));
  }

  /**
   * Where the place is, when a point can be had for it.
   *
   * A wish list works perfectly well as words -- "somewhere with a reef" is a
   * legitimate row -- so the coordinate is a convenience and never a
   * requirement. When the family picked a suggestion we already have the point;
   * when they typed the name and moved on, one lookup is worth it, because it is
   * what lets a fare to an airport near the place be recognized as a fare to the
   * place.
   */
  async function pointFor(said) {
    if (Number.isFinite(form.lat) && Number.isFinite(form.lon)) {
      return { lat: form.lat, lon: form.lon };
    }
    try {
      const res = await fetch(`/api/here?q=${encodeURIComponent(said)}`);
      if (!res.ok) return { lat: null, lon: null };
      const json = await res.json();
      const here = json?.here;
      return Number.isFinite(here?.lat) && Number.isFinite(here?.lon)
        ? { lat: here.lat, lon: here.lon }
        : { lat: null, lon: null };
    } catch {
      return { lat: null, lon: null };
    }
  }

  async function save() {
    if (busy) return;
    const said = form.place.trim().replace(/\s+/g, " ");
    if (!said) {
      setError("Say where, and the rest is optional.");
      return;
    }
    setBusy("form");
    setError("");

    const point = await pointFor(said);

    // Only the four fields the form asks about. The nights, the airfare ceiling
    // and the watch flag are left out of the patch on purpose: they are still
    // columns, and Aly still fills them, so an edit here must not quietly
    // overwrite what she wrote with the blank this form no longer collects.
    const row = {
      place: said,
      lat: point.lat,
      lon: point.lon,
      why: form.why.trim() || null,
      months: form.months,
      traveler_ids: form.traveler_ids,
    };

    const { error: dbError } =
      editing === "new"
        ? await supabase
            .from("someday_places")
            .insert({ ...row, family_id: familyId, watch: true })
        : await supabase.from("someday_places").update(row).eq("id", editing);

    if (dbError) {
      setBusy("");
      setError(dbError.message);
      return;
    }
    // The form stays open, spinning, until the list behind it has caught up.
    settle(stop);
  }

  async function change(row, patch) {
    if (busy) return;
    setBusy(row.id);
    setError("");
    const { error: dbError } = await supabase
      .from("someday_places")
      .update(patch)
      .eq("id", row.id);
    if (dbError) {
      setBusy("");
      setError(dbError.message);
      return;
    }
    settle();
  }

  async function drop(row) {
    if (busy) return;
    setBusy(row.id);
    setError("");
    const { error: dbError } = await supabase
      .from("someday_places")
      .delete()
      .eq("id", row.id);
    if (dbError) {
      setBusy("");
      setError(dbError.message);
      return;
    }
    settle();
  }

  const theForm = (
    <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3">
      <div className="w-full sm:w-[30rem]">
        <label className="section-label block" htmlFor="someday-place">
          Where
        </label>
        <LocationField
          value={form.place}
          onChange={(next) => {
            setForm((was) => ({
              ...was,
              place: next,
              // Typed over: the point we had belonged to a different answer.
              lat: was.place === next ? was.lat : null,
              lon: was.place === next ? was.lon : null,
            }));
          }}
          onPick={(place) =>
            setForm((was) => ({
              ...was,
              place: place.value,
              lat: place.lat ?? null,
              lon: place.lon ?? null,
            }))
          }
          placeholder="Kyoto, Japan"
          className="field w-full"
          inputProps={{ id: "someday-place", maxLength: 120 }}
        />
      </div>

      <div className="mt-3 w-full sm:w-[30rem]">
        <label className="section-label block" htmlFor="someday-why">
          Why this one
        </label>
        <input
          id="someday-why"
          className="field w-full"
          value={form.why}
          maxLength={200}
          placeholder="The kids have been asking since the Olympics"
          onChange={(event) => set("why", event.target.value)}
        />
      </div>

      <div className="mt-3">
        <p className="section-label">Months you could actually go</p>
        <p className="mt-1 text-sm text-ink-soft">
          Nothing ticked means any month.
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MONTHS.map((name, index) => {
            const month = index + 1;
            const on = form.months.includes(month);
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                className={
                  on
                    ? "rounded-full border border-teal bg-teal px-2.5 py-1 text-sm font-medium text-white"
                    : "rounded-full border border-[var(--line)] px-2.5 py-1 text-sm text-ink-soft hover:border-[var(--line-hover)]"
                }
                onClick={() => toggleMonth(month)}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>

      {travelers.length ? (
        <div className="mt-3">
          <p className="section-label">Who it is for</p>
          <p className="mt-1 text-sm text-ink-soft">
            Nobody ticked means the whole household.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {travelers.map((person) => {
              const on = form.traveler_ids.includes(person.id);
              return (
                <button
                  key={person.id}
                  type="button"
                  aria-pressed={on}
                  className={
                    on
                      ? "rounded-full border border-teal bg-teal px-2.5 py-1 text-sm font-medium text-white"
                      : "rounded-full border border-[var(--line)] px-2.5 py-1 text-sm text-ink-soft hover:border-[var(--line-hover)]"
                  }
                  onClick={() => toggleTraveler(person.id)}
                >
                  {person.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {error ? <p className="mt-2 text-sm text-rose">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary inline-flex items-center gap-2"
          // Pressed, not dimmed: disabled fades the ring turning inside the
          // button, which is the part that has to stay legible. A second press
          // is refused in save instead.
          aria-disabled={busy === "form"}
          onClick={save}
        >
          {busy === "form" ? (
            <>
              <Spinner className="h-4 w-4" />
              Saving&hellip;
            </>
          ) : editing === "new" ? (
            "Add it"
          ) : (
            "Save"
          )}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={Boolean(busy)}
          onClick={stop}
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div>
      {open.length ? (
        <ul className="space-y-3">
          {open.map((row) => (
            <li key={row.id} className="card p-3">
              {editing === row.id ? (
                theForm
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h2 className="font-display text-lg font-semibold">
                      {row.place}
                    </h2>
                  </div>
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {placeSaid(row, travelers)}
                  </p>
                  {row.why ? (
                    <p className="mt-1 text-sm text-ink">{row.why}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <button
                      type="button"
                      className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                      onClick={() => start(row)}
                    >
                      Edit
                    </button>
                    {trips.length ? (
                      <label className="flex items-center gap-1.5 text-ink-soft">
                        <span className="sr-only">
                          The trip {row.place} became
                        </span>
                        <select
                          className="field"
                          value=""
                          disabled={Boolean(busy)}
                          onChange={(event) => {
                            const tripId = event.target.value;
                            if (!tripId) return;
                            change(row, {
                              status: "booked",
                              trip_id: tripId,
                              watch: false,
                            });
                          }}
                        >
                          <option value="">We booked it&hellip;</option>
                          {trips.map((trip) => (
                            <option key={trip.id} value={trip.id}>
                              {trip.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <button
                      type="button"
                      className="text-ink-soft underline decoration-[var(--line)] underline-offset-2 hover:text-ink"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        change(row, { status: "retired", watch: false })
                      }
                    >
                      Not any more
                    </button>
                    {busy === row.id ? (
                      <span className="inline-flex items-center gap-1.5 text-ink-soft">
                        <Spinner className="h-4 w-4 text-teal" />
                        Saving&hellip;
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : editing !== "new" ? (
        <div className="card p-4">
          <h2 className="font-display text-lg font-semibold">
            Nothing on the list yet
          </h2>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            A place and the months you could go is enough for Aly to know a fare
            worth mentioning from one that is merely cheap. Without a list she
            is guessing at what you want.
          </p>
        </div>
      ) : null}

      {editing === "new" ? (
        theForm
      ) : (
        <button
          type="button"
          className="btn btn-primary mt-3"
          onClick={() => start(null)}
        >
          Add a place
        </button>
      )}

      {settled.length ? (
        <div className="mt-8">
          <h2 className="section-label">Booked, or off the list</h2>
          <ul className="mt-2 space-y-2">
            {settled.map((row) => {
              const trip = trips.find((one) => one.id === row.trip_id) || null;
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[var(--line)] pt-2 text-sm first:border-0 first:pt-0"
                >
                  <span className="font-medium text-ink">{row.place}</span>
                  <span className="text-ink-soft">
                    {row.status === "booked"
                      ? trip
                        ? `Became ${trip.name}`
                        : "Booked"
                      : "Off the list"}
                  </span>
                  <button
                    type="button"
                    className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      change(row, {
                        status: "open",
                        trip_id: null,
                        watch: true,
                      })
                    }
                  >
                    Put it back
                  </button>
                  <button
                    type="button"
                    className="text-ink-faint underline decoration-[var(--line)] underline-offset-2 hover:text-rose"
                    disabled={Boolean(busy)}
                    onClick={() => drop(row)}
                  >
                    Remove
                  </button>
                  {busy === row.id ? (
                    <span className="inline-flex items-center gap-1.5 text-ink-soft">
                      <Spinner className="h-4 w-4 text-teal" />
                      Saving&hellip;
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
