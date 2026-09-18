"use client";

import { canonicalCover, coverLabel, kindLabel } from "@/lib/insurance/policy";

/**
 * The keep-or-edit strip that shows what Aly read from a scan.
 *
 * The strip lives above the form, not inside it. Each row shows one field, the
 * value Aly read, and one of three answers:
 *
 *   - "Keep"      the field is empty in the form; tapping fills it in
 *   - "Replace"   the field already has a different value in the form; tapping
 *                 replaces it, and the person sees which value is which before
 *                 they do
 *   - "Kept"      the field already has this value in the form; nothing to do
 *
 * A "Use all" button applies every keepable row at once, for the common case
 * where the extraction is clean and the person just wants to move on.
 *
 * Nothing here writes to the database. The form's own save button is still the
 * only thing that persists anything -- this strip only mutates the form's
 * state through the setter it was handed.
 */

// What a strip needs to know about the document it is describing: the fields it
// walks, in the order the form beneath it draws them; which of those the form can
// actually be filled from; how to say a raw value out loud; and the noun to use
// for the document itself. Two documents are read in this app and both use this
// component, because the question -- here is what was read, do you want it? --
// is the same question whether the file was a passport or a policy.
const IDENTITY_LABELS = {
  doc_type: "Type",
  number: "Number",
  issue_date: "Issued on",
  expiration_date: "Expires",
  issuing_authority: "Issued by",
  full_name: "Name on the document",
};

// The order the strip walks the fields in. Matches the form's own layout so
// the eye can move top-to-bottom between the two.
const IDENTITY_ORDER = [
  "doc_type",
  "number",
  "issuing_authority",
  "issue_date",
  "expiration_date",
  "full_name",
];

// Full name is not stored on traveler_documents -- the strip shows it as a
// sanity check the person can read, but no button offers to write it anywhere.
const IDENTITY_APPLIES = new Set([
  "doc_type",
  "number",
  "issuing_authority",
  "issue_date",
  "expiration_date",
]);

function prettyDocType(value) {
  switch (value) {
    case "passport":
      return "Passport";
    case "drivers_license":
      return "Driver's license";
    case "national_id":
      return "National ID";
    case "visa":
      return "Visa";
    default:
      return "Other";
  }
}

function prettyIdentity(field, value) {
  if (!value) return "";
  if (field === "doc_type") return prettyDocType(value);
  return value;
}

export const IDENTITY_SPEC = {
  noun: "scan",
  order: IDENTITY_ORDER,
  labels: IDENTITY_LABELS,
  applies: IDENTITY_APPLIES,
  pretty: prettyIdentity,
};

function prettyMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  });
}

function prettyPolicy(field, value) {
  if (value === null || value === undefined || value === "") return "";
  if (field === "covers") {
    return (
      (Array.isArray(value) ? value : [])
        // Through the same alias table the save goes through, so the strip cannot
        // promise a benefit the form will then drop.
        .map((c) => coverLabel(canonicalCover(c)) || c)
        .join(", ")
    );
  }
  if (field === "insured_names") {
    return (Array.isArray(value) ? value : []).join(", ");
  }
  if (field === "kind") {
    return kindLabel(value);
  }
  if (
    field === "premium" ||
    field === "deductible" ||
    field === "medical_limit" ||
    field === "evacuation_limit"
  ) {
    return prettyMoney(value);
  }
  return String(value);
}

export const POLICY_SPEC = {
  noun: "policy",
  order: [
    "provider",
    "plan_name",
    "policy_number",
    "kind",
    "coverage_start",
    "coverage_end",
    "covers",
    "medical_limit",
    "evacuation_limit",
    "deductible",
    "premium",
    "emergency_phone",
    "claims_phone",
    "claims_url",
    "notes",
  ],
  labels: {
    provider: "Insurer",
    plan_name: "Plan",
    policy_number: "Policy number",
    kind: "Covers",
    coverage_start: "Cover starts",
    coverage_end: "Cover ends",
    covers: "Benefits",
    medical_limit: "Medical limit",
    evacuation_limit: "Evacuation limit",
    deductible: "Deductible",
    premium: "Premium",
    emergency_phone: "24-hour line",
    claims_phone: "Claims line",
    claims_url: "Claims page",
    notes: "Worth knowing",
  },
  // Every row the strip draws. The insured names are not among them: they are
  // people rather than a field, so they are matched against the family and
  // reported under the form instead of offered as a value to keep.
  applies: new Set([
    "provider",
    "plan_name",
    "policy_number",
    "kind",
    "coverage_start",
    "coverage_end",
    "covers",
    "medical_limit",
    "evacuation_limit",
    "deductible",
    "premium",
    "emergency_phone",
    "claims_phone",
    "claims_url",
    "notes",
  ]),
  pretty: prettyPolicy,
};

// Two values are the same value when they read the same, which is the only
// comparison that means anything across a string field, a number field and a
// list of benefits.
function sameValue(spec, key, a, b) {
  return spec.pretty(key, a) === spec.pretty(key, b);
}

function isEmpty(value) {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function rowsFrom(fields, form, spec) {
  const rows = [];
  for (const key of spec.order) {
    const read = fields[key];
    if (isEmpty(read)) continue;
    const current = form[key];
    let state = "keep";
    if (!spec.applies.has(key)) {
      state = "note";
    } else if (!isEmpty(current) && sameValue(spec, key, current, read)) {
      state = "kept";
    } else if (!isEmpty(current)) {
      state = "replace";
    }
    rows.push({ key, read, current, state });
  }
  return rows;
}

export default function ExtractedFieldsStrip({
  status,
  fields,
  error,
  form,
  spec = IDENTITY_SPEC,
  onApply,
  onApplyAll,
  onDismiss,
}) {
  if (status === "idle") return null;

  if (status === "reading") {
    return (
      <div className="rounded-xl border border-teal/30 bg-teal-soft/40 p-3 text-xs text-ink-soft">
        <p aria-live="polite">Aly is reading the {spec.noun}…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-xs text-ink">
        <p aria-live="polite">
          Aly could not read this one. {error || ""} You can still fill the
          fields in by hand.
        </p>
        <div className="mt-2">
          <button
            type="button"
            className="btn btn-ghost px-2 py-1 text-xs"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (status !== "ready" || !fields) return null;

  const rows = rowsFrom(fields, form, spec);
  const applyable = rows.filter(
    (r) =>
      spec.applies.has(r.key) && (r.state === "keep" || r.state === "replace"),
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-teal/30 bg-teal-soft/40 p-3 text-xs text-ink-soft">
        <p>
          Aly did not find any fields worth filling in from this {spec.noun}.
        </p>
        <div className="mt-2">
          <button
            type="button"
            className="btn btn-ghost px-2 py-1 text-xs"
            onClick={onDismiss}
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  const confidence = fields.confidence || "low";
  const confidenceNote =
    confidence === "low"
      ? "Low confidence — check each one."
      : confidence === "medium"
        ? spec.noun === "policy"
          ? "Read from a long document — worth a glance."
          : "Read from a photograph — worth a glance."
        : "";

  return (
    <div className="rounded-xl border border-teal/30 bg-teal-soft/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-ink">
          Aly read this from the {spec.noun}
        </p>
        {confidenceNote && (
          <p className="text-[11px] text-ink-soft">{confidenceNote}</p>
        )}
      </div>
      <ul className="mt-2 space-y-1.5">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs"
          >
            <span className="min-w-[7rem] font-semibold text-ink-soft">
              {spec.labels[row.key]}
            </span>
            {/* A claims URL is one unbroken word and the phone is 320px wide, so
                a value that cannot fit is allowed to break mid-word. break-words
                rather than break-all: the latter also chopped "Allianz Global
                Assistance" in half. */}
            <span className="min-w-0 break-words font-mono text-ink">
              {spec.pretty(row.key, row.read)}
            </span>
            {row.state === "kept" && (
              <span className="text-[11px] text-ink-faint">already set</span>
            )}
            {row.state === "note" && (
              <span className="text-[11px] text-ink-faint">for your eye</span>
            )}
            {row.state === "keep" && (
              <button
                type="button"
                className="btn btn-ghost px-2 py-0.5 text-[11px]"
                onClick={() => onApply(row.key, row.read)}
              >
                Keep
              </button>
            )}
            {row.state === "replace" && (
              <>
                <span className="text-[11px] text-ink-faint">
                  now: {spec.pretty(row.key, row.current)}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-0.5 text-[11px]"
                  onClick={() => onApply(row.key, row.read)}
                >
                  Replace
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {applyable.length > 0 && (
          <button
            type="button"
            className="btn btn-primary px-2.5 py-1 text-xs"
            onClick={() => onApplyAll(applyable)}
          >
            Use all {applyable.length}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost px-2 py-1 text-xs"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
