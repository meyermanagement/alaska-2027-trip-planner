"use client";

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

const FIELD_LABELS = {
  doc_type: "Type",
  number: "Number",
  issue_date: "Issued on",
  expiration_date: "Expires",
  issuing_authority: "Issued by",
  full_name: "Name on the document",
};

// The order the strip walks the fields in. Matches the form's own layout so
// the eye can move top-to-bottom between the two.
const FIELD_ORDER = [
  "doc_type",
  "number",
  "issuing_authority",
  "issue_date",
  "expiration_date",
  "full_name",
];

// Full name is not stored on traveler_documents -- the strip shows it as a
// sanity check the person can read, but no button offers to write it anywhere.
const APPLIES_TO_FORM = new Set([
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
      return "Driver's licence";
    case "national_id":
      return "National ID";
    case "visa":
      return "Visa";
    default:
      return "Other";
  }
}

function prettyValue(field, value) {
  if (!value) return "";
  if (field === "doc_type") return prettyDocType(value);
  return value;
}

function rowsFrom(fields, form) {
  const rows = [];
  for (const key of FIELD_ORDER) {
    if (!APPLIES_TO_FORM.has(key) && key !== "full_name") continue;
    const read = fields[key] || "";
    if (!read) continue;
    const current = form[key] || "";
    let state = "keep";
    if (!APPLIES_TO_FORM.has(key)) {
      state = "note";
    } else if (current && current === read) {
      state = "kept";
    } else if (current && current !== read) {
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
  onApply,
  onApplyAll,
  onDismiss,
}) {
  if (status === "idle") return null;

  if (status === "reading") {
    return (
      <div className="rounded-xl border border-teal/30 bg-teal-soft/40 p-3 text-xs text-ink-soft">
        <p aria-live="polite">Reading the scan…</p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-xl border border-amber/40 bg-amber/10 p-3 text-xs text-ink">
        <p aria-live="polite">
          I could not read this one. {error || ""} You can still fill the fields
          in by hand.
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

  const rows = rowsFrom(fields, form);
  const applyable = rows.filter(
    (r) =>
      APPLIES_TO_FORM.has(r.key) &&
      (r.state === "keep" || r.state === "replace"),
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-teal/30 bg-teal-soft/40 p-3 text-xs text-ink-soft">
        <p>I did not find any fields worth filling in from this scan.</p>
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
        ? "Read from a photograph — worth a glance."
        : "";

  return (
    <div className="rounded-xl border border-teal/30 bg-teal-soft/40 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold text-ink">
          I read this from the scan
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
              {FIELD_LABELS[row.key]}
            </span>
            <span className="font-mono text-ink">
              {prettyValue(row.key, row.read)}
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
                  now: {prettyValue(row.key, row.current)}
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
