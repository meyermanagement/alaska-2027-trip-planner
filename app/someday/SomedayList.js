"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LocationField from "@/components/LocationField";
import { formatMoney } from "@/lib/rewards";
import { MONTHS, monthsSaid } from "@/lib/someday/months";

/** The whole answer as one line, for the row that is not being edited. */
function placeSaid(row, travelers) {
  const bits = [monthsSaid(row.months)];
  if (row.nights)
    bits.push(`${row.nights} night${row.nights === 1 ? "" : "s"}`);
  if (row.fare_ceiling !== null && row.fare_ceiling !== undefined)
    bits.push(`up to ${formatMoney(row.fare_ceiling)} each in airfare`);
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
  nights: "",
  fare_ceiling: "",
  traveler_ids: [],
  watch: true,
};

function formFrom(row) {
  if (!row) return { ...BLANK };
  return {
    place: row.place || "",
    lat: row.lat ?? null,
    lon: row.lon ?? null,
    why: row.why || "",
    months: [...(row.months || [])],
    nights: row.nights ? String(row.nights) : "",
    fare_ceiling:
      row.fare_ceiling === null || row.fare_ceiling === undefined
        ? ""
        : String(row.fare_ceiling),
    traveler_ids: [...(row.traveler_ids || [])],
    watch: row.watch !== false,
  };
}

/**
 * The bucket list, and the form that both adds to it and edits it.
 *
 * One form for both jobs on purpose: adding a place and correcting one are the
 * same seven questions, and two copies of seven fields is where the two copies
 * start disagreeing about what a blank fare ceiling means.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    const said = form.place.trim().replace(/\s+/g, " ");
    if (!said) {
      setError("Say where, and the rest is optional.");
      return;
    }
    setBusy(true);
    setError("");

    const nights = Number(form.nights);
    const ceiling = Number(form.fare_ceiling);
    const point = await pointFor(said);

    const row = {
      place: said,
      lat: point.lat,
      lon: point.lon,
      why: form.why.trim() || null,
      months: form.months,
      nights:
        Number.isFinite(nights) && nights >= 1 ? Math.round(nights) : null,
      fare_ceiling:
        form.fare_ceiling !== "" && Number.isFinite(ceiling) && ceiling >= 0
          ? ceiling
          : null,
      traveler_ids: form.traveler_ids,
      watch: form.watch,
    };

    const { error: dbError } =
      editing === "new"
        ? await supabase
            .from("someday_places")
            .insert({ ...row, family_id: familyId })
        : await supabase.from("someday_places").update(row).eq("id", editing);

    setBusy(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    stop();
    router.refresh();
  }

  async function change(row, patch) {
    setBusy(true);
    setError("");
    const { error: dbError } = await supabase
      .from("someday_places")
      .update(patch)
      .eq("id", row.id);
    setBusy(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    router.refresh();
  }

  async function drop(row) {
    setBusy(true);
    setError("");
    const { error: dbError } = await supabase
      .from("someday_places")
      .delete()
      .eq("id", row.id);
    setBusy(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    router.refresh();
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

      <div className="mt-3 flex flex-wrap gap-4">
        <div>
          <label className="section-label block" htmlFor="someday-nights">
            Nights
          </label>
          <input
            id="someday-nights"
            className="field w-24"
            inputMode="numeric"
            value={form.nights}
            maxLength={3}
            placeholder="7"
            onChange={(event) => set("nights", event.target.value)}
          />
        </div>
        <div>
          <label className="section-label block" htmlFor="someday-ceiling">
            Airfare worth paying, each
          </label>
          <input
            id="someday-ceiling"
            className="field w-32"
            inputMode="decimal"
            value={form.fare_ceiling}
            maxLength={7}
            placeholder="900"
            onChange={(event) => set("fare_ceiling", event.target.value)}
          />
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

      <label className="mt-3 flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="h-4 w-4"
          checked={form.watch}
          onChange={(event) => set("watch", event.target.checked)}
        />
        Tell me when something matches this
      </label>

      {error ? <p className="mt-2 text-sm text-rose">{error}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={save}
        >
          {busy ? "Saving…" : editing === "new" ? "Add it" : "Save"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
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
                    {row.watch ? (
                      <span className="chip text-teal">Watching</span>
                    ) : null}
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
                    <button
                      type="button"
                      className="text-ink-soft underline decoration-[var(--line)] underline-offset-2 hover:text-ink"
                      disabled={busy}
                      onClick={() => change(row, { watch: !row.watch })}
                    >
                      {row.watch ? "Stop watching" : "Watch it"}
                    </button>
                    {trips.length ? (
                      <label className="flex items-center gap-1.5 text-ink-soft">
                        <span className="sr-only">
                          The trip {row.place} became
                        </span>
                        <select
                          className="field"
                          value=""
                          disabled={busy}
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
                      disabled={busy}
                      onClick={() =>
                        change(row, { status: "retired", watch: false })
                      }
                    >
                      Not any more
                    </button>
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
            One place, the months you could go and the airfare you would pay is
            enough for Aly to know a good fare from a cheap one when she sees
            it. Without a list she is guessing at what you want.
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
                    disabled={busy}
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
                    disabled={busy}
                    onClick={() => drop(row)}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
