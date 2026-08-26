"use client";

import { useState } from "react";
import { carryEnd, formatRange } from "@/lib/format";

const STATUSES = [
  // Draft keeps the trip out of Upcoming and out of Past until someone moves it.
  { value: "draft", label: "Draft — still an idea" },
  { value: "planning", label: "Planning" },
  { value: "booked", label: "Booked" },
  { value: "active", label: "Happening now" },
  { value: "complete", label: "Finished" },
  { value: "archived", label: "Archived" },
];

// Edit the trip's own details. Dates normally follow the itinerary, so the
// date fields stay out of the way until that is switched off.
export default function TripForm({
  trip,
  autoStart,
  autoEnd,
  onCancel,
  onSave,
}) {
  const [values, setValues] = useState({
    name: trip.name || "",
    destination: trip.destination || "",
    cover_emoji: trip.cover_emoji || "",
    status: trip.status || "planning",
    summary: trip.summary || "",
    dates_auto: trip.dates_auto !== false,
    start_date: trip.start_date || "",
    end_date: trip.end_date || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  // Moving the first day moves the last one with it, holding the same length.
  // A trip with no last day yet keeps it empty: a day trip is a real trip, so
  // there is no minimum length to infer one from.
  const setStartDate = (event) =>
    setValues((v) => ({
      ...v,
      start_date: event.target.value,
      end_date: carryEnd(v.start_date, v.end_date, event.target.value, 0),
    }));

  async function submit(event) {
    event.preventDefault();
    if (!values.name.trim()) {
      setError("The trip needs a name.");
      return;
    }
    if (
      !values.dates_auto &&
      values.start_date &&
      values.end_date &&
      values.end_date < values.start_date
    ) {
      setError("The last day cannot be before the first day.");
      return;
    }
    setSaving(true);
    setError(null);
    const problem = await onSave({
      name: values.name.trim(),
      destination: values.destination.trim() || null,
      cover_emoji: values.cover_emoji.trim() || "🧳",
      status: values.status,
      summary: values.summary.trim() || null,
      dates_auto: values.dates_auto,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
    });
    setSaving(false);
    if (problem) setError(problem);
  }

  return (
    <form onSubmit={submit} className="no-print space-y-3">
      <div className="flex gap-3">
        <label className="w-20 shrink-0">
          <span className="block section-label">Icon</span>
          <input
            className="field mt-1 text-center text-xl"
            value={values.cover_emoji}
            onChange={set("cover_emoji")}
            maxLength={4}
            aria-label="Trip icon"
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className="block section-label">Trip name</span>
          <input
            className="field mt-1"
            value={values.name}
            onChange={set("name")}
            required
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label>
          <span className="block section-label">Where</span>
          <input
            className="field mt-1"
            value={values.destination}
            onChange={set("destination")}
            placeholder="Willemstad, Curaçao"
          />
        </label>
        <label>
          <span className="block section-label">Status</span>
          <select
            className="field mt-1"
            value={values.status}
            onChange={set("status")}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-[var(--line)] bg-sand/50 p-3">
        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-teal"
            checked={values.dates_auto}
            onChange={(e) =>
              setValues((v) => ({ ...v, dates_auto: e.target.checked }))
            }
          />
          <span className="text-sm">
            <span className="font-semibold">Follow the itinerary</span>
            <span className="mt-0.5 block text-xs text-ink-soft">
              {!autoStart
                ? "Nothing on the itinerary has a date yet, so the dates stay as they are."
                : values.dates_auto
                  ? `The first and last day come from the itinerary: ${formatRange(autoStart, autoEnd)}. Change a flight or a check-out and these move with it.`
                  : `Set by hand below. The itinerary currently runs ${formatRange(autoStart, autoEnd)}.`}
            </span>
          </span>
        </label>

        {!values.dates_auto && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="block section-label">First day</span>
              <input
                type="date"
                className="field mt-1"
                value={values.start_date}
                onChange={setStartDate}
              />
            </label>
            <label>
              <span className="block section-label">Last day</span>
              <input
                type="date"
                className="field mt-1"
                value={values.end_date}
                min={values.start_date || undefined}
                onChange={set("end_date")}
              />
            </label>
          </div>
        )}
      </div>

      <label className="block">
        <span className="block section-label">Summary</span>
        <textarea
          className="field mt-1 min-h-20"
          value={values.summary}
          onChange={set("summary")}
          placeholder="A line or two about the trip."
        />
      </label>

      {error && <p className="text-sm font-semibold text-rose">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save trip"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
