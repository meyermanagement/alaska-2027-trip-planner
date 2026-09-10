"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadDocumentFile, deleteDocumentFile } from "@/lib/documents/upload";
import { ACCEPT_ATTR, refuseFile } from "@/lib/documents/kinds";
import { money } from "@/lib/budget/budget";
import { formatRange } from "@/lib/format";
import { inboxAddressFor } from "@/lib/inbox/address";
import {
  COVERS,
  POLICY_KINDS,
  coverLabel,
  coverageAgainstTrip,
  kindLabel,
  limitLines,
  policyFields,
  policyLine,
  refusePolicy,
  travelersMissingFrom,
} from "@/lib/insurance/policy";
import DocumentViewer from "./DocumentViewer";
import InboxAddressChip from "./InboxAddressChip";

const EMPTY_DRAFT = {
  kind: "trip",
  provider: "",
  plan_name: "",
  policy_number: "",
  coverage_start: "",
  coverage_end: "",
  emergency_phone: "",
  claims_phone: "",
  claims_url: "",
  covers: [],
  premium: "",
  deductible: "",
  medical_limit: "",
  evacuation_limit: "",
  notes: "",
};

function draftFrom(policy) {
  if (!policy) return { ...EMPTY_DRAFT };
  return {
    kind: policy.kind || "trip",
    provider: policy.provider || "",
    plan_name: policy.plan_name || "",
    policy_number: policy.policy_number || "",
    coverage_start: (policy.coverage_start || "").slice(0, 10),
    coverage_end: (policy.coverage_end || "").slice(0, 10),
    emergency_phone: policy.emergency_phone || "",
    claims_phone: policy.claims_phone || "",
    claims_url: policy.claims_url || "",
    covers: policy.covers || [],
    premium: policy.premium ?? "",
    deductible: policy.deductible ?? "",
    medical_limit: policy.medical_limit ?? "",
    evacuation_limit: policy.evacuation_limit ?? "",
    notes: policy.notes || "",
  };
}

/**
 * The insurance behind the Money door.
 *
 * It sits beside the budget rather than inside it because the two answer
 * different questions -- the budget asks what the trip costs, insurance asks
 * what happens when the trip goes wrong -- and because a policy is not a trip
 * cost: an annual plan is bought once and covers three trips, so charging its
 * premium to each of them would count the same money three times. The premium
 * still belongs in a budget when the family wants it there, as a trip_costs row
 * under the category that already exists for it.
 *
 * The screen does its own reading and writing rather than being threaded
 * through TripView, for the same reason the ticket strip does: a policy is
 * family-level, so the rows it needs are not the rows the trip page already
 * loaded, and the tab only mounts when somebody opens it.
 */
export default function Insurance({ trip, people = [], going = [], readOnly }) {
  const supabase = useMemo(() => createClient(), []);
  const familyId = trip?.family_id;

  const [policies, setPolicies] = useState([]);
  const [linkedIds, setLinkedIds] = useState([]);
  const [insured, setInsured] = useState([]);
  const [docs, setDocs] = useState([]);
  const [trips, setTrips] = useState([]);
  const [inboxAddress, setInboxAddress] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });

  const load = useCallback(async () => {
    if (!familyId) return;
    const [policyRows, linkRows, insuredRows, docRows, tripRows, household] =
      await Promise.all([
        supabase
          .from("insurance_policies")
          .select("*")
          .eq("family_id", familyId)
          .order("created_at", { ascending: true }),
        supabase.from("trip_insurance_policies").select("trip_id, policy_id"),
        supabase
          .from("insurance_policy_travelers")
          .select("policy_id, traveler_id"),
        supabase
          .from("insurance_documents")
          .select(
            "id, policy_id, storage_path, mime_type, size_bytes, original_filename, label, sort_order",
          )
          .eq("family_id", familyId)
          .order("sort_order", { ascending: true }),
        supabase
          .from("trips")
          .select("id, name, start_date, end_date")
          .eq("family_id", familyId)
          .order("start_date", { ascending: true }),
        supabase
          .from("families")
          .select("inbox_local_part")
          .eq("id", familyId)
          .maybeSingle(),
      ]);

    const firstError =
      policyRows.error || linkRows.error || insuredRows.error || docRows.error;
    if (firstError) {
      setError(firstError.message || "Could not read the policies.");
    } else {
      setError("");
    }
    setPolicies(policyRows.data || []);
    setLinkedIds(linkRows.data || []);
    setInsured(insuredRows.data || []);
    setDocs(docRows.data || []);
    setTrips(tripRows.data || []);
    setInboxAddress(inboxAddressFor(household.data?.inbox_local_part));
    setLoaded(true);
  }, [supabase, familyId]);

  useEffect(() => {
    load();
  }, [load]);

  const linkedHere = useMemo(
    () =>
      new Set(
        linkedIds.filter((r) => r.trip_id === trip?.id).map((r) => r.policy_id),
      ),
    [linkedIds, trip?.id],
  );

  const onTrip = policies.filter((p) => linkedHere.has(p.id));
  const elsewhere = policies.filter((p) => !linkedHere.has(p.id));

  async function save(e) {
    e.preventDefault();
    const refusal = refusePolicy(draft);
    if (refusal) {
      setError(refusal);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const fields = policyFields(draft);
      if (editingId) {
        const { error: err } = await supabase
          .from("insurance_policies")
          .update({ ...fields, updated_at: new Date().toISOString() })
          .eq("id", editingId);
        if (err) throw new Error(err.message);
      } else {
        const { data, error: err } = await supabase
          .from("insurance_policies")
          .insert({ ...fields, family_id: familyId })
          .select("id")
          .single();
        if (err) throw new Error(err.message);
        // A policy entered on a trip screen is for that trip until somebody
        // says otherwise, so the link is made here rather than left as a second
        // thing to remember.
        const { error: linkErr } = await supabase
          .from("trip_insurance_policies")
          .insert({ trip_id: trip.id, policy_id: data.id });
        if (linkErr) throw new Error(linkErr.message);
      }
      setDraft({ ...EMPTY_DRAFT });
      setAdding(false);
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err?.message || "That did not save.");
    } finally {
      setBusy(false);
    }
  }

  // tripId defaults to the trip being read, which is what the Add and Off
  // buttons mean. The chips under "Other trips it covers" pass their own id, so
  // an annual plan can be spread across the family's other trips from here
  // instead of opening each one.
  async function setLink(policyId, on, tripId = trip.id) {
    setBusy(true);
    setError("");
    try {
      if (on) {
        const { error: err } = await supabase
          .from("trip_insurance_policies")
          .insert({ trip_id: tripId, policy_id: policyId });
        if (err) throw new Error(err.message);
      } else {
        const { error: err } = await supabase
          .from("trip_insurance_policies")
          .delete()
          .eq("trip_id", tripId)
          .eq("policy_id", policyId);
        if (err) throw new Error(err.message);
      }
      await load();
    } catch (err) {
      setError(err?.message || "That did not change.");
    } finally {
      setBusy(false);
    }
  }

  async function setCovered(policyId, travelerId, on) {
    setBusy(true);
    setError("");
    try {
      if (on) {
        const { error: err } = await supabase
          .from("insurance_policy_travelers")
          .insert({ policy_id: policyId, traveler_id: travelerId });
        if (err) throw new Error(err.message);
      } else {
        const { error: err } = await supabase
          .from("insurance_policy_travelers")
          .delete()
          .eq("policy_id", policyId)
          .eq("traveler_id", travelerId);
        if (err) throw new Error(err.message);
      }
      await load();
    } catch (err) {
      setError(err?.message || "That did not change.");
    } finally {
      setBusy(false);
    }
  }

  async function removePolicy(policy) {
    if (
      !window.confirm(
        `Delete the ${policy.provider} policy? It comes off every trip it covers.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const files = docs.filter((d) => d.policy_id === policy.id);
      const { error: err } = await supabase
        .from("insurance_policies")
        .delete()
        .eq("id", policy.id);
      if (err) throw new Error(err.message);
      for (const file of files) {
        await deleteDocumentFile({
          supabase,
          storagePath: file.storage_path,
        });
      }
      await load();
    } catch (err) {
      setError(err?.message || "That did not delete.");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) {
    return (
      <p className="text-[0.86rem] text-ink-soft">Reading your policies…</p>
    );
  }

  return (
    <div className="space-y-4">
      <section className="card p-4 sm:p-5">
        <h2 className="text-base font-semibold text-ink">Insurance</h2>
        <p className="mt-1.5 text-[0.86rem] leading-relaxed text-ink-soft">
          The policy that matters when the trip goes wrong: what it pays for,
          who it names, and the number to call. Open a document once while you
          have signal and it opens again without any — the file is kept on the
          phone, so a clinic desk can be shown the plan with the wifi off.
        </p>
        {inboxAddress && (
          <InboxAddressChip
            address={inboxAddress}
            note="Or forward the policy email to"
          />
        )}
      </section>

      {error && (
        <p aria-live="polite" className="text-[0.86rem] text-rose">
          {error}
        </p>
      )}

      {onTrip.length === 0 && (
        <p className="text-[0.86rem] leading-relaxed text-ink-soft">
          No policy is on this trip yet.
        </p>
      )}

      {onTrip.map((policy) => (
        <PolicyCard
          key={policy.id}
          policy={policy}
          trip={trip}
          people={people}
          going={going}
          insuredIds={insured
            .filter((r) => r.policy_id === policy.id)
            .map((r) => r.traveler_id)}
          documents={docs.filter((d) => d.policy_id === policy.id)}
          otherTrips={trips.filter((t) => t.id !== trip.id)}
          linkedTripIds={linkedIds
            .filter((r) => r.policy_id === policy.id)
            .map((r) => r.trip_id)}
          familyId={familyId}
          readOnly={readOnly}
          busy={busy}
          onEdit={() => {
            setEditingId(policy.id);
            setAdding(false);
            setDraft(draftFrom(policy));
          }}
          onUnlink={() => setLink(policy.id, false)}
          onDelete={() => removePolicy(policy)}
          onCovered={setCovered}
          onLinkTrip={setLink}
          onDocsChanged={load}
        />
      ))}

      {!readOnly && elsewhere.length > 0 && (
        <section className="card p-4 sm:p-5">
          <h3 className="text-sm font-semibold text-ink">
            Other policies you hold
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            An annual plan is entered once and put on every trip it covers.
          </p>
          <ul className="mt-2.5 space-y-2">
            {elsewhere.map((policy) => (
              <li
                key={policy.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] px-3 py-2"
              >
                <span className="min-w-0 text-[0.86rem] text-ink">
                  {policyLine(policy)}
                  <span className="ml-2 text-xs text-ink-soft">
                    {kindLabel(policy.kind)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setLink(policy.id, true)}
                  disabled={busy}
                  className="btn btn-sm"
                >
                  Add to this trip
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!readOnly && (adding || editingId) && (
        <PolicyForm
          draft={draft}
          setDraft={setDraft}
          busy={busy}
          editing={Boolean(editingId)}
          onCancel={() => {
            setAdding(false);
            setEditingId(null);
            setDraft({ ...EMPTY_DRAFT });
            setError("");
          }}
          onSubmit={save}
        />
      )}

      {!readOnly && !adding && !editingId && (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setDraft({ ...EMPTY_DRAFT });
          }}
          className="btn btn-primary"
        >
          Add a policy
        </button>
      )}
    </div>
  );
}

function PolicyCard({
  policy,
  trip,
  people,
  going,
  insuredIds,
  documents,
  otherTrips,
  linkedTripIds,
  familyId,
  readOnly,
  busy,
  onEdit,
  onUnlink,
  onDelete,
  onCovered,
  onLinkTrip,
  onDocsChanged,
}) {
  const coverage = coverageAgainstTrip(policy, trip);
  const goingPeople = people.filter((p) => going.includes(p.id));
  const missing = travelersMissingFrom({
    insuredIds,
    goingIds: goingPeople.map((p) => p.id),
  });
  const limits = limitLines(policy);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">
            {policy.provider}
            {policy.plan_name ? ` · ${policy.plan_name}` : ""}
          </h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            {kindLabel(policy.kind)}
            {policy.policy_number ? ` · ${policy.policy_number}` : ""}
            {policy.coverage_start || policy.coverage_end
              ? ` · ${formatRange(policy.coverage_start, policy.coverage_end)}`
              : ""}
          </p>
        </div>
        {!readOnly && (
          <div className="flex shrink-0 gap-1.5">
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              className="btn btn-sm btn-ghost"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onUnlink}
              disabled={busy}
              className="btn btn-sm btn-ghost"
            >
              Off this trip
            </button>
          </div>
        )}
      </div>

      {coverage.status === "gap" && (
        <p className="mt-2.5 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs leading-relaxed text-ink">
          {coverage.note}
        </p>
      )}

      {policy.covers?.length > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {policy.covers.map((value) => (
            <li
              key={value}
              className="rounded-full bg-sand px-2.5 py-1 text-xs text-ink"
            >
              {coverLabel(value)}
            </li>
          ))}
        </ul>
      )}

      {limits.length > 0 && (
        <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-xs">
          {limits.map((row) => (
            <div key={row.label} className="flex gap-1.5">
              <dt className="text-ink-soft">{row.label}</dt>
              <dd className="font-semibold text-ink">{money(row.value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {(policy.emergency_phone || policy.claims_phone || policy.claims_url) && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {policy.emergency_phone && (
            <a
              href={`tel:${policy.emergency_phone.replace(/[^\d+]/g, "")}`}
              className="btn btn-sm"
            >
              Call emergency line
            </a>
          )}
          {policy.claims_phone && (
            <a
              href={`tel:${policy.claims_phone.replace(/[^\d+]/g, "")}`}
              className="btn btn-sm btn-ghost"
            >
              Call claims
            </a>
          )}
          {policy.claims_url && (
            <a
              href={policy.claims_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-ghost"
            >
              Claims online
            </a>
          )}
        </div>
      )}

      {policy.notes && (
        <p className="mt-2.5 whitespace-pre-line text-[0.86rem] leading-relaxed text-ink-soft">
          {policy.notes}
        </p>
      )}

      <PolicyDocuments
        policyId={policy.id}
        familyId={familyId}
        documents={documents}
        readOnly={readOnly}
        onChanged={onDocsChanged}
      />

      {goingPeople.length > 0 && (
        <div className="mt-3.5">
          <p className="text-xs font-semibold text-ink">Who it names</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {goingPeople.map((person) => {
              const on = insuredIds.includes(person.id);
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    disabled={readOnly || busy}
                    onClick={() => onCovered(policy.id, person.id, !on)}
                    aria-pressed={on}
                    className={`rounded-full px-2.5 py-1 text-xs transition ${
                      on
                        ? "border border-teal bg-teal text-on-accent"
                        : "border border-[var(--line)] text-ink-soft hover:border-teal hover:text-teal"
                    } disabled:opacity-60`}
                  >
                    {person.name}
                  </button>
                </li>
              );
            })}
          </ul>
          {insuredIds.length > 0 && missing.length > 0 && (
            <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
              {missing.length === 1
                ? `${goingPeople.find((p) => p.id === missing[0])?.name} is on this trip and not named on this policy.`
                : `${missing.length} people on this trip are not named on this policy.`}
            </p>
          )}
        </div>
      )}

      {!readOnly && otherTrips.length > 0 && (
        <div className="mt-3.5">
          <p className="text-xs font-semibold text-ink">
            Other trips it covers
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {otherTrips.map((other) => {
              const on = linkedTripIds.includes(other.id);
              return (
                <li key={other.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onLinkTrip(policy.id, !on, other.id)}
                    aria-pressed={on}
                    className={`rounded-full px-2.5 py-1 text-xs transition ${
                      on
                        ? "border border-teal bg-teal text-on-accent"
                        : "border border-[var(--line)] text-ink-soft hover:border-teal hover:text-teal"
                    } disabled:opacity-60`}
                  >
                    {other.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!readOnly && (
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="mt-3.5 text-xs font-semibold text-ink-soft hover:text-rose disabled:opacity-60"
        >
          Delete this policy
        </button>
      )}
    </section>
  );
}

/**
 * The policy paperwork, uploaded the moment it is picked.
 *
 * Same bucket as passports and tickets, which is the point: the service worker
 * already keeps anything opened from that bucket, so the file a family looks at
 * once before leaving is the file they can still open in a country where their
 * phone has no data.
 */
function PolicyDocuments({
  policyId,
  familyId,
  documents,
  readOnly,
  onChanged,
}) {
  const supabase = useMemo(() => createClient(), []);
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pickAndUpload(e) {
    setError("");
    const file = e.target.files?.[0] || null;
    if (inputRef.current) inputRef.current.value = "";
    if (!file) return;
    const refusal = refuseFile(file);
    if (refusal) {
      setError(refusal);
      return;
    }
    setBusy(true);
    let attachment = null;
    try {
      attachment = await uploadDocumentFile({
        supabase,
        scope: "insurance",
        familyId,
        ownerId: policyId,
        file,
      });
      const next = documents.length
        ? Math.max(...documents.map((d) => d.sort_order || 0)) + 1
        : 0;
      const { error: err } = await supabase.from("insurance_documents").insert({
        policy_id: policyId,
        family_id: familyId,
        storage_path: attachment.storage_path,
        mime_type: attachment.mime_type,
        size_bytes: attachment.size_bytes,
        original_filename: attachment.original_filename,
        sort_order: next,
      });
      if (err) throw new Error(err.message);
      await onChanged();
    } catch (err) {
      setError(err?.message || "That did not attach.");
      if (attachment?.storage_path) {
        await deleteDocumentFile({
          supabase,
          storagePath: attachment.storage_path,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function remove(doc) {
    if (!window.confirm(`Remove ${doc.original_filename || "this file"}?`))
      return;
    setBusy(true);
    setError("");
    try {
      const { error: err } = await supabase
        .from("insurance_documents")
        .delete()
        .eq("id", doc.id);
      if (err) throw new Error(err.message);
      await deleteDocumentFile({ supabase, storagePath: doc.storage_path });
      await onChanged();
    } catch (err) {
      setError(err?.message || "That did not remove.");
    } finally {
      setBusy(false);
    }
  }

  if (readOnly && documents.length === 0) return null;

  return (
    <div className="no-print mt-3.5 space-y-1.5">
      {documents.map((doc) => (
        <div key={doc.id} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <DocumentViewer
              storagePath={doc.storage_path}
              mimeType={doc.mime_type}
              originalFilename={doc.original_filename}
              sizeBytes={doc.size_bytes}
              label={doc.label || doc.original_filename}
            />
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(doc)}
              disabled={busy}
              className="mt-1.5 shrink-0 text-xs font-semibold text-ink-soft hover:text-rose disabled:opacity-60"
              aria-label="Remove this file"
            >
              Remove
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-teal hover:text-teal">
          <span aria-hidden="true">📎</span>
          {busy ? "Uploading…" : "Attach the policy"}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT_ATTR}
            onChange={pickAndUpload}
            disabled={busy}
            className="sr-only"
          />
        </label>
      )}
      {error && (
        <p aria-live="polite" className="text-xs text-rose">
          {error}
        </p>
      )}
    </div>
  );
}

const FIELD = "field mt-1 w-full";
const LABEL = "block text-xs font-semibold text-ink";

function PolicyForm({ draft, setDraft, busy, editing, onCancel, onSubmit }) {
  function set(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function toggleCover(value) {
    setDraft((prev) => {
      const has = (prev.covers || []).includes(value);
      return {
        ...prev,
        covers: has
          ? prev.covers.filter((v) => v !== value)
          : [...(prev.covers || []), value],
      };
    });
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-ink">
        {editing ? "Edit this policy" : "Add a policy"}
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Who it is with
          <input
            className={FIELD}
            value={draft.provider}
            onChange={(e) => set("provider", e.target.value)}
            placeholder="Allianz, Travel Guard, GeoBlue…"
          />
        </label>
        <label className={LABEL}>
          Plan name
          <input
            className={FIELD}
            value={draft.plan_name}
            onChange={(e) => set("plan_name", e.target.value)}
          />
        </label>
        <label className={LABEL}>
          Policy number
          <input
            className={FIELD}
            value={draft.policy_number}
            onChange={(e) => set("policy_number", e.target.value)}
          />
        </label>
        <label className={LABEL}>
          What kind
          <select
            className={FIELD}
            value={draft.kind}
            onChange={(e) => set("kind", e.target.value)}
          >
            {POLICY_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </label>
        <label className={LABEL}>
          Coverage starts
          <input
            type="date"
            className={FIELD}
            value={draft.coverage_start}
            onChange={(e) => set("coverage_start", e.target.value)}
          />
        </label>
        <label className={LABEL}>
          Coverage ends
          <input
            type="date"
            className={FIELD}
            value={draft.coverage_end}
            onChange={(e) => set("coverage_end", e.target.value)}
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-xs font-semibold text-ink">
          What it pays for
        </legend>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {COVERS.map((cover) => {
            const on = (draft.covers || []).includes(cover.value);
            return (
              <li key={cover.value}>
                <button
                  type="button"
                  onClick={() => toggleCover(cover.value)}
                  aria-pressed={on}
                  className={`rounded-full px-2.5 py-1 text-xs transition ${
                    on
                      ? "border border-teal bg-teal text-on-accent"
                      : "border border-[var(--line)] text-ink-soft hover:border-teal hover:text-teal"
                  }`}
                >
                  {cover.label}
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={LABEL}>
          Emergency line
          <input
            className={FIELD}
            value={draft.emergency_phone}
            onChange={(e) => set("emergency_phone", e.target.value)}
            placeholder="The number to call from a clinic"
          />
        </label>
        <label className={LABEL}>
          Claims line
          <input
            className={FIELD}
            value={draft.claims_phone}
            onChange={(e) => set("claims_phone", e.target.value)}
          />
        </label>
        <label className={LABEL}>
          Claims online
          <input
            className={FIELD}
            value={draft.claims_url}
            onChange={(e) => set("claims_url", e.target.value)}
            placeholder="https://"
          />
        </label>
        <label className={LABEL}>
          What it cost
          <input
            className={FIELD}
            value={draft.premium}
            onChange={(e) => set("premium", e.target.value)}
            placeholder="$"
          />
        </label>
        <label className={LABEL}>
          Deductible
          <input
            className={FIELD}
            value={draft.deductible}
            onChange={(e) => set("deductible", e.target.value)}
            placeholder="$"
          />
        </label>
        <label className={LABEL}>
          Medical limit
          <input
            className={FIELD}
            value={draft.medical_limit}
            onChange={(e) => set("medical_limit", e.target.value)}
            placeholder="$"
          />
        </label>
        <label className={LABEL}>
          Evacuation limit
          <input
            className={FIELD}
            value={draft.evacuation_limit}
            onChange={(e) => set("evacuation_limit", e.target.value)}
            placeholder="$"
          />
        </label>
      </div>

      <label className={LABEL}>
        Anything else worth knowing
        <textarea
          className={FIELD}
          rows={3}
          value={draft.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Exclusions, pre-existing condition waivers, what the adventure rider covers…"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? "Saving…" : editing ? "Save changes" : "Add the policy"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn btn-ghost"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
