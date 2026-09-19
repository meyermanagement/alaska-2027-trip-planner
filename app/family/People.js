"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { PassportWarningPanel } from "@/components/PassportWarning";
import MomentsEditor from "@/components/MomentsEditor";
import OptionalSection from "@/components/OptionalSection";
import useUnsavedChanges from "@/components/useUnsavedChanges";
import { FAMILY_FORM_COPY, OWN_GENDER_TERM } from "@/lib/travelers/formCopy";
import AboutSections from "@/components/AboutSections";
import DocumentPicker from "@/components/DocumentPicker";
import { AI_PROVIDER } from "@/lib/beta/agreement";
import ExtractedFieldsStrip from "@/components/ExtractedFieldsStrip";
import { readFileFields } from "@/lib/documents/read";
import DocumentViewer from "@/components/DocumentViewer";
import { uploadDocumentFile, deleteDocumentFile } from "@/lib/documents/upload";
import { headlineFor } from "@/lib/tips/warnings";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { tripPath } from "@/lib/trips/route";
import { ageToday } from "@/lib/travelers/ages";
import { isMinorTraveler } from "@/lib/beta/accountAge";
import AdultAccess from "./AdultAccess";
import { LEVELS, PRIMARY, SECONDARY } from "@/lib/travelers/access";
import {
  aboutMeFromParts,
  splitAboutMe,
  GENDERS,
  GENDER_VALUES,
  MOBILITY_AIDS,
  aidLabel,
  cleanAids,
  genderLabel,
  languageField,
  normalizeCarrier,
  normalizeGender,
  parseLanguages,
} from "@/lib/travelers/profile";

// The value the select uses for "a term of their own". Not a stored value: it
// only ever means "show the box", and what gets saved is whatever is typed in it.
const OWN_TERM = OWN_GENDER_TERM;
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
  // What Aly still does not know about each person, by traveler id, worked out
  // on the server from the same rows she reads.
  ledgers = {},
  // The screen around this component owns which person is open and whether the
  // add form is up: the band of chips at the top of the page points at people and
  // animals alike, so it cannot live inside either list.
  only = null,
  picker = null,
  // The household's coordinates, handed down to the About-you questions inside
  // the person editor so the sports drawer offers this family's local teams.
  homeLat = null,
  homeLon = null,
  addOpen = false,
  onAddDone = null,
  onMomentStateChange,
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  // Worked out once per render rather than per person, and on the client's own
  // clock, which is the one whose today the reader means.
  const todayISO = useMemo(() => new Date().toLocaleDateString("en-CA"), []);

  const [addingFor, setAddingFor] = useState(null); // traveler id
  const [editingDoc, setEditingDoc] = useState(null); // document id
  const [editingPerson, setEditingPerson] = useState(null); // traveler id
  const [momentState, setMomentState] = useState({ dirty: false, busy: false });
  useEffect(() => {
    onMomentStateChange?.(momentState);
  }, [momentState, onMomentStateChange]);
  useEffect(() => {
    setMomentState({ dirty: false, busy: false });
  }, [editingPerson, only]);

  // If Preferences (or anywhere else) links here with ?edit=<traveler id>, open
  // that person's editor and scroll to it. Once opened the query string is
  // cleared so a refresh does not reopen the form, and does not fight a person
  // who deliberately closes it. Only fires when the id is actually somebody in
  // this household -- an unknown id is treated as no param at all.
  const searchParams = useSearchParams();
  const wantEditId = searchParams?.get("edit") || null;
  useEffect(() => {
    if (!wantEditId) return;
    const hit = (travelers || []).some((t) => t.id === wantEditId);
    if (!hit) return;
    setEditingPerson(wantEditId);
    // Give the row a moment to expand before scrolling to it.
    const timer = window.setTimeout(() => {
      const el = document.getElementById(`person-${wantEditId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    // Drop the query string so a refresh does not reopen.
    router.replace("/family", { scroll: false });
    return () => window.clearTimeout(timer);
  }, [wantEditId, travelers, router]);
  const [addingPersonInner, setAddingPerson] = useState(false);
  const controlled = picker !== null;
  const addingPerson = controlled ? addOpen : addingPersonInner;
  const closeAdd = () => (onAddDone ? onAddDone() : setAddingPerson(false));
  // Which cards are drawn. `only` is a traveler id when one person is open, and
  // an empty string when the band is pointing somewhere else entirely -- at an
  // animal, or at the add form.
  const shown = controlled ? travelers.filter((t) => t.id === only) : travelers;
  const [revealed, setRevealed] = useState({});
  // Which person's trips are being shown. A card, not an editor: who is on a
  // trip is decided on the trip, so these rows only ever read out and link.
  const [showingTripsFor, setShowingTripsFor] = useState(null);
  const [inviteBusy, setInviteBusy] = useState(null);
  const [inviteNote, setInviteNote] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(null);
  const [removeNote, setRemoveNote] = useState(null);
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
  const roster = rosters;

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
    // The form gives us three groups of things at once: the plain columns to
    // write on the row (values), a chosen file that has to reach storage first,
    // and a flag saying "and get rid of the old attachment". Splitting them
    // here keeps the row writer unaware of storage.
    const {
      __file: file,
      __clearExisting: clearExisting,
      ...rowValues
    } = values || {};

    const previous = docId
      ? docsFor(travelerId).find((d) => d.id === docId)
      : null;
    const previousPath = previous?.storage_path || null;

    let attachment = null;
    if (file) {
      try {
        attachment = await uploadDocumentFile({
          supabase,
          scope: "personal",
          familyId,
          ownerId: travelerId,
          file,
        });
      } catch (err) {
        return err?.message || "That file did not upload.";
      }
    }

    const rowPatch = { ...rowValues };
    if (attachment) {
      rowPatch.storage_path = attachment.storage_path;
      rowPatch.mime_type = attachment.mime_type;
      rowPatch.size_bytes = attachment.size_bytes;
      rowPatch.original_filename = attachment.original_filename;
      rowPatch.file_uploaded_at = new Date().toISOString();
    } else if (clearExisting) {
      rowPatch.storage_path = null;
      rowPatch.mime_type = null;
      rowPatch.size_bytes = null;
      rowPatch.original_filename = null;
      rowPatch.file_uploaded_at = null;
    }

    let error = null;
    if (docId) {
      ({ error } = await supabase
        .from("traveler_documents")
        .update(rowPatch)
        .eq("id", docId));
    } else {
      const mine = docsFor(travelerId);
      const next = mine.length
        ? Math.max(...mine.map((d) => d.sort_order || 0)) + 1
        : 0;
      ({ error } = await supabase
        .from("traveler_documents")
        .insert({ ...rowPatch, traveler_id: travelerId, sort_order: next }));
    }

    if (error) {
      // A row that failed to write must not leave an orphan file behind, or
      // the drawer fills up with uploads nobody can find.
      if (attachment) {
        await deleteDocumentFile({
          supabase,
          storagePath: attachment.storage_path,
        });
      }
      return error.message || "That did not save.";
    }

    // The row now points at the new file, so the old one can go. Same reasoning
    // for a clear: the row no longer references it.
    if (previousPath && (attachment || clearExisting)) {
      await deleteDocumentFile({ supabase, storagePath: previousPath });
    }

    setAddingFor(null);
    setEditingDoc(null);
    router.refresh();
    return null;
  }

  async function removeDoc(doc) {
    const label = doc.label || docType(doc.doc_type).label;
    if (!window.confirm(`Delete ${label}?`)) return;
    // The row goes first so a family member cannot see the reference after
    // storage has removed the file. If deleting the file fails afterwards, the
    // orphan is invisible from the app and only a bucket sweep would notice.
    await supabase.from("traveler_documents").delete().eq("id", doc.id);
    if (doc.storage_path) {
      await deleteDocumentFile({ supabase, storagePath: doc.storage_path });
    }
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
            : `Sent to ${data.to} — ${data.count} ${data.count === 1 ? "task" : "tasks"} due today or tomorrow.`
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

  // Takes somebody's access away and leaves their seat behind.
  //
  // The household keeps the person: their packing, their tasks and their share
  // of the itinerary all stay, and the seat goes back to being unclaimed so it
  // can be handed to the right address later. What goes is the ability to sign
  // in to this household and open anything in it.
  async function removeMember(person) {
    setRemoveBusy(person.id);
    setRemoveNote(null);
    try {
      const res = await fetch("/api/people/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traveler_id: person.id }),
      });
      const data = await res.json().catch(() => ({}));
      setRemoveNote({
        id: person.id,
        ok: res.ok,
        text: res.ok
          ? data?.wasSignedIn
            ? `${person.name} can no longer sign in to this household. Their seat is still here.`
            : `The invitation for ${person.name} has been cancelled.`
          : data?.error || "That could not be done.",
      });
      if (res.ok) router.refresh();
    } catch {
      setRemoveNote({
        id: person.id,
        ok: false,
        text: "That could not be done.",
      });
    } finally {
      setRemoveBusy(null);
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

      <div className="rounded-xl border border-teal/25 bg-teal-soft/25 p-3 text-sm text-ink">
        <p>
          <span className="font-semibold">
            Snap passports, licenses and IDs with the phone.
          </span>{" "}
          Aly reads the number and expiry off the scan so you do not have to
          type them — that sends the file to {AI_PROVIDER}, and only while you
          have document reading on — and the file stays in your household's
          private storage, where Aly watches the expiry date for you.
        </p>
      </div>

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
          <section
            key={person.id}
            id={`person-${person.id}`}
            className="card scroll-mt-4 p-5"
          >
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
                  disabled={momentState.busy}
                  onClick={() => {
                    if (
                      momentState.dirty &&
                      !window.confirm(
                        "Close without saving your changes? Anything already saved will be kept.",
                      )
                    )
                      return;
                    setEditingPerson(
                      editingPerson === person.id ? null : person.id,
                    );
                  }}
                >
                  Edit details
                </button>
                {trips.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost whitespace-nowrap px-3 py-1.5 text-xs"
                    onClick={() =>
                      setShowingTripsFor(
                        showingTripsFor === person.id ? null : person.id,
                      )
                    }
                  >
                    {showingTripsFor === person.id
                      ? "Hide trips"
                      : "Their trips"}
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
                onMomentStateChange={setMomentState}
                person={person}
                homeLat={homeLat}
                homeLon={homeLon}
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

            {showingTripsFor === person.id && (
              <div className="no-print mt-3 space-y-3 rounded-xl border border-[var(--line)] bg-sand/40 p-3">
                {(() => {
                  const mine = new Set(tripIdsFor(person.id));
                  const groups = [
                    ["Coming up", upcomingTrips],
                    ["Still just an idea", draftTrips],
                    ["Already done", pastTrips],
                  ]
                    .map(([heading, list]) => [
                      heading,
                      list.filter((trip) => mine.has(trip.id)),
                    ])
                    .filter(([, list]) => list.length > 0);
                  if (groups.length === 0) {
                    return (
                      <p className="text-xs text-ink-soft">
                        {person.name} is not on any trip yet. Open the trip and
                        add them under Who is going, and their packing list
                        follows.
                      </p>
                    );
                  }
                  return (
                    <>
                      {/* Read out, never set. Who is going is a fact about the
                          trip, not about the person: it decides that trip's
                          packing list, its budget split and who its reminders
                          are addressed to, so it is decided in one place, on the
                          trip, and every other screen links there. */}
                      <p className="text-xs text-ink-soft">
                        Whether {person.name} is going is set on the trip
                        itself, under Who is going.
                      </p>
                      {groups.map(([heading, list]) => (
                        <div key={heading}>
                          <p className="section-label">{heading}</p>
                          <ul className="mt-1 divide-y divide-sand-deep overflow-hidden rounded-xl border border-[var(--line)] bg-white">
                            {list.map((trip) => (
                              <li key={trip.id}>
                                <Link
                                  href={tripPath(trip)}
                                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-sand/60"
                                >
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
                                  <span
                                    aria-hidden="true"
                                    className="shrink-0 text-ink-soft"
                                  >
                                    &rsaquo;
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </>
                  );
                })()}
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

            {/* About me sits below the profile lines because the profile lines
                are the facts and this is the voice. Written or blank, it is
                the same box: when it is written it wears the person's own
                paragraph, and when it is blank it says so out loud and hands
                back the one control that fills it. It used to hide itself
                when nothing had been written, which meant a family with
                nobody's paragraph on file saw no reason to write one -- the
                gap was invisible. Now the gap is the loudest thing on the
                card, because it is the one gap Aly can most feel. */}
            {editingPerson !== person.id &&
              (person.about_me ? (
                <div className="mt-3 rounded-xl border-2 border-teal/40 bg-teal/5 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal">
                    In {person.name || "their"}
                    {person.name ? "'s" : ""} own words
                  </p>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink">
                    {person.about_me}
                  </p>
                </div>
              ) : (
                <MissingAboutMe
                  person={person}
                  isMe={
                    person.user_id === userId ||
                    (!!person.email &&
                      !!userEmail &&
                      person.email.toLowerCase() === userEmail.toLowerCase())
                  }
                  onEdit={() => setEditingPerson(person.id)}
                />
              ))}

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
              <RemoveMemberRow
                person={person}
                isMe={
                  person.user_id === userId ||
                  (!!person.email &&
                    !!userEmail &&
                    person.email.toLowerCase() === userEmail.toLowerCase())
                }
                busy={removeBusy === person.id}
                note={removeNote?.id === person.id ? removeNote : null}
                onRemove={() => removeMember(person)}
              />
            )}

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
                <div className="rounded-xl border border-dashed border-teal/30 bg-teal-soft/20 p-3">
                  <p className="text-sm text-ink">
                    <span className="font-semibold">
                      Nothing saved for {person.name} yet.
                    </span>{" "}
                    Snap {person.name === "You" ? "your" : `${person.name}'s`}{" "}
                    passport, license or ID with the phone camera and Add
                    document. Aly reads the number and expiry off the scan so
                    you do not have to type them, which sends the file to{" "}
                    {AI_PROVIDER} while document reading is on, and the file
                    itself is kept in your household's private storage, with the
                    expiry date watched for you.
                  </p>
                </div>
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
          <h2 className="font-display text-lg font-semibold">Add a person</h2>
          <PersonForm
            onMomentStateChange={setMomentState}
            homeLat={homeLat}
            homeLon={homeLon}
            onCancel={closeAdd}
            onSave={async (values) => {
              const out = await savePerson(null, values);
              if (controlled && !out) closeAdd();
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
            Add a person
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
          {doc.storage_path && (
            <div className="no-print mt-2">
              <DocumentViewer
                storagePath={doc.storage_path}
                mimeType={doc.mime_type}
                originalFilename={doc.original_filename}
                sizeBytes={doc.size_bytes}
                compact
                label="Open scan"
              />
            </div>
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

export function DocForm({ doc, onCancel, onSave }) {
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
  const [error, setError] = useState("");
  // The picker reports back a chosen File plus an intent to clear the stored
  // one; DocForm holds both here and hands them to the row writer under keys
  // it recognizes but the database column list does not.
  const [attach, setAttach] = useState({ file: null, clearExisting: false });
  // What Aly read from the scan, and where in the read that got to. The status
  // machine is: idle -> reading -> ready | error. "ready" holds the parsed
  // fields; the strip renders itself from these two values and does not
  // remember its own state.
  const [extract, setExtract] = useState({
    status: "idle",
    fields: null,
    error: "",
  });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  // When the person picks a new file, kick off a read against Gemini right
  // then. The bytes are already in the browser, so this does not need Storage
  // and does not wait for the save. If the person swaps files, the strip
  // starts over.
  //
  // A tiny AbortController-like guard: track the token of the read we started
  // and only accept the answer that matches the current one, so a slow first
  // read cannot overwrite a fresh second one.
  const readTokenRef = useRef(0);
  function handlePickerChange(next) {
    setAttach(next);
    const token = ++readTokenRef.current;
    if (!next.file) {
      setExtract({ status: "idle", fields: null, error: "" });
      return;
    }
    setExtract({ status: "reading", fields: null, error: "" });
    readFileFields(next.file).then(
      (fields) => {
        if (readTokenRef.current !== token) return;
        setExtract({ status: "ready", fields, error: "" });
      },
      (err) => {
        if (readTokenRef.current !== token) return;
        setExtract({
          status: "error",
          fields: null,
          error: err?.message || "",
        });
      },
    );
  }

  function applyOne(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }
  function applyAll(rows) {
    setForm((prev) => {
      const next = { ...prev };
      for (const row of rows) next[row.key] = row.read;
      return next;
    });
  }
  function dismissExtract() {
    setExtract({ status: "idle", fields: null, error: "" });
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const message = await onSave({
        doc_type: form.doc_type,
        label: form.label.trim() || null,
        number: form.number.trim() || null,
        issuing_authority: form.issuing_authority.trim() || null,
        issue_date: form.issue_date || null,
        expiration_date: form.expiration_date || null,
        notes: form.notes.trim() || null,
        ...(doc ? { updated_at: new Date().toISOString() } : {}),
        __file: attach.file,
        __clearExisting: attach.clearExisting,
      });
      if (message) setError(message);
    } catch {
      setError(
        "This document could not be saved. Your changes are still here. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="no-print mt-3 space-y-3 rounded-xl border border-teal/30 bg-teal-soft/40 p-3"
    >
      <fieldset disabled={busy} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold">
            Document type
            <select
              className="field mt-1 text-base"
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
            Name or nickname (optional)
            <input
              className="field mt-1 text-base"
              placeholder="United MileagePlus, Missouri license…"
              value={form.label}
              onChange={set("label")}
            />
          </label>
          <label className="block text-xs font-semibold sm:col-span-2">
            Document or membership number (optional)
            <input
              className="field mt-1 font-mono text-base"
              autoComplete="off"
              value={form.number}
              onChange={set("number")}
            />
          </label>
          <label className="block text-xs font-semibold">
            Issued by (optional)
            <input
              className="field mt-1 text-base"
              placeholder="United States, Missouri, CBP…"
              value={form.issuing_authority}
              onChange={set("issuing_authority")}
            />
          </label>
          <label className="block text-xs font-semibold">
            Issued on (optional)
            <input
              type="date"
              className="field mt-1 text-base"
              value={form.issue_date}
              onChange={set("issue_date")}
            />
          </label>
          <label className="block text-xs font-semibold">
            Expires (optional)
            <input
              type="date"
              className="field mt-1 text-base"
              value={form.expiration_date}
              onChange={set("expiration_date")}
            />
          </label>
          <label className="block text-xs font-semibold sm:col-span-2">
            Notes (optional)
            <textarea
              className="field mt-1 text-base"
              rows={2}
              placeholder="Where the physical copy lives, renewal appointment, anything else."
              value={form.notes}
              onChange={set("notes")}
            />
          </label>
        </div>
        <div className="space-y-2 rounded-xl border border-teal/20 bg-white/40 p-3">
          <DocumentPicker
            existing={
              doc?.storage_path
                ? {
                    storage_path: doc.storage_path,
                    mime_type: doc.mime_type,
                    size_bytes: doc.size_bytes,
                    original_filename: doc.original_filename,
                  }
                : null
            }
            onChange={handlePickerChange}
            label="Attach a scan or photo (optional)"
          />
          <ExtractedFieldsStrip
            status={extract.status}
            fields={extract.fields}
            error={extract.error}
            form={form}
            onApply={applyOne}
            onApplyAll={applyAll}
            onDismiss={dismissExtract}
          />
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-xs text-rose">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          className="btn btn-primary whitespace-nowrap px-3 py-1.5 text-xs"
          disabled={busy}
        >
          {busy
            ? attach.file
              ? "Uploading…"
              : "Saving…"
            : doc
              ? "Save changes"
              : "Save document"}
        </button>
        <button
          type="button"
          className="btn btn-ghost whitespace-nowrap px-3 py-1.5 text-xs"
          disabled={busy}
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
/**
 * Taking somebody's access away.
 *
 * Only drawn for a person who has access to take away -- a claimed seat, or an
 * invitation still outstanding -- and never for yourself, because the way you
 * leave your own household is to delete your account in Settings. It asks
 * first, in the words of what actually happens: the person stays on the trip,
 * the sign-in stops.
 */
export function RemoveMemberRow({ person, isMe, busy, note, onRemove }) {
  const [asking, setAsking] = useState(false);
  const signedIn = !!person.user_id;
  const invited = !signedIn && !!person.invited_at;

  if (isMe || (!signedIn && !invited)) return null;

  return (
    <div className="no-print mt-2.5 border-t border-[var(--line)] pt-2.5">
      <p className="section-label">Sign-in access</p>

      {asking ? (
        <div className="mt-2 rounded-lg border border-rose/40 bg-rose/10 p-2.5">
          <p className="text-xs leading-relaxed text-ink">
            {signedIn ? (
              <>
                Remove {person.name}&rsquo;s access? They will not be able to
                sign in to this household again, open its trips, or open any
                document in it, and any reminders going to their phone stop.{" "}
                <span className="font-semibold">
                  {person.name} stays on your trips
                </span>{" "}
                &mdash; the packing, the tasks and the itinerary are untouched,
                and you can invite them back later.
              </>
            ) : (
              <>
                Cancel the invitation for {person.name}? The sign-in email
                already sent will stop working, and nothing else about them
                changes.
              </>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary px-3 py-1 text-xs"
              disabled={busy}
              onClick={() => {
                setAsking(false);
                onRemove();
              }}
            >
              {busy
                ? "Removing…"
                : signedIn
                  ? "Yes, remove their access"
                  : "Yes, cancel the invitation"}
            </button>
            <button
              type="button"
              className="btn btn-ghost px-3 py-1 text-xs"
              onClick={() => setAsking(false)}
            >
              {signedIn ? "Keep their access" : "Keep invitation"}
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            type="button"
            className="btn btn-ghost px-3 py-1 text-xs"
            disabled={busy}
            onClick={() => setAsking(true)}
          >
            {signedIn ? "Remove sign-in access" : "Cancel the invitation"}
          </button>
          <p className="text-xs leading-relaxed text-ink-soft">
            {signedIn
              ? "Stops them signing in. Keeps them on the trip."
              : "Stops the sign-in email that was sent working."}
          </p>
        </div>
      )}

      {note && (
        <p
          className={`mt-1.5 text-xs font-semibold ${
            note.ok ? "text-teal" : "text-rose"
          }`}
        >
          {note.text}
        </p>
      )}
    </div>
  );
}

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

  if (isMinorTraveler(person)) return <div className="mt-3 rounded-xl border border-line bg-sand/40 p-3">
    <p className="section-label">Parent-managed trip view</p>
    <p className="mt-1 text-sm text-ink-soft">No independent sign-in. Itinerary and own packing, view only.</p>
    <a className="btn btn-secondary mt-3" href={`/family/child-access?traveler=${encodeURIComponent(person.id)}`}>
      Open {person.name}’s trip view
    </a>
  </div>;

  if (!isMe && person.adult_access_state && !["active", "underage"].includes(person.adult_access_state)) {
    return <AdultAccess person={person} state={person.adult_access_state} />;
  }

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
                  ? " · account connected; can check off their own things"
                  : " · account connected; can make changes"}
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
              Add an email if {person.name} needs their own sign-in access.
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
              {busy ? "Sending…" : "Email me a sign-in link"}
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
                    ? "Resend sign-in email"
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
              Email due-date reminders to{" "}
              {isMe ? "me" : person.name.split(" ")[0]}
              <span className="block text-xs">
                Morning reminders for {isMe ? "your" : "their"} assigned tasks
                due today or tomorrow.
              </span>
            </span>
          </label>

          {isMe && person.wants_reminders !== false && (
            <button
              type="button"
              onClick={onSendMine}
              disabled={remindBusy}
              className="no-print btn btn-ghost shrink-0 px-3 py-1.5 text-xs"
            >
              {remindBusy ? "Sending…" : "Send my reminders now"}
            </button>
          )}
        </div>
      )}

      {note && (
        <p
          role={note.ok ? "status" : "alert"}
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

// An optional invitation, not a warning about an incomplete profile.
function MissingAboutMe({ person, isMe, onEdit }) {
  const name = (person?.name || "").trim();
  const possessive = name ? `${name}'s` : "their";
  const subject = name || "this person";

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] bg-sand/40 p-3">
      <p className="section-label">About {isMe ? "you" : subject} (optional)</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        Share what {isMe ? "you enjoy" : `${subject} enjoys`} and would rather
        skip to help Aly personalize suggestions. You can add this later.
      </p>
      {isMe ? (
        <Link
          href="/about-you"
          className="btn btn-primary no-print mt-2.5 inline-flex text-xs"
        >
          Tell Aly about you
        </Link>
      ) : (
        <button
          type="button"
          className="btn btn-primary no-print mt-2.5 text-xs"
          onClick={onEdit}
        >
          Add {possessive} preferences
        </button>
      )}
    </div>
  );
}

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
    aids.length ? ["Equipment and support", aids.join(", ")] : null,
    person?.accessibility_notes
      ? ["Accessibility and support", person.accessibility_notes]
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

export function PersonForm({
  person,
  onCancel,
  onSave,
  homeLat,
  homeLon,
  onMomentStateChange,
}) {
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
  });
  // Their own paragraph, held as the five boxes it was written in rather than as
  // one field. The same questions the About-you screen asks, so the person who
  // fills this in on somebody else's behalf is answering what that person would
  // have been asked themselves. Loaded back out of the stored paragraph, and
  // stitched back into one on save.
  const [aboutParts, setAboutParts] = useState(() =>
    splitAboutMe(person?.about_me || ""),
  );
  const initialDraft = useRef(JSON.stringify({ form, aboutParts }));
  const dirty = JSON.stringify({ form, aboutParts }) !== initialDraft.current;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [momentState, setMomentState] = useState({ dirty: false, busy: false });
  useUnsavedChanges(dirty || momentState.dirty);
  useEffect(() => {
    onMomentStateChange?.({ dirty: dirty || momentState.dirty, busy: busy || momentState.busy });
  }, [dirty, busy, momentState, onMomentStateChange]);
  useEffect(() => () => onMomentStateChange?.({ dirty: false, busy: false }), [onMomentStateChange]);
  const canLeaveMoments = () =>
    !momentState.dirty ||
    window.confirm(
      "Leave your unfinished moment unsaved? Moments you already saved will be kept.",
    );
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
    if (busy || momentState.busy) return;
    if (!form.name.trim()) {
      setError("Enter this person's name.");
      return;
    }
    if (!canLeaveMoments()) return;
    setBusy(true);
    setError("");
    let message;
    try {
      message = await onSave({
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
        // One spelling per provider, so the roaming rule counts two people on
        // T-Mobile as one carrier however each of them typed it.
        phone_carrier: normalizeCarrier(form.phone_carrier),
        phone_device: form.phone_device.trim() || null,
        // Both lists are not-null columns, so an empty one is an empty array
        // rather than a null — otherwise clearing the last box fails the write.
        mobility_aids: cleanAids(form.mobility_aids),
        accessibility_notes: form.accessibility_notes.trim() || null,
        languages: parseLanguages(form.languages),
        about_me: aboutMeFromParts(aboutParts) || null,
      });
    } catch {
      message =
        "This person could not be saved. Your changes are still here. Try again.";
    } finally {
      setBusy(false);
    }
    if (message) {
      setError(message);
      return;
    }
    initialDraft.current = JSON.stringify({ form, aboutParts });
    // The paragraph is also what Aly's interview priors are extracted from, and
    // that extraction needs a server with the model key on it. The row write
    // above already stored the words; this asks the About-you route to read them
    // again and refresh the priors, so editing somebody's paragraph here does
    // not leave Aly holding the answers implied by the paragraph it replaced.
    // Best-effort on purpose: the words are saved either way.
    const paragraph = aboutMeFromParts(aboutParts);
    if (person?.id && paragraph !== String(person?.about_me || "").trim()) {
      try {
        await fetch("/api/about-you/save", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ traveler_id: person.id, paragraph }),
        });
      } catch {
        // The paragraph is stored. Stale priors are not worth an error here.
      }
    }
  }

  return (
    <form
      onSubmit={submit}
      className="no-print mt-3 space-y-3 rounded-xl border border-teal/30 bg-teal-soft/40 p-3"
    >
      <fieldset disabled={busy} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold">
            Their name (required)
            <input
              required
              maxLength={60}
              className="field mt-1 text-base"
              value={form.name}
              onChange={set("name")}
            />
          </label>
          <label className="block text-xs font-semibold">
            Date of birth (optional)
            <input
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              className="field mt-1 text-base"
              value={form.date_of_birth}
              onChange={set("date_of_birth")}
            />
          </label>
          <label className="block text-xs font-semibold">
            Gender (optional)
            <select
              className="field mt-1 text-base"
              value={form.gender}
              onChange={set("gender")}
            >
              <option value="">Leave blank</option>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
              <option value={OWN_TERM}>Another term…</option>
            </select>
            {form.gender === OWN_TERM && (
              <input
                className="field mt-2 text-base"
                placeholder="In their own words"
                aria-label="Gender in their own words"
                value={form.gender_own}
                onChange={set("gender_own")}
                maxLength={40}
              />
            )}
          </label>
          <p className="text-xs text-ink-soft sm:col-span-2">
            {FAMILY_FORM_COPY.genderHelp}
          </p>
          <label className="block text-xs font-semibold sm:col-span-2">
            Email for signing in (optional)
            <input
              type="email"
              className="field mt-1 text-base"
              placeholder="name@gmail.com"
              value={form.email}
              onChange={set("email")}
              autoComplete="off"
              inputMode="email"
            />
            <span className="mt-1 block font-normal text-ink-soft">
              Use this person&apos;s Google sign-in address. Their access level
              controls what they can change. Saving an address does not send an
              invitation.
            </span>
          </label>
          <label className="block text-xs font-semibold sm:col-span-2">
            Booking notes (optional)
            <textarea
              className="family-booking-notes field mt-1 text-base"
              rows={2}
              placeholder="Notes to use when booking."
              value={form.notes}
              onChange={set("notes")}
            />
          </label>
        </div>

        <OptionalSection title="About you">
          <p className="text-xs text-ink-soft">
            Answer for {form.name.trim() || "this person"}, using their own
            words where possible. Every question is optional.
          </p>
          <AboutSections
            parts={aboutParts}
            setParts={setAboutParts}
            homeLat={homeLat}
            homeLon={homeLon}
            idPrefix={`person-about-${person?.id || "new"}`}
            className="mt-1"
          />
        </OptionalSection>

        {person?.id && (
          <OptionalSection title="Favorite moments">
            <MomentsEditor
              key={person.id}
              travelerId={person.id}
              travelerName={form.name.trim() || person.name}
              onStateChange={setMomentState}
              disabled={busy}
            />
          </OptionalSection>
        )}

        <OptionalSection title="Travel details">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold">
              Mobile provider (optional)
              <input
                className="field mt-1 text-base"
                placeholder="Verizon"
                value={form.phone_carrier}
                onChange={set("phone_carrier")}
                autoComplete="off"
              />
            </label>
            <label className="block text-xs font-semibold">
              Phone model (optional)
              <input
                className="field mt-1 text-base"
                placeholder="iPhone 15 Pro"
                value={form.phone_device}
                onChange={set("phone_device")}
                autoComplete="off"
              />
            </label>
            <p className="text-xs font-normal text-ink-soft sm:col-span-2">
              Helps Aly compare roaming options. Confirm plan coverage and
              device compatibility before buying.
            </p>
          </div>

        </OptionalSection>
        <OptionalSection title="Travel needs">
          <fieldset>
            <legend className="text-xs font-semibold">
              Travel equipment and support (optional)
            </legend>
            <p className="mt-1 text-xs text-ink-soft">
              Select all that apply. Add any other needs below.
            </p>
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
              Accessibility or support needs (optional)
              <textarea
                className="field mt-1 text-base"
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
              className="field mt-1 text-base"
              placeholder="English, Spanish"
              value={form.languages}
              onChange={set("languages")}
              autoComplete="off"
            />
            <span className="mt-1 block font-normal text-ink-soft">
              Separate languages with commas. Helps Aly suggest suitable tours
              and language support.
            </span>
          </label>
        </OptionalSection>
      </fieldset>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-rose/10 px-3 py-2 text-xs text-rose"
        >
          {error}
        </p>
      )}
      <div className="editing-footer">
        <span className="mr-auto text-xs text-ink-soft" role="status">
          {busy || momentState.busy ? "Saving changes…" : dirty ? "Unsaved changes" : momentState.dirty ? "Unfinished favorite moment" : "No unsaved changes"}
        </span>
        <button
          className="btn btn-primary whitespace-nowrap px-3 py-1.5 text-xs"
          disabled={busy || momentState.busy}
        >
          {busy ? "Saving…" : "Save person"}
        </button>
        <button
          type="button"
          className="btn btn-ghost whitespace-nowrap px-3 py-1.5 text-xs"
          disabled={busy || momentState.busy}
          onClick={() => {
            if ((!dirty && !momentState.dirty) || window.confirm("Discard your unsaved changes? Anything already saved will be kept.")) onCancel();
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
