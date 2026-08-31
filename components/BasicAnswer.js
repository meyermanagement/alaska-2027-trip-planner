"use client";

import { useState } from "react";
import { adoptRequest, settledDisagreement } from "@/lib/trips/settled";

/**
 * One of the six answers, shown against what the trip has actually become.
 *
 * The six are text somebody typed before anything existed, and a text column
 * remembers only its latest value. So Portugal Spring 2027 went on saying "One
 * apartment in Lisbon for the whole stay" after two hotels had gone onto its
 * days -- Herdade da Malhadinha Nova in the Alentejo, then Vila Vita Parc in the
 * Algarve. Not an apartment, not Lisbon, not the whole stay, and two places
 * rather than one, presented as the current answer.
 *
 * The fix is not to overwrite it. "One apartment, we do not want to move" says
 * something true about the family that two hotels do not, and quietly replacing
 * it would delete the reason they will be annoyed about the moving. So when the
 * days disagree, both are shown: the answer struck through, what the days hold
 * under it, and a button that asks Aly to make the change properly -- the same
 * path a recommendation card and a typed sentence take, with the same
 * confirmation card, rather than a third way for a trip to change.
 *
 * And every change keeps what it replaced, so the card can show the answer's own
 * history rather than only where it ended up.
 */
export default function BasicAnswer({
  trip,
  basic,
  label,
  value,
  itinerary = [],
  history = [],
  onAsk,
}) {
  const [showHistory, setShowHistory] = useState(false);
  const disagreement = settledDisagreement(trip, itinerary, basic);
  // Newest first: what it says now is the thing being explained, and what it
  // said in 2026 is the footnote.
  const mine = history
    .filter((h) => h.basic === basic)
    .slice()
    .sort((a, b) =>
      String(b.created_at || "").localeCompare(String(a.created_at || "")),
    );

  return (
    <div className="min-w-0">
      {disagreement ? (
        <>
          {/* Struck through rather than removed. The answer is not wrong about
              what the family wanted, only about what the trip turned into. */}
          <p className="text-sm leading-relaxed text-ink-faint line-through decoration-ink-faint/60">
            {value}
          </p>
          <p className="mt-1.5 text-sm font-semibold leading-relaxed text-ink">
            {disagreement.text}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            On the days now. {disagreement.why} The answer above is still what
            was asked for.
          </p>
          {onAsk && (
            <button
              type="button"
              onClick={() => onAsk(adoptRequest(trip, itinerary, basic, label))}
              className="mt-2 text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
            >
              Make that the answer
            </button>
          )}
        </>
      ) : (
        <p className="text-sm leading-relaxed text-ink">{value}</p>
      )}

      {mine.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="text-xs font-semibold text-ink-soft underline decoration-ink-faint underline-offset-2 hover:text-ink"
          >
            {showHistory
              ? "Hide what it said before"
              : mine.length === 1
                ? "Changed once"
                : `Changed ${mine.length} times`}
          </button>
          {showHistory && (
            <ol className="mt-1.5 space-y-1 border-l border-[var(--line)] pl-2.5">
              {mine.map((h) => (
                <li
                  key={h.id}
                  className="text-xs leading-relaxed text-ink-soft"
                >
                  {/* The old value is the point of the row, so it leads, struck
                      through, with what replaced it after the arrow. */}
                  <span className="line-through decoration-ink-faint/60">
                    {h.previous_value || "nothing"}
                  </span>
                  <span aria-hidden="true"> → </span>
                  <span className="sr-only"> became </span>
                  <span className="text-ink">{h.new_value || "nothing"}</span>
                  {h.created_at && (
                    <span className="whitespace-nowrap text-ink-faint">
                      {" · "}
                      {String(h.created_at).slice(0, 10)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
