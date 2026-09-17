"use client";

import { useState } from "react";
import { MAX_SAID } from "@/lib/trips/circumstances";

// Two bands, and they are two different kinds of statement.
//
// The first is rose and cannot be dismissed. It says a thing on this trip and a
// thing about the family cannot both be true — a dog on a sailing that takes no
// dogs, a rabies certificate that runs out before the family is home. Those are
// arithmetic, worked out fresh on every draw and stored nowhere, so the band goes
// away when the fact changes and not before. There is nothing to weigh up and so
// nothing to wave off.
//
// The second is quiet and asks a question. It says the circumstances the trip was
// planned against have drifted, names up to three of them, and offers two
// answers: look again, or it's fine. Both are endings. "It's fine" is not a
// dismissal that hides something still true — it records today's circumstances as
// the ones this trip is planned against, which is the same thing a look does, so
// the band is gone because the assumption has been updated rather than because it
// has been hidden.
//
// There is no third state where the app says everything looks fine. A scan that
// congratulates you every time teaches you to stop pressing it, so this shows
// nothing at all when nothing has drifted.

function ChangeIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3.5 8.5a6.5 6.5 0 0 1 11-3.2L17 7.5" />
      <path d="M17 3.5v4h-4" />
      <path d="M16.5 11.5a6.5 6.5 0 0 1-11 3.2L3 12.5" />
      <path d="M3 16.5v-4h4" />
    </svg>
  );
}

/**
 * Everything the trip has to say about the family having changed.
 *
 * @param {object} props
 * @param {Array}  props.contradictions from lib/trips/contradictions
 * @param {Array}  props.changes        from lib/trips/circumstances
 * @param {string} props.tripId
 * @param {Function} props.onGo         hands the reader to a tab after a look
 * @param {Function} props.onDone       refetch, so the band redraws off new rows
 * @param {boolean} props.readOnly
 */
export default function TripChanges({
  contradictions = [],
  changes = [],
  tripId,
  onGo = null,
  onDone = null,
  readOnly = false,
}) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [said, setSaid] = useState("");

  if (!contradictions.length && !changes.length && !said) return null;

  const call = async (action) => {
    setBusy(action);
    setError("");
    try {
      const response = await fetch(`/api/trips/${tripId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data?.error || "That did not go through.");
        return;
      }
      if (action === "review") {
        if (data.added > 0) {
          setSaid(
            `${data.added} ${data.added === 1 ? "answer" : "answers"} on the Tips tab.`,
          );
          if (onGo) onGo("tips");
        } else {
          setSaid(data.nothing || "Nothing on this trip needs to move.");
        }
      } else {
        // Said straight away rather than waiting for the page to be drawn again.
        // The server recomputes the drift on the refresh below and this whole
        // band goes, but that is a round trip away, and a button that leaves the
        // question on screen after it was answered reads as a button that failed.
        setSaid("Noted. This trip is planned for how things are now.");
      }
      if (onDone) onDone();
    } catch {
      setError("That did not go through.");
    } finally {
      setBusy(null);
    }
  };

  const lead = changes.slice(0, MAX_SAID);
  const rest = changes.length - lead.length;

  return (
    <div className="no-print mb-4 space-y-3">
      {contradictions.length > 0 && (
        <section
          aria-label="Something on this trip cannot happen"
          className="rounded-2xl border border-rose/40 bg-rose/8 p-5"
        >
          <ul className="space-y-3">
            {contradictions.map((one) => (
              <li key={one.id}>
                <p className="text-2xs font-bold tracking-[0.09em] text-rose uppercase">
                  {one.label}
                </p>
                <p className="mt-1 text-base leading-snug font-semibold text-ink">
                  {one.headline}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                  {one.detail}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(changes.length > 0 || said) && (
        <section
          aria-label="The family has changed since this trip was planned"
          className="rounded-2xl border border-[var(--line-strong)] bg-sand-deep/30 px-4 py-3.5"
        >
          <div className="flex items-start gap-2.5 text-ink-soft">
            <span className="mt-0.5 text-amber">
              <ChangeIcon />
            </span>
            <div className="min-w-0 flex-1">
              {said ? (
                <p className="text-sm leading-relaxed text-ink">{said}</p>
              ) : (
                <>
                  <ul className="space-y-1 text-sm leading-relaxed">
                    {lead.map((change) => (
                      <li key={change.id}>{change.said}</li>
                    ))}
                  </ul>
                  {rest > 0 && (
                    <p className="mt-1 text-sm">
                      And {rest} more {rest === 1 ? "change" : "changes"}.
                    </p>
                  )}
                  {!readOnly && (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={() => call("review")}
                        disabled={Boolean(busy)}
                        className="btn btn-primary btn-sm"
                      >
                        {busy === "review"
                          ? "Reading the trip again…"
                          : "See what this changes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => call("settle")}
                        disabled={Boolean(busy)}
                        className="btn btn-ghost btn-sm"
                      >
                        {busy === "settle" ? "Noting it…" : "It's fine"}
                      </button>
                    </div>
                  )}
                </>
              )}
              {error && (
                <p className="mt-2 text-sm leading-relaxed text-rose">
                  {error}
                </p>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
