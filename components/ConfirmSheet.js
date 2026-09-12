"use client";

import { useEffect, useRef } from "react";

/**
 * A question the app asks in its own voice.
 *
 * The browser's confirm box can only ask one thing and offer one way to agree,
 * which is the wrong shape for most of the decisions in here: taking something
 * out of a day pack is not a yes or no, it is a choice between leaving it on the
 * trip's packing list and taking it off both. A native box also cannot say what
 * happens either way in more than a line, cannot be styled to look like the app
 * it interrupted, and can be switched off for the whole page by a browser that
 * decided the page was asking too often -- at which point the question silently
 * stops being asked and the action goes through unasked.
 *
 * So the app asks. One or more named ways forward, each saying what it does, and
 * a way out that is always there and always the safe one: Escape, the scrim, and
 * a plain Cancel all leave everything alone.
 *
 * @param {object} props
 * @param {string} props.title the question, short enough to read at a glance
 * @param {React.ReactNode} props.body what happens, in a sentence or two
 * @param {Array<{label: string, tone?: 'primary'|'danger'|'plain', onPick: Function}>} props.actions
 * @param {string} props.cancelLabel
 * @param {Function} props.onCancel
 * @param {boolean} props.busy true while a chosen action is still writing
 */
export default function ConfirmSheet({
  title,
  body = null,
  actions = [],
  cancelLabel = "Cancel",
  onCancel = () => {},
  busy = false,
}) {
  const panelRef = useRef(null);

  // The panel takes focus as it opens so a keyboard lands inside the question
  // rather than back where it was, and Escape is the way out that needs no
  // pointer. A write in flight holds the door shut, because closing halfway
  // through would leave the person unsure which list changed.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="no-print arc-in fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Cancel"
        disabled={busy}
        onClick={() => onCancel()}
        className="arc-scrim absolute inset-0"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="card relative m-0 w-full max-w-md rounded-b-none rounded-t-3xl p-5 outline-none sm:m-4 sm:rounded-3xl"
        style={{
          paddingBottom:
            "max(1.25rem, calc(env(safe-area-inset-bottom) + 1rem))",
        }}
      >
        <p className="font-display text-lg font-semibold leading-snug text-ink">
          {title}
        </p>
        {body ? (
          <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink-soft">
            {body}
          </div>
        ) : null}
        {/* Stacked, full width, in the order the answer is usually given. Two
            choices side by side on a phone are two half-width targets, and this
            is a question where pressing the wrong one edits a list. */}
        <div className="mt-4 space-y-2">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={busy}
              onClick={() => action.onPick()}
              className={`btn w-full justify-center text-sm font-semibold ${
                action.tone === "danger"
                  ? "bg-rose text-on-accent shadow-sm hover:bg-rose/90"
                  : action.tone === "plain"
                    ? "btn-ghost"
                    : "btn-primary"
              }`}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel()}
            className="btn btn-ghost w-full justify-center text-sm"
          >
            {cancelLabel}
          </button>
        </div>
        {busy ? (
          <p className="mt-3 text-center text-xs text-ink-faint">Saving…</p>
        ) : null}
      </div>
    </div>
  );
}
