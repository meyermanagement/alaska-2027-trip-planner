"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DOC_TYPES,
  docType,
  formatDayYear,
  formatRange,
  isPastTrip,
  monthsUntil,
} from "@/lib/format";

export default function People({
  familyId,
  travelers,
  documents,
  trips = [],
  rosters = [],
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [addingFor, setAddingFor] = useState(null); // traveler id
  const [editingDoc, setEditingDoc] = useState(null); // document id
  const [editingPerson, setEditingPerson] = useState(null); // traveler id
  const [addingPerson, setAddingPerson] = useState(false);
  const [revealed, setRevealed] = useState({});
  const [rosterBusy, setRosterBusy] = useState(null);
  const [editingTripsFor, setEditingTripsFor] = useState(null);
  // Local copy so a tapped trip chip reacts immediately.
  const [roster, setRoster] = useState(rosters);

  const docsFor = (id) => documents.filter((d) => d.traveler_id === id);

  // Soonest first for what is ahead, most recent first for what is done.
  const upcomingTrips = trips
    .filter((t) => !isPastTrip(t))
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  const pastTrips = trips
    .filter((t) => isPastTrip(t))
    .sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));

  const tripIdsFor = (travelerId) =>
    roster.filter((r) => r.traveler_id === travelerId).map((r) => r.trip_id);

  async function toggleTrip(travelerId, tripId, nowOn) {
    setRosterBusy(tripId);
    setRoster((prev) =>
      nowOn
        ? [...prev, { trip_id: tripId, traveler_id: travelerId }]
        : prev.filter(
            (r) => !(r.trip_id === tripId && r.traveler_id === travelerId),
          ),
    );
    if (nowOn) {
      await supabase
        .from("trip_travelers")
        .insert({ trip_id: tripId, traveler_id: travelerId });
    } else {
      await supabase
        .from("trip_travelers")
        .delete()
        .eq("trip_id", tripId)
        .eq("traveler_id", travelerId);
    }
    setRosterBusy(null);
    router.refresh();
  }

  // Anything expiring in the next year, so it is impossible to miss.
  const expiring = documents
    .filter((d) => {
      const m = monthsUntil(d.expiration_date);
      return m !== null && m <= 12;
    })
    .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date));
  const nameFor = (id) => travelers.find((t) => t.id === id)?.name || "Someone";

  async function saveDoc(travelerId, docId, values) {
    if (docId) {
      await supabase.from("traveler_documents").update(values).eq("id", docId);
    } else {
      const mine = docsFor(travelerId);
      const next = mine.length
        ? Math.max(...mine.map((d) => d.sort_order || 0)) + 1
        : 0;
      await supabase
        .from("traveler_documents")
        .insert({ ...values, traveler_id: travelerId, sort_order: next });
    }
    setAddingFor(null);
    setEditingDoc(null);
    router.refresh();
  }

  async function removeDoc(doc) {
    const label = doc.label || docType(doc.doc_type).label;
    if (!window.confirm(`Delete ${label}?`)) return;
    await supabase.from("traveler_documents").delete().eq("id", doc.id);
    router.refresh();
  }

  async function savePerson(travelerId, values) {
    if (travelerId) {
      await supabase.from("travelers").update(values).eq("id", travelerId);
    } else {
      const next = travelers.length
        ? Math.max(...travelers.map((t) => t.sort_order || 0)) + 1
        : 1;
      await supabase
        .from("travelers")
        .insert({ ...values, family_id: familyId, is_person: true, sort_order: next });
    }
    setEditingPerson(null);
    setAddingPerson(false);
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {expiring.length > 0 && (
        <div className="rounded-2xl border border-amber/40 bg-amber/[0.07] p-4 shadow-[0_1px_2px_rgba(22,33,31,0.04)]">
          <h2 className="text-sm font-semibold">Worth renewing soon</h2>
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">
            {expiring.map((d) => {
              const m = monthsUntil(d.expiration_date);
              return (
                <li key={d.id}>
                  {nameFor(d.traveler_id)}&apos;s{" "}
                  {(d.label || docType(d.doc_type).label).toLowerCase()}{" "}
                  {m < 0 ? "expired" : "expires"} {formatDayYear(d.expiration_date)}
                  {m >= 0 && m <= 12 && (
                    <span className="text-ink-soft">
                      {" "}
                      ({m <= 0 ? "this month" : `${m} month${m === 1 ? "" : "s"} out`})
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {travelers.map((person) => {
        const docs = docsFor(person.id);
        return (
          <section key={person.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                {person.color && (
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: person.color }}
                  />
                )}
                <div>
                  <h2 className="font-display text-xl font-semibold">
                    {person.name}
                  </h2>
                  <p className="text-xs text-ink-soft">
                    {person.date_of_birth
                      ? `Born ${formatDayYear(person.date_of_birth)}`
                      : "No date of birth saved"}
                    <span aria-hidden="true"> · </span>
                    {docs.length} {docs.length === 1 ? "document" : "documents"}
                  </p>
                </div>
              </div>
              <div className="no-print flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost px-3 py-1.5 text-xs"
                  onClick={() =>
                    setEditingPerson(
                      editingPerson === person.id ? null : person.id,
                    )
                  }
                >
                  Edit details
                </button>
                <button
                  type="button"
                  className="btn btn-primary px-3 py-1.5 text-xs"
                  onClick={() => {
                    setEditingDoc(null);
                    setAddingFor(addingFor === person.id ? null : person.id);
                  }}
                >
                  Add document
                </button>
              </div>
            </div>

            {person.notes && (
              <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">
                {person.notes}
              </p>
            )}

            {editingPerson === person.id && (
              <PersonForm
                person={person}
                onCancel={() => setEditingPerson(null)}
                onSave={(values) => savePerson(person.id, values)}
              />
            )}

            {addingFor === person.id && (
              <DocForm
                onCancel={() => setAddingFor(null)}
                onSave={(values) => saveDoc(person.id, null, values)}
              />
            )}

            <div className="mt-4 space-y-2.5">
              {docs.length === 0 && addingFor !== person.id && (
                <p className="text-sm text-ink-soft">
                  Nothing saved for {person.name} yet.
                </p>
              )}
              {docs.map((doc) =>
                editingDoc === doc.id ? (
                  <DocForm
                    key={doc.id}
                    doc={doc}
                    onCancel={() => setEditingDoc(null)}
                    onSave={(values) => saveDoc(person.id, doc.id, values)}
                  />
                ) : (
                  <DocRow
                    key={doc.id}
                    doc={doc}
                    shown={!!revealed[doc.id]}
                    onToggle={() =>
                      setRevealed((r) => ({ ...r, [doc.id]: !r[doc.id] }))
                    }
                    onEdit={() => {
                      setAddingFor(null);
                      setEditingDoc(doc.id);
                    }}
                    onDelete={() => removeDoc(doc)}
                  />
                ),
              )}
            </div>

            {trips.length > 0 && (
              <div className="mt-4 border-t border-sand-deep pt-3">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft">
                    Trips
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingTripsFor(
                        editingTripsFor === person.id ? null : person.id,
                      )
                    }
                    className="no-print text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                  >
                    {editingTripsFor === person.id ? "Done" : "Change trips"}
                  </button>
                </div>

                {editingTripsFor === person.id ? (
                  <div className="no-print mt-2 space-y-3">
                    <p className="text-xs text-ink-soft">
                      Check every trip {person.name} is on.
                    </p>
                    {[
                      ["Coming up", upcomingTrips],
                      ["Already done", pastTrips],
                    ].map(([heading, list]) =>
                      list.length === 0 ? null : (
                        <div key={heading}>
                          <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft/70">
                            {heading}
                          </p>
                          <ul className="mt-1 divide-y divide-sand-deep overflow-hidden rounded-xl border border-sand-deep bg-white">
                            {list.map((trip) => {
                              const on = tripIdsFor(person.id).includes(trip.id);
                              return (
                                <li key={trip.id}>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleTrip(person.id, trip.id, !on)
                                    }
                                    disabled={rosterBusy === trip.id}
                                    aria-pressed={on}
                                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-sand/60 disabled:opacity-50"
                                  >
                                    <span
                                      aria-hidden="true"
                                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs font-bold ${
                                        on
                                          ? "border-teal bg-teal text-white"
                                          : "border-sand-deep bg-white text-transparent"
                                      }`}
                                    >
                                      ✓
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-semibold text-ink">
                                        {trip.cover_emoji && (
                                          <span
                                            aria-hidden="true"
                                            className="mr-1.5"
                                          >
                                            {trip.cover_emoji}
                                          </span>
                                        )}
                                        {trip.name}
                                      </span>
                                      <span className="block text-xs text-ink-soft">
                                        {formatRange(
                                          trip.start_date,
                                          trip.end_date,
                                        )}
                                      </span>
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <PersonTripList
                    name={person.name}
                    upcoming={upcomingTrips.filter((t) =>
                      tripIdsFor(person.id).includes(t.id),
                    )}
                    past={pastTrips.filter((t) =>
                      tripIdsFor(person.id).includes(t.id),
                    )}
                  />
                )}
              </div>
            )}
          </section>
        );
      })}

      {addingPerson ? (
        <div className="card p-5">
          <h2 className="font-display text-lg font-semibold">Add someone</h2>
          <PersonForm
            onCancel={() => setAddingPerson(false)}
            onSave={(values) => savePerson(null, values)}
          />
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost no-print"
          onClick={() => setAddingPerson(true)}
        >
          Add someone
        </button>
      )}
    </div>
  );
}

function DocRow({ doc, shown, onToggle, onEdit, onDelete }) {
  const type = docType(doc.doc_type);
  const months = monthsUntil(doc.expiration_date);
  const masked = maskNumber(doc.number);

  let expiry = null;
  if (doc.expiration_date) {
    const cls =
      months < 0
        ? "bg-rose/10 text-rose"
        : months <= 6
          ? "bg-amber/15 text-amber"
          : "bg-sand-deep text-ink-soft";
    expiry = (
      <span className={`chip ${cls}`}>
        {months < 0 ? "Expired" : "Expires"} {formatDayYear(doc.expiration_date)}
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-sand-deep bg-sand/40 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            <span aria-hidden="true">{type.icon} </span>
            {doc.label || type.label}
            {doc.label && (
              <span className="ml-1.5 font-normal text-ink-soft">
                {type.label}
              </span>
            )}
          </p>
          {doc.number && (
            <p className="mt-1 font-mono text-sm tracking-wide">
              {shown ? doc.number : masked}
              <button
                type="button"
                onClick={onToggle}
                className="no-print ml-2 font-sans text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-4"
              >
                {shown ? "Hide" : "Show"}
              </button>
            </p>
          )}
          <p className="mt-1 text-xs text-ink-soft">
            {doc.issuing_authority && <span>{doc.issuing_authority}</span>}
            {doc.issuing_authority && doc.issue_date && (
              <span aria-hidden="true"> · </span>
            )}
            {doc.issue_date && <span>Issued {formatDayYear(doc.issue_date)}</span>}
          </p>
          {doc.notes && (
            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
              {doc.notes}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {expiry}
          <div className="no-print flex gap-2 text-xs font-semibold">
            <button type="button" onClick={onEdit} className="text-teal">
              Edit
            </button>
            <button type="button" onClick={onDelete} className="text-rose">
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shows only the last four characters until someone taps Show. */
function maskNumber(value) {
  const raw = (value || "").trim();
  if (!raw) return "";
  if (raw.length <= 4) return "••••";
  return `•••• ${raw.slice(-4)}`;
}

function DocForm({ doc, onCancel, onSave }) {
  const [form, setForm] = useState({
    doc_type: doc?.doc_type || "passport",
    label: doc?.label || "",
    number: doc?.number || "",
    issuing_authority: doc?.issuing_authority || "",
    issue_date: doc?.issue_date || "",
    expiration_date: doc?.expiration_date || "",
    notes: doc?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    await onSave({
      doc_type: form.doc_type,
      label: form.label.trim() || null,
      number: form.number.trim() || null,
      issuing_authority: form.issuing_authority.trim() || null,
      issue_date: form.issue_date || null,
      expiration_date: form.expiration_date || null,
      notes: form.notes.trim() || null,
      ...(doc ? { updated_at: new Date().toISOString() } : {}),
    });
    setBusy(false);
  }

  return (
    <form
      onSubmit={submit}
      className="no-print mt-3 space-y-3 rounded-xl border border-teal/30 bg-teal-soft/40 p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold">
          Type
          <select
            className="field mt-1 text-sm"
            value={form.doc_type}
            onChange={set("doc_type")}
          >
            {DOC_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold">
          Label (optional)
          <input
            className="field mt-1 text-sm"
            placeholder="United MileagePlus, Missouri license…"
            value={form.label}
            onChange={set("label")}
          />
        </label>
        <label className="block text-xs font-semibold sm:col-span-2">
          Number
          <input
            className="field mt-1 font-mono text-sm"
            autoComplete="off"
            value={form.number}
            onChange={set("number")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Issued by (optional)
          <input
            className="field mt-1 text-sm"
            placeholder="United States, Missouri, CBP…"
            value={form.issuing_authority}
            onChange={set("issuing_authority")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Issued on (optional)
          <input
            type="date"
            className="field mt-1 text-sm"
            value={form.issue_date}
            onChange={set("issue_date")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Expires (optional)
          <input
            type="date"
            className="field mt-1 text-sm"
            value={form.expiration_date}
            onChange={set("expiration_date")}
          />
        </label>
        <label className="block text-xs font-semibold sm:col-span-2">
          Notes (optional)
          <textarea
            className="field mt-1 text-sm"
            rows={2}
            placeholder="Where the physical copy lives, renewal appointment, anything else."
            value={form.notes}
            onChange={set("notes")}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary px-3 py-1.5 text-xs" disabled={busy}>
          {doc ? "Save changes" : "Save document"}
        </button>
        <button
          type="button"
          className="btn btn-ghost px-3 py-1.5 text-xs"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PersonForm({ person, onCancel, onSave }) {
  const [form, setForm] = useState({
    name: person?.name || "",
    date_of_birth: person?.date_of_birth || "",
    notes: person?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    await onSave({
      name: form.name.trim(),
      date_of_birth: form.date_of_birth || null,
      notes: form.notes.trim() || null,
    });
    setBusy(false);
  }

  return (
    <form
      onSubmit={submit}
      className="no-print mt-3 space-y-3 rounded-xl border border-teal/30 bg-teal-soft/40 p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold">
          Name
          <input
            className="field mt-1 text-sm"
            value={form.name}
            onChange={set("name")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Date of birth (optional)
          <input
            type="date"
            className="field mt-1 text-sm"
            value={form.date_of_birth}
            onChange={set("date_of_birth")}
          />
        </label>
        <label className="block text-xs font-semibold sm:col-span-2">
          Notes (optional)
          <textarea
            className="field mt-1 text-sm"
            rows={2}
            placeholder="Seat preferences, dietary needs, anything worth remembering when booking."
            value={form.notes}
            onChange={set("notes")}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button className="btn btn-primary px-3 py-1.5 text-xs" disabled={busy}>
          Save
        </button>
        <button
          type="button"
          className="btn btn-ghost px-3 py-1.5 text-xs"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// A person's trips, newest plans first and finished trips underneath, so the
// list stays readable as trips pile up.
function PersonTripList({ name, upcoming, past }) {
  if (upcoming.length === 0 && past.length === 0) {
    return (
      <p className="mt-1.5 text-sm text-ink-soft">
        {name} is not on any trips yet.
      </p>
    );
  }

  return (
    <div className="mt-2 space-y-3">
      {[
        ["Coming up", upcoming],
        ["Already done", past],
      ].map(([heading, list]) =>
        list.length === 0 ? null : (
          <div key={heading}>
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-soft/70">
              {heading}
            </p>
            <ul className="mt-1 space-y-1.5">
              {list.map((trip) => (
                <li
                  key={trip.id}
                  className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2"
                >
                  <span className="flex min-w-0 items-baseline gap-2 text-sm font-semibold text-ink sm:flex-1">
                    <span aria-hidden="true" className="shrink-0">
                      {trip.cover_emoji || "•"}
                    </span>
                    <span className="truncate">{trip.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {formatRange(trip.start_date, trip.end_date)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}
