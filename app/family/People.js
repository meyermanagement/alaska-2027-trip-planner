"use client";

import { useMemo, useState } from "react";
import { PassportWarningPanel } from "@/components/PassportWarning";
import { headlineFor } from "@/lib/tips/warnings";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { syncPackingForTraveler } from "@/lib/packing/roster";
import { ageToday } from "@/lib/travelers/ages";
import { LEVELS, PRIMARY, SECONDARY } from "@/lib/travelers/access";
import {
  ABOUT_ME_PLACEHOLDER,
  GENDERS,
  GENDER_VALUES,
  MOBILITY_AIDS,
  aidLabel,
  cleanAids,
  genderLabel,
  languageField,
  normalizeGender,
  parseLanguages,
} from "@/lib/travelers/profile";

// The value the select uses for "a term of their own". Not a stored value: it
// only ever means "show the box", and what gets saved is whatever is typed in it.
const OWN_TERM = "__own__";
import {
  DOC_TYPES,
  docType,
  formatDayYear,
  formatRange,
  isDraftTrip,
  isPastTrip,
  monthsUntil,
} from "@/lib/format";

export default function People({
  familyId,
  userId,
  userEmail,
  travelers,
  documents,
  trips = [],
  rosters = [],
  warnings = [],
  // The screen around this component owns which person is open and whether the
  // add form is up: the band of chips at the top of the page points at people and
  // animals alike, so it cannot live inside either list.
  only = null,
  picker = null,
  addOpen = false,
  onAddDone = null,
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  // Worked out once per render rather than per person, and on the client's own
  // clock, which is the one whose today the reader means.
  const todayISO = useMemo(() => new Date().toLocaleDateString("en-CA"), []);

  const [addingFor, setAddingFor] = useState(null); // traveler id
  const [editingDoc, setEditingDoc] = useState(null); // document id
  const [editingPerson, setEditingPerson] = useState(null); // traveler id
  const [addingPersonInner, setAddingPerson] = useState(false);
  const controlled = picker !== null;
  const addingPerson = controlled ? addOpen : addingPersonInner;
  const closeAdd = () => (onAddDone ? onAddDone() : setAddingPerson(false));
  // Which cards are drawn. `only` is a traveler id when one person is open, and
  // an empty string when the band is pointing somewhere else entirely -- at an
  // animal, or at the add form.
  const shown = controlled ? travelers.filter((t) => t.id === only) : travelers;
  const [revealed, setRevealed] = useState({});
  const [rosterBusy, setRosterBusy] = useState(null);
  // What the trip's packing list did about the tap, kept per trip so the line
  // appears under the trip it is about.
  const [rosterNote, setRosterNote] = useState({});
  const [editingTripsFor, setEditingTripsFor] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(null);
  const [inviteNote, setInviteNote] = useState(null);
  const [remindBusy, setRemindBusy] = useState(null);
  // Whether the person reading this page may set anybody's level. A secondary
  // traveler never sees the control; the database would refuse the write anyway,
  // but silently, so drawing it would be a lie.
  const myLevel = useMemo(() => {
    const me = (travelers || []).find(
      (t) =>
        t.user_id === userId ||
        (!!t.email &&
          !!userEmail &&
          t.email.toLowerCase() === userEmail.toLowerCase()),
    );
    // No row of their own means primary, matching is_secondary_traveler in the
    // database and resolveAccess in lib/travelers/access.js. All three have to
    // agree or somebody gets a screen that does not match what they can do.
    return me?.access_level === SECONDARY ? SECONDARY : PRIMARY;
  }, [travelers, userId, userEmail]);
  const canSetLevels = myLevel !== SECONDARY;

  const [levelBusy, setLevelBusy] = useState(null);
  const [levelNote, setLevelNote] = useState(null);
  // Local copy so a tapped trip chip reacts immediately.
  const [roster, setRoster] = useState(rosters);

  const docsFor = (id) => documents.filter((d) => d.traveler_id === id);

  // Soonest first for what is ahead, most recent first for what is done. Drafts
  // are kept apart: people can still be pencilled in, but a draft is not a trip
  // that is coming up.
  const draftTrips = trips
    .filter(isDraftTrip)
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const upcomingTrips = trips
    .filter((t) => !isDraftTrip(t) && !isPastTrip(t))
    .sort((a, b) => (a.start_date || "").localeCompare(b.start_date || ""));
  const pastTrips = trips
    .filter((t) => isPastTrip(t))
    .sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""));

  const tripIdsFor = (travelerId) =>
    roster.filter((r) => r.traveler_id === travelerId).map((r) => r.trip_id);

  async function toggleTrip(travelerId, tripId, nowOn) {
    setRosterBusy(tripId);
    setRosterNote((prev) => ({ ...prev, [tripId]: "" }));
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
    // Same rule as the trip header: their own lines from the base list arrive
    // when they do and leave when they do, and anything already packed or
    // written on stays.
    const sync = await syncPackingForTraveler({
      supabase,
      tripId,
      familyId,
      person: travelers.find((t) => t.id === travelerId),
      going: nowOn,
    });
    setRosterNote((prev) => ({ ...prev, [tripId]: sync.message || "" }));
    setRosterBusy(null);
    router.refresh();
  }

  // Anything expiring in the next year, so it is impossible to miss.
  // Both amber panels used to list the whole family, which made them read as
  // page furniture that happened to sit above whoever was open. With one person
  // on screen they say that person's paperwork and nothing else -- and the trip
  // headline is rewritten for them, since "Mark and Veda's passports" is the
  // wrong sentence on Veda's card.
  const openPerson = controlled
    ? travelers.find((t) => t.id === only) || null
    : null;
  const shownWarnings = useMemo(() => {
    if (!controlled) return warnings;
    if (!openPerson) return [];
    const mine = (group) =>
      (group || []).filter(
        (p) => p.id === openPerson.id || p.name === openPerson.name,
      );
    return (warnings || [])
      .map((w) => {
        const expired = mine(w.expired);
        const short = mine(w.short);
        const missing = mine(w.missing);
        if (!expired.length && !short.length && !missing.length) return null;
        return {
          ...w,
          expired,
          short,
          missing,
          severity: expired.length
            ? "expired"
            : short.length
              ? "short"
              : "missing",
          headline: headlineFor({
            trip: { name: w.tripName },
            expired,
            short,
            missing,
            back: w.returnDate,
            mustLastUntil: w.mustLastUntil,
          }),
        };
      })
      .filter(Boolean);
  }, [controlled, openPerson, warnings]);

  const expiring = (
    controlled
      ? documents.filter((d) => openPerson && d.traveler_id === openPerson.id)
      : documents
  )
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
    let error = null;
    if (travelerId) {
      ({ error } = await supabase
        .from("travelers")
        .update(values)
        .eq("id", travelerId));
    } else {
      const next = travelers.length
        ? Math.max(...travelers.map((t) => t.sort_order || 0)) + 1
        : 1;
      ({ error } = await supabase.from("travelers").insert({
        ...values,
        family_id: familyId,
        is_person: true,
        sort_order: next,
      }));
    }
    if (error) {
      // The one failure worth spelling out: two people cannot share a sign-in
      // address, because the address is what decides whose name a change lands
      // under.
      return /travelers_family_email/.test(error.message || "")
        ? "Someone else in the family already uses that email address."
        : error.message || "That did not save.";
    }
    // Saving your own address should seat you immediately. The claim only ever
    // matches the signed-in account's own email, so calling it here is safe and
    // does nothing when there is nothing to match.
    if (values.email) await supabase.rpc("claim_traveler_seat");
    setEditingPerson(null);
    setAddingPerson(false);
    router.refresh();
    return null;
  }

  // Moves somebody between primary and secondary. The database refuses to leave
  // a family with no primary traveler, and that refusal is the message shown --
  // it is written for a person to read, so there is nothing to translate.
  async function setLevel(person, level) {
    setLevelBusy(person.id);
    setLevelNote(null);
    const { error } = await supabase
      .from("travelers")
      .update({ access_level: level })
      .eq("id", person.id);
    setLevelBusy(null);
    if (error) {
      setLevelNote({ id: person.id, text: humanizeLevelError(error, person) });
      return;
    }
    // Two places hold a short-lived note of what level this browser was told,
    // so the menu can be drawn before the database has been asked. Both are
    // dropped here, or a primary traveler who has just stepped down would keep
    // being shown a menu they no longer have.
    forgetLevel();
    router.refresh();
  }

  // Turns the morning reminder emails on or off for one person. Written straight
  // to their row rather than kept in a settings screen, because it belongs to the
  // same address the sign-in email uses.
  async function setReminders(person, wanted) {
    await supabase
      .from("travelers")
      .update({ wants_reminders: wanted })
      .eq("id", person.id);
    router.refresh();
  }

  // Sends today's reminder to yourself, whatever the schedule is doing. The one
  // way to see the real email without waiting for the morning.
  async function sendMine(person) {
    setRemindBusy(person.id);
    setInviteNote(null);
    try {
      const res = await fetch("/api/tasks/remind", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      setInviteNote({
        id: person.id,
        ok: res.ok,
        text: res.ok
          ? data?.nothing
            ? data.message
            : `Sent to ${data.to} — ${data.count} ${data.count === 1 ? "task" : "tasks"} due today.`
          : data?.error || "The email could not be sent.",
      });
    } catch {
      setInviteNote({
        id: person.id,
        ok: false,
        text: "The email could not be sent.",
      });
    } finally {
      setRemindBusy(null);
    }
  }

  // Sends the branded sign-in email. The address itself is what grants access —
  // this is the nudge telling them it is waiting.
  async function sendInvite(person) {
    setInviteBusy(person.id);
    setInviteNote(null);
    try {
      const res = await fetch("/api/people/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traveler_id: person.id }),
      });
      const data = await res.json().catch(() => ({}));
      setInviteNote({
        id: person.id,
        ok: res.ok,
        text: res.ok
          ? data?.test
            ? `Test copy sent to ${person.email}. If it arrives, the sign-in emails will too.`
            : `Sent to ${person.email}.`
          : data?.error || "The email could not be sent.",
      });
      if (res.ok) router.refresh();
    } catch {
      setInviteNote({
        id: person.id,
        ok: false,
        text: "The email could not be sent.",
      });
    } finally {
      setInviteBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      {picker}

      <PassportWarningPanel warnings={shownWarnings} />
      {expiring.length > 0 && (
        <div className="rounded-xl border border-amber/40 bg-amber/[0.07] p-4 shadow-[0_1px_2px_rgba(22,33,31,0.04)]">
          <h2 className="text-sm font-semibold">
            {openPerson
              ? `Worth renewing soon for ${openPerson.name}`
              : "Worth renewing soon"}
          </h2>
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">
            {expiring.map((d) => {
              const m = monthsUntil(d.expiration_date);
              return (
                <li key={d.id}>
                  {nameFor(d.traveler_id)}&apos;s{" "}
                  {(d.label || docType(d.doc_type).label).toLowerCase()}{" "}
                  {m < 0 ? "expired" : "expires"}{" "}
                  {formatDayYear(d.expiration_date)}
                  {m >= 0 && m <= 12 && (
                    <span className="text-ink-soft">
                      {" "}
                      (
                      {m <= 0
                        ? "this month"
                        : `${m} month${m === 1 ? "" : "s"} out`}
                      )
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {shown.map((person) => {
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
                      ? `Born ${formatDayYear(person.date_of_birth)}${
                          // The number nobody wants to work out in their head,
                          // and the one that decides what is bookable.
                          ageToday(person.date_of_birth, todayISO) === null
                            ? ""
                            : ` · ${ageToday(person.date_of_birth, todayISO)} years old`
                        }`
                      : "No date of birth saved"}
                    <span aria-hidden="true"> · </span>
                    {docs.length} {docs.length === 1 ? "document" : "documents"}
                  </p>
                </div>
              </div>
              <div className="no-print flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-ghost whitespace-nowrap px-3 py-1.5 text-xs"
                  onClick={() =>
                    setEditingPerson(
                      editingPerson === person.id ? null : person.id,
                    )
                  }
                >
                  Edit details
                </button>
                {trips.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost whitespace-nowrap px-3 py-1.5 text-xs"
                    onClick={() =>
                      setEditingTripsFor(
                        editingTripsFor === person.id ? null : person.id,
                      )
                    }
                  >
                    {editingTripsFor === person.id ? "Done" : "Trips"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-primary whitespace-nowrap px-3 py-1.5 text-xs"
                  onClick={() => {
                    setEditingDoc(null);
                    setAddingFor(addingFor === person.id ? null : person.id);
                  }}
                >
                  Add document
                </button>
              </div>
            </div>

            {/* Everything a button on that row opens, opens here: directly under
                the button, before the notes and the profile lines and the access
                row. It used to render further down, below all of those, which on
                a card with a paragraph and a passport in it put the form most of
                a screen away from the thing that asked for it -- so a press read
                as having done nothing at all. */}
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

            {editingTripsFor === person.id && (
              <div className="no-print mt-3 space-y-3 rounded-xl border border-[var(--line)] bg-sand/40 p-3">
                <p className="text-xs text-ink-soft">
                  Check every trip {person.name} is on. Their packing list
                  follows this.
                </p>
                {[
                  ["Coming up", upcomingTrips],
                  ["Still just an idea", draftTrips],
                  ["Already done", pastTrips],
                ].map(([heading, list]) =>
                  list.length === 0 ? null : (
                    <div key={heading}>
                      <p className="section-label">{heading}</p>
                      <ul className="mt-1 divide-y divide-sand-deep overflow-hidden rounded-xl border border-[var(--line)] bg-white">
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
                                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg border text-xs font-bold ${
                                    on
                                      ? "border-teal bg-teal text-on-accent"
                                      : "border-[var(--line)] bg-white text-transparent"
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
                              {rosterNote[trip.id] ? (
                                <p
                                  aria-live="polite"
                                  className="px-3 pb-2.5 text-xs text-ink-soft"
                                >
                                  {rosterNote[trip.id]}
                                </p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ),
                )}
              </div>
            )}

            {/* Not while the form is open: it holds all three of these, and
                showing them again underneath is the same words twice on a card
                that is already long. */}
            {editingPerson !== person.id && person.notes && (
              <p className="mt-2.5 text-sm leading-relaxed text-ink-soft">
                {person.notes}
              </p>
            )}

            {editingPerson !== person.id && <ProfileLines person={person} />}

            {editingPerson !== person.id && person.about_me && (
              <div className="mt-2.5 rounded-lg border border-sand-deep bg-sand/60 p-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  In their own words
                </p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                  {person.about_me}
                </p>
              </div>
            )}

            <AccessRow
              person={person}
              isMe={
                person.user_id === userId ||
                (!!person.email &&
                  !!userEmail &&
                  person.email.toLowerCase() === userEmail.toLowerCase())
              }
              busy={inviteBusy === person.id}
              remindBusy={remindBusy === person.id}
              note={inviteNote?.id === person.id ? inviteNote : null}
              onSend={() => sendInvite(person)}
              onAddEmail={() => setEditingPerson(person.id)}
              onReminders={(wanted) => setReminders(person, wanted)}
              onSendMine={() => sendMine(person)}
            />

            {canSetLevels && (
              <LevelPicker
                person={person}
                isMe={
                  person.user_id === userId ||
                  (!!person.email &&
                    !!userEmail &&
                    person.email.toLowerCase() === userEmail.toLowerCase())
                }
                busy={levelBusy === person.id}
                note={levelNote?.id === person.id ? levelNote : null}
                onLevel={(level) => setLevel(person, level)}
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
          </section>
        );
      })}

      {addingPerson ? (
        <div className="card p-5">
          <h2 className="font-display text-lg font-semibold">Add someone</h2>
          <PersonForm
            onCancel={closeAdd}
            onSave={async (values) => {
              const out = await savePerson(null, values);
              if (controlled) closeAdd();
              return out;
            }}
          />
        </div>
      ) : (
        !controlled && (
          <button
            type="button"
            className="btn btn-ghost no-print"
            onClick={() => setAddingPerson(true)}
          >
            Add someone
          </button>
        )
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
        {months < 0 ? "Expired" : "Expires"}{" "}
        {formatDayYear(doc.expiration_date)}
      </span>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--line)] bg-sand/40 p-3">
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
            {doc.issue_date && (
              <span>Issued {formatDayYear(doc.issue_date)}</span>
            )}
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
        <button
          className="btn btn-primary whitespace-nowrap px-3 py-1.5 text-xs"
          disabled={busy}
        >
          {doc ? "Save changes" : "Save document"}
        </button>
        <button
          type="button"
          className="btn btn-ghost whitespace-nowrap px-3 py-1.5 text-xs"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// Who can get into the app, said plainly on the person it belongs to. An email
// address here is not a formality: it is the thing that lets someone sign in, so
// the row states what that address currently does rather than just showing it.
// invited_at is a timestamp, not a date, so it cannot go through the date-only
// formatters the rest of this file uses.
function stampDay(value) {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return "already";
  return when.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

// The trigger in 20260828_access_levels.sql raises a sentence meant to be read,
// so the job here is to notice it rather than to reword it.
// Clears the hints the menu draws its first frame from: a cookie the middleware
// left, and the copy the loading skeleton reads back. Neither grants anything --
// the database is what refuses -- so clearing them is safe at any time, and only
// ever costs one extra query.
function forgetLevel() {
  try {
    document.cookie = "alyeska_level=; Max-Age=0; Path=/; SameSite=Lax";
    window.localStorage.removeItem("alyeska.level");
  } catch {
    // A browser refusing storage just waits for the cookie to expire.
  }
}

function humanizeLevelError(error, person) {
  const text = error?.message || "";
  if (/only primary traveler/i.test(text)) {
    return `${person.name} is the only primary traveler, so somebody else has to be made primary first.`;
  }
  // The screen no longer offers this, but the rule lives in the database and the
  // sentence it raises is written to be read, so it is passed through rather than
  // flattened into "that could not be saved".
  if (/cannot change your own access/i.test(text)) {
    return "You cannot change your own access. Another primary traveler has to do it, so that nobody can lock themselves out of their own trips.";
  }
  return "That could not be saved. Try again in a moment.";
}

// Who runs the trip and who is along for it. Only shown to a primary traveler.
//
// Your own row shows the level and no way to change it. It used to show both
// pills, on the reasoning that the database would refuse a demotion when you were
// the last primary and the refusal would arrive as a sentence. That reasoning had
// a hole: when there is another primary the demotion is perfectly legal, so one
// tap took away the tab that the pill lives on and there was no way back without
// the other primary. A control whose success locks you out of reaching it again is
// not a control, and this is refused in the database too.
//
// Somebody else's demotion asks first. It is not dangerous -- a primary can undo
// it -- but it takes things away from a person, and the pill is one tap away from
// the pill next to it.
export function LevelPicker({ person, isMe, busy, note, onLevel }) {
  const level = person.access_level === SECONDARY ? SECONDARY : PRIMARY;
  const [asking, setAsking] = useState(null);
  const current = LEVELS.find((l) => l.id === level);

  return (
    <div className="no-print mt-2.5 border-t border-[var(--line)] pt-2.5">
      <p className="section-label">Access</p>

      {isMe ? (
        <p className="mt-1.5 text-sm text-ink">
          <span className="font-semibold">{current?.label}</span>
          <span className="text-ink-soft">
            {" "}
            — this is you. Another primary traveler has to change your access,
            so that nobody can lock themselves out of their own trips.
          </span>
        </p>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {LEVELS.map((option) => {
              const on = option.id === level;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy || on}
                  aria-pressed={on}
                  onClick={() =>
                    option.id === SECONDARY
                      ? setAsking(option.id)
                      : onLevel(option.id)
                  }
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    on
                      ? "border-teal bg-teal text-on-accent"
                      : "border-teal/50 bg-white text-teal hover:bg-teal-soft/60"
                  } ${busy ? "opacity-60" : ""}`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>

          {asking === SECONDARY && (
            <div className="mt-2 rounded-lg border border-amber/40 bg-amber/10 p-2.5">
              <p className="text-xs leading-relaxed text-ink">
                Make {person.name} a secondary traveler? They keep the itinerary
                and their own packing and tasks, and lose the Wallet, the
                documents, the templates, everybody else&rsquo;s lists, and this
                tab. You can change it back.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary px-3 py-1 text-xs"
                  disabled={busy}
                  onClick={() => {
                    setAsking(null);
                    onLevel(SECONDARY);
                  }}
                >
                  {busy ? "Saving…" : "Yes, make them secondary"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-3 py-1 text-xs"
                  onClick={() => setAsking(null)}
                >
                  Keep them primary
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
        {current?.blurb}
      </p>
      {note && (
        <p className="mt-1.5 text-xs font-semibold text-rose">{note.text}</p>
      )}
    </div>
  );
}

export function AccessRow({
  person,
  isMe,
  busy,
  remindBusy,
  note,
  onSend,
  onAddEmail,
  onReminders,
  onSendMine,
}) {
  // Your own row counts as settled the moment it carries your address, even if
  // the seat claim has not caught up — you are demonstrably signed in already.
  const mine = isMe && !!person.email;
  const linked = !!person.user_id || mine;

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] bg-sand/40 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <p className="section-label">Signing in</p>
          {linked ? (
            <p className="mt-0.5 text-sm text-ink">
              <span
                aria-hidden="true"
                className="mr-1.5 inline-block h-2 w-2 rounded-full bg-teal align-middle"
              />
              <span className="break-all font-semibold">{person.email}</span>
              {mine
                ? " — that's you"
                : person.access_level === SECONDARY
                  ? " — signed in, and can check off their own things"
                  : " — signed in and can make changes"}
            </p>
          ) : person.email ? (
            <p className="mt-0.5 text-sm text-ink-soft">
              <span className="break-all font-semibold text-ink">
                {person.email}
              </span>{" "}
              can sign in with Google.{" "}
              {person.invited_at
                ? `Emailed ${stampDay(person.invited_at)}, not signed in yet.`
                : "They have not been emailed yet."}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-ink-soft">
              No email saved, so {person.name} cannot sign in or make changes.
            </p>
          )}
        </div>

        {mine && (
          <div className="no-print shrink-0">
            <button
              type="button"
              onClick={onSend}
              disabled={busy}
              className="btn btn-ghost whitespace-nowrap px-3 py-1.5 text-xs"
            >
              {busy ? "Sending…" : "Email myself a test copy"}
            </button>
          </div>
        )}

        {!linked && (
          <div className="no-print shrink-0">
            {person.email ? (
              <button
                type="button"
                onClick={onSend}
                disabled={busy}
                className="btn btn-primary whitespace-nowrap px-3 py-1.5 text-xs"
              >
                {busy
                  ? "Sending…"
                  : person.invited_at
                    ? "Send it again"
                    : "Send sign-in email"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onAddEmail}
                className="btn btn-ghost whitespace-nowrap px-3 py-1.5 text-xs"
              >
                Add an email
              </button>
            )}
          </div>
        )}
      </div>

      {person.email && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[var(--line)] pt-2.5">
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--color-teal)]"
              checked={person.wants_reminders !== false}
              onChange={(e) => onReminders?.(e.target.checked)}
            />
            <span>
              Email {isMe ? "me" : person.name.split(" ")[0]} on the morning
              anything {isMe ? "I am" : "they are"} responsible for is due
            </span>
          </label>

          {isMe && person.wants_reminders !== false && (
            <button
              type="button"
              onClick={onSendMine}
              disabled={remindBusy}
              className="no-print btn btn-ghost shrink-0 px-3 py-1.5 text-xs"
            >
              {remindBusy ? "Sending…" : "Send mine now"}
            </button>
          )}
        </div>
      )}

      {note && (
        <p
          className={`mt-2 rounded-lg px-3 py-2 text-xs ${
            note.ok ? "bg-teal-soft text-teal" : "bg-rose/10 text-rose"
          }`}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}

// The three new facts, read back on the card so it is obvious they were saved
// and obvious when they are missing. One line each rather than a table: they are
// short, and a table of two filled cells and four empty ones looks broken.
function ProfileLines({ person }) {
  const aids = cleanAids(person?.mobility_aids).map(aidLabel);
  const langs = (
    Array.isArray(person?.languages) ? person.languages : []
  ).filter(Boolean);
  const phone = [person?.phone_carrier, person?.phone_device]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" · ");
  const rows = [
    person?.gender
      ? ["Gender", genderLabel(normalizeGender(person.gender))]
      : null,
    phone ? ["Phone", phone] : null,
    aids.length ? ["Travels with", aids.join(", ")] : null,
    person?.accessibility_notes
      ? ["Getting around", person.accessibility_notes]
      : null,
    langs.length ? ["Speaks", langs.join(", ")] : null,
  ].filter(Boolean);
  if (!rows.length) return null;

  return (
    <dl className="mt-2.5 space-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-wrap gap-x-2">
          <dt className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {label}
          </dt>
          <dd className="min-w-0 flex-1 text-ink-soft">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PersonForm({ person, onCancel, onSave }) {
  const [form, setForm] = useState({
    name: person?.name || "",
    email: person?.email || "",
    date_of_birth: person?.date_of_birth || "",
    // One of the four the app offers, or a term of their own. Kept as two pieces
    // of state so choosing "another term" does not lose what they already typed.
    gender: GENDER_VALUES.includes(normalizeGender(person?.gender))
      ? normalizeGender(person?.gender)
      : person?.gender
        ? OWN_TERM
        : "",
    gender_own: GENDER_VALUES.includes(normalizeGender(person?.gender))
      ? ""
      : person?.gender || "",
    notes: person?.notes || "",
    phone_carrier: person?.phone_carrier || "",
    phone_device: person?.phone_device || "",
    // The stored list, kept as a list while the boxes are being ticked.
    mobility_aids: cleanAids(person?.mobility_aids),
    accessibility_notes: person?.accessibility_notes || "",
    // Typed as one line and stored as a list, so what somebody types reads back
    // the way they typed it while the record stays comparable between people.
    languages: languageField(person?.languages),
    // Their own paragraph. Kept exactly as typed, including the line breaks:
    // somebody describing themselves writes in sentences, and tidying it into one
    // line would change how it reads back to them.
    about_me: person?.about_me || "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const toggleAid = (value) =>
    setForm((prev) => ({
      ...prev,
      mobility_aids: prev.mobility_aids.includes(value)
        ? prev.mobility_aids.filter((v) => v !== value)
        : [...prev.mobility_aids, value],
    }));

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setBusy(true);
    setError("");
    const message = await onSave({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase() || null,
      date_of_birth: form.date_of_birth || null,
      // A term of their own is stored as typed. Choosing "another term" and
      // typing nothing clears the field rather than storing the placeholder.
      gender:
        form.gender === OWN_TERM
          ? normalizeGender(form.gender_own) || null
          : form.gender || null,
      notes: form.notes.trim() || null,
      phone_carrier: form.phone_carrier.trim() || null,
      phone_device: form.phone_device.trim() || null,
      // Both lists are not-null columns, so an empty one is an empty array
      // rather than a null — otherwise clearing the last box fails the write.
      mobility_aids: cleanAids(form.mobility_aids),
      accessibility_notes: form.accessibility_notes.trim() || null,
      languages: parseLanguages(form.languages),
      about_me: form.about_me.trim() || null,
    });
    setBusy(false);
    if (message) setError(message);
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
        <label className="block text-xs font-semibold">
          Gender (optional)
          <select
            className="field mt-1 text-sm"
            value={form.gender}
            onChange={set("gender")}
          >
            <option value="">Not recorded</option>
            {GENDERS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
            <option value={OWN_TERM}>Another term…</option>
          </select>
          {form.gender === OWN_TERM && (
            <input
              className="field mt-2 text-sm"
              placeholder="In their own words"
              value={form.gender_own}
              onChange={set("gender_own")}
              maxLength={40}
            />
          )}
        </label>
        <p className="text-xs text-ink-soft sm:col-span-2">
          Gender helps Aly with the ordinary things — what to pack, who shares a
          room, what a dress code means in practice. It is not what a passport
          says: travel documents carry their own sex field, printed by whoever
          issued them, and the app never fills that in from this.
        </p>
        <label className="block text-xs font-semibold sm:col-span-2">
          Email for signing in (optional)
          <input
            type="email"
            className="field mt-1 text-sm"
            placeholder="name@gmail.com"
            value={form.email}
            onChange={set("email")}
            autoComplete="off"
            inputMode="email"
          />
          <span className="mt-1 block font-normal text-ink-soft">
            Whoever owns this address can sign in with Google and edit the
            packing lists and itineraries. Their changes get recorded under
            their name.
          </span>
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

      <div className="space-y-2 border-t border-teal/30 pt-3">
        <p className="section-label">In their own words</p>
        <label className="block text-xs font-semibold">
          About me (optional)
          <textarea
            className="field mt-1 text-sm"
            rows={4}
            placeholder={ABOUT_ME_PLACEHOLDER}
            value={form.about_me}
            onChange={set("about_me")}
          />
          <span className="mt-1 block font-normal text-ink-soft">
            This is what shapes the recommendations, the pro tips and the
            suggestions Aly makes — she reads it before she answers, so the more
            it sounds like {form.name.trim() || "this person"}, the better the
            advice fits. Say what you enjoy, the pace you want, and what you
            would rather skip. You can change it any time.
          </span>
        </label>
      </div>

      <div className="space-y-3 border-t border-teal/30 pt-3">
        <p className="section-label">
          What Aly needs to make the advice specific
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold">
            Cell phone provider (optional)
            <input
              className="field mt-1 text-sm"
              placeholder="Verizon"
              value={form.phone_carrier}
              onChange={set("phone_carrier")}
              autoComplete="off"
            />
          </label>
          <label className="block text-xs font-semibold">
            Phone or device (optional)
            <input
              className="field mt-1 text-sm"
              placeholder="iPhone 15 Pro"
              value={form.phone_device}
              onChange={set("phone_device")}
              autoComplete="off"
            />
          </label>
          <p className="text-xs font-normal text-ink-soft sm:col-span-2">
            The provider decides whether a day pass, a plan add-on, or an eSIM
            is the right answer abroad, and the device decides whether an eSIM
            is possible at all.
          </p>
        </div>

        <fieldset>
          <legend className="text-xs font-semibold">
            Travels with (optional)
          </legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {MOBILITY_AIDS.map((aid) => {
              const on = form.mobility_aids.includes(aid.value);
              return (
                <button
                  key={aid.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleAid(aid.value)}
                  className={`btn px-2.5 py-1 text-xs ${
                    on ? "btn-primary" : "btn-ghost"
                  }`}
                >
                  {aid.label}
                </button>
              );
            })}
          </div>
          <label className="mt-2 block text-xs font-semibold">
            Anything else about getting around (optional)
            <textarea
              className="field mt-1 text-sm"
              rows={2}
              placeholder="Cannot manage long stairs; needs a seat near the front on tours."
              value={form.accessibility_notes}
              onChange={set("accessibility_notes")}
            />
          </label>
        </fieldset>

        <label className="block text-xs font-semibold">
          Languages spoken (optional)
          <input
            className="field mt-1 text-sm"
            placeholder="English, Spanish"
            value={form.languages}
            onChange={set("languages")}
            autoComplete="off"
          />
          <span className="mt-1 block font-normal text-ink-soft">
            Separate them with commas. Used to pick the language a tour is given
            in, and to work out which translation packs are worth downloading
            before you lose the signal.
          </span>
        </label>
      </div>
      {error && (
        <p className="rounded-lg bg-rose/10 px-3 py-2 text-xs text-rose">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          className="btn btn-primary whitespace-nowrap px-3 py-1.5 text-xs"
          disabled={busy}
        >
          Save
        </button>
        <button
          type="button"
          className="btn btn-ghost whitespace-nowrap px-3 py-1.5 text-xs"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
