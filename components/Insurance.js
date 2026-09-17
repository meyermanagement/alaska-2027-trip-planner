"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { uploadDocumentFile, deleteDocumentFile } from "@/lib/documents/upload";
import { ACCEPT_ATTR, refuseFile } from "@/lib/documents/kinds";
import { money } from "@/lib/budget/budget";
import { formatRange } from "@/lib/format";
import { inboxAddressFor } from "@/lib/inbox/address";
import {
  CARD_CONDITION,
  COVERS,
  POLICY_KINDS,
  coverLabel,
  coverageAgainstTrip,
  isCardPolicy,
  kindLabel,
  limitLines,
  normalizeCovers,
  policyFields,
  policyLine,
  refusePolicy,
  travelersMissingFrom,
} from "@/lib/insurance/policy";
import { describeInsured } from "@/lib/insurance/insured";
import { readFileFields } from "@/lib/documents/read";
import DocumentViewer from "./DocumentViewer";
import ExtractedFieldsStrip, { POLICY_SPEC } from "./ExtractedFieldsStrip";
import InboxAddressChip from "./InboxAddressChip";

const EMPTY_DRAFT = {
  kind: "trip",
  rewards_program_id: "",
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
    rewards_program_id: policy.rewards_program_id || "",
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
  const [programs, setPrograms] = useState([]);
  const [inboxAddress, setInboxAddress] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });

  // What Aly read off an uploaded certificate, the file itself, and who the
  // certificate names. All three are held here rather than in the form, because
  // the form only edits a draft and these three are things that happen on save:
  // the fields are already in the draft, the file becomes an attachment, and the
  // names become traveler links -- none of which exist until there is a policy
  // row to hang them on.
  const [extract, setExtract] = useState({
    status: "idle",
    fields: null,
    error: "",
  });
  const [pendingFile, setPendingFile] = useState(null);
  const [insuredRead, setInsuredRead] = useState(null);
  const readTokenRef = useRef(0);

  const load = useCallback(async () => {
    if (!familyId) return;
    const [
      policyRows,
      linkRows,
      insuredRows,
      docRows,
      tripRows,
      programRows,
      household,
    ] = await Promise.all([
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
      // The wallet, so coverage that comes with a card can name the card it
      // comes with rather than repeating its name as free text.
      supabase
        .from("rewards_programs")
        .select("id, brand, program_name, kind")
        .eq("family_id", familyId)
        .order("brand", { ascending: true }),
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
    setPrograms(programRows.data || []);
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

  // Reading is not saving. The certificate goes to the model, the fields come
  // back into the strip above the form, and nothing is written until the person
  // presses the form's own save button -- the same bargain the passport form on
  // the People tab makes, because an evacuation limit read off page nineteen of
  // a PDF is exactly the kind of number worth glancing at before it is stored.
  function readPolicyFile(file) {
    if (!file) return;
    const refusal = refuseFile(file);
    if (refusal) {
      setExtract({ status: "error", fields: null, error: refusal });
      return;
    }
    setPendingFile(file);
    setInsuredRead(null);
    const token = readTokenRef.current + 1;
    readTokenRef.current = token;
    setExtract({ status: "reading", fields: null, error: "" });
    readFileFields(file, { kind: "policy" }).then(
      (fields) => {
        if (readTokenRef.current !== token) return;
        // The benefits are canonicalized here, at the edge, rather than at save.
        // A certificate that says "trip_cancellation" used to reach the strip in
        // the insurer's words, show as a row worth keeping, and then fail to tick
        // the chip it meant -- so the strip said "already set" beside a benefit
        // the form was not carrying. One vocabulary from here on.
        setExtract({
          status: "ready",
          fields: { ...fields, covers: normalizeCovers(fields?.covers) },
          error: "",
        });
        setInsuredRead(describeInsured(fields.insured_names, people));
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

  function applyRead(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }
  function applyAllRead(rows) {
    setDraft((prev) => {
      const next = { ...prev };
      for (const row of rows) next[row.key] = row.read;
      return next;
    });
  }
  // Dismissing the strip puts the reading away, not the file. Somebody who has
  // taken the fields they wanted still means to keep the certificate.
  function dismissRead() {
    readTokenRef.current += 1;
    setExtract({ status: "idle", fields: null, error: "" });
  }
  function forgetRead() {
    readTokenRef.current += 1;
    setExtract({ status: "idle", fields: null, error: "" });
    setPendingFile(null);
    setInsuredRead(null);
  }

  // The certificate that was read, filed under the policy it was read into, so
  // the family can open it at a clinic desk. Failures here are reported and do
  // not undo the policy: a saved policy with no attachment is a smaller problem
  // than a save that appears to have failed after it worked.
  async function attachPendingFile(policyId, existingCount) {
    if (!pendingFile) return "";
    let attachment = null;
    try {
      attachment = await uploadDocumentFile({
        supabase,
        scope: "insurance",
        familyId,
        ownerId: policyId,
        file: pendingFile,
      });
      const { error: err } = await supabase.from("insurance_documents").insert({
        policy_id: policyId,
        family_id: familyId,
        storage_path: attachment.storage_path,
        mime_type: attachment.mime_type,
        size_bytes: attachment.size_bytes,
        original_filename: attachment.original_filename,
        sort_order: existingCount,
      });
      if (err) throw new Error(err.message);
      return "";
    } catch (err) {
      if (attachment?.storage_path) {
        await deleteDocumentFile({
          supabase,
          storagePath: attachment.storage_path,
        });
      }
      return err?.message || "The policy saved, but the file did not attach.";
    }
  }

  // Who the certificate named, ticked on the policy. Only the people already
  // matched to the family, only the ones not already linked, and never anybody
  // the reader could not place -- an unmatched name is shown on the form for a
  // person to answer, not resolved by guessing here.
  async function linkInsured(policyId) {
    const ids = insuredRead?.ids || [];
    if (!ids.length) return "";
    const already = new Set(
      insured.filter((r) => r.policy_id === policyId).map((r) => r.traveler_id),
    );
    const rows = ids
      .filter((id) => !already.has(id))
      .map((id) => ({ policy_id: policyId, traveler_id: id }));
    if (!rows.length) return "";
    const { error: err } = await supabase
      .from("insurance_policy_travelers")
      .insert(rows);
    return err ? "The policy saved, but who it covers did not tick." : "";
  }

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
      let savedId = editingId;
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
        savedId = data.id;
      }

      // The certificate and the names it carried, now that there is a policy to
      // put them on. Both report rather than throw, so a policy that saved stays
      // saved and the person is told which half of the gesture fell short.
      const trouble = [
        await attachPendingFile(
          savedId,
          docs.filter((d) => d.policy_id === savedId).length,
        ),
        await linkInsured(savedId),
      ].filter(Boolean);

      setDraft({ ...EMPTY_DRAFT });
      setAdding(false);
      setEditingId(null);
      forgetRead();
      await load();
      if (trouble.length) setError(trouble.join(" "));
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
    return <p className="text-sm text-ink-soft">Reading your policies…</p>;
  }

  return (
    <div className="space-y-4">
      <section className="card p-4 sm:p-5">
        <h2 className="text-base font-semibold text-ink">Insurance</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
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
        <p aria-live="polite" className="text-sm text-rose">
          {error}
        </p>
      )}

      {onTrip.length === 0 && (
        <p className="text-sm leading-relaxed text-ink-soft">
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
            forgetRead();
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
                <span className="min-w-0 text-sm text-ink">
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
          extract={extract}
          pendingFile={pendingFile}
          insuredRead={insuredRead}
          programs={programs}
          onPickFile={readPolicyFile}
          onApplyRead={applyRead}
          onApplyAllRead={applyAllRead}
          onDismissRead={dismissRead}
          onForgetRead={forgetRead}
          onCancel={() => {
            setAdding(false);
            setEditingId(null);
            setDraft({ ...EMPTY_DRAFT });
            forgetRead();
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
            forgetRead();
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
          {isCardPolicy(policy) && (
            <p className="mt-1 text-xs text-ink-soft">{CARD_CONDITION}</p>
          )}
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
        <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
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

function PolicyForm({
  draft,
  setDraft,
  busy,
  editing,
  extract,
  pendingFile,
  insuredRead,
  programs = [],
  onPickFile,
  onApplyRead,
  onApplyAllRead,
  onDismissRead,
  onForgetRead,
  onCancel,
  onSubmit,
}) {
  const fileRef = useRef(null);

  function set(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function pick(e) {
    const file = e.target.files?.[0] || null;
    if (fileRef.current) fileRef.current.value = "";
    onPickFile(file);
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

      <div className="no-print space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[var(--line)] px-2.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-teal hover:text-teal">
            <span aria-hidden="true">📄</span>
            {extract?.status === "reading"
              ? "Reading…"
              : pendingFile
                ? "Read a different file"
                : "Read the policy document"}
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ATTR}
              onChange={pick}
              disabled={busy || extract?.status === "reading"}
              className="sr-only"
            />
          </label>
          {pendingFile && (
            <span className="min-w-0 text-xs text-ink-soft">
              {pendingFile.name} attaches to the policy when you save
              <button
                type="button"
                onClick={onForgetRead}
                className="ml-2 font-semibold text-ink-soft hover:text-rose"
              >
                Remove
              </button>
            </span>
          )}
        </div>
        {!pendingFile && extract?.status === "idle" && (
          <p className="text-xs leading-relaxed text-ink-soft">
            Aly reads the certificate, fills these fields in for you to check,
            and keeps the file with the policy so it opens without signal.
          </p>
        )}
        <ExtractedFieldsStrip
          status={extract?.status || "idle"}
          fields={extract?.fields || null}
          error={extract?.error || ""}
          form={draft}
          spec={POLICY_SPEC}
          onApply={onApplyRead}
          onApplyAll={onApplyAllRead}
          onDismiss={onDismissRead}
        />
        <InsuredReadNote read={insuredRead} />
      </div>

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
        {draft.kind === "card" && (
          <label className={LABEL}>
            Which card
            <select
              className={FIELD}
              value={draft.rewards_program_id || ""}
              onChange={(e) => set("rewards_program_id", e.target.value)}
            >
              <option value="">Not in the Wallet yet</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {[p.brand, p.program_name].filter(Boolean).join(" · ")}
                </option>
              ))}
            </select>
          </label>
        )}
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

/**
 * Who the certificate named, and who it named that this family does not know.
 *
 * The ticks themselves are put on the policy at save, because there is nothing
 * to tick until the policy exists. What this says out loud is the part a person
 * has to be able to disagree with: three names matched, and one name on the
 * document belongs to nobody on the roster. A grandmother on the same
 * certificate and a child whose middle name the insurer printed look identical
 * from in here, and only the family can tell which it is.
 */
function InsuredReadNote({ read }) {
  if (!read || !read.read?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--line)] p-3 text-xs leading-relaxed text-ink-soft">
      <p className="font-semibold text-ink">Named on the document</p>
      {read.matched.length > 0 ? (
        <p className="mt-1">
          {read.matched.map((m) => m.name).join(", ")} — ticked as covered when
          you save.
        </p>
      ) : (
        <p className="mt-1">
          None of the printed names matched anybody in your family, so nobody is
          ticked. Tick them on the policy once it is saved.
        </p>
      )}
      {read.unmatched.length > 0 && (
        <p className="mt-1">
          Also printed: {read.unmatched.join(", ")}. Not in your family, so left
          alone.
        </p>
      )}
    </div>
  );
}
