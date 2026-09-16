"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/LinkPending";
import { elapsedSaid } from "@/lib/agent/waiting";

/**
 * Aly answering the one question the month boxes cannot ask.
 *
 * Twelve ticks and no help is a fair way of asking a question nobody can answer:
 * whether a place is an April place or a November place is research, and whether
 * this household could go in either is a question about school, heat and crowds.
 * This asks both halves at once and hands back windows somebody can press.
 *
 * The press is the whole design. Nothing arrives already ticked, because the
 * months on a bucket-list row are what a fare gets judged against, and a machine
 * widening them by a month on its own would quietly change which fares reach the
 * family in a place nobody would look. What it does do is keep its own sentence
 * when the window is accepted, so the ticks stop being anonymous.
 *
 * Used twice with the same code: on a saved place, where accepting writes the
 * row, and inside the form, where accepting fills the boxes and the reason rides
 * along to the save. The only difference is what the parent does with the answer.
 */

/** Two honest things to say while a grounded look runs, and no third. */
const LINES = [
  [0, "Reading up on when this place is good"],
  [8, "Checking that against what you have told me"],
  [26, "Still going. Grounded answers can take most of a minute"],
  [55, "This is longer than usual. It may come back as an error"],
];

function waitLine(seconds) {
  let said = LINES[0][1];
  for (const [at, text] of LINES) if (seconds >= at) said = text;
  return said;
}

export default function WhenToGo({
  placeId = null,
  place = "",
  why = "",
  months = [],
  label = "When should we go?",
  disabled = false,
  onUse,
}) {
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState(null);
  const alive = useRef(true);

  // Set on the way in as well as cleared on the way out. A one-shot cleanup is
  // enough in production and wrong in development, where effects are mounted
  // twice on purpose: the first cleanup would latch this false and every answer
  // after it would be thrown away as arriving after the screen had gone.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!busy) return undefined;
    setSeconds(0);
    const at = Date.now();
    const tick = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - at) / 1000)),
      1000,
    );
    return () => window.clearInterval(tick);
  }, [busy]);

  async function ask() {
    if (busy) return;
    const said = place.trim();
    if (!said) {
      setError("Say where first.");
      return;
    }
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      const res = await fetch("/api/someday/season", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          placeId ? { placeId } : { place: said, why, months },
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!alive.current) return;
      if (!res.ok) {
        setError(json?.error || "That did not come back. Try it again.");
        return;
      }
      setAnswer(json);
    } catch {
      if (alive.current) setError("That did not come back. Try it again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  function use(window_) {
    if (onUse) {
      onUse({
        months: window_.months,
        reason: window_.reason || "",
        sources: answer?.sources || [],
      });
    }
    setAnswer(null);
  }

  const windows = Array.isArray(answer?.windows) ? answer.windows : [];
  const sources = Array.isArray(answer?.sources) ? answer.sources : [];

  return (
    <div>
      {busy ? (
        <p className="inline-flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <Spinner className="h-4 w-4 text-teal" />
          <span aria-live="polite">{waitLine(seconds)}</span>
          {seconds >= 3 ? (
            <span className="tabular text-xs text-ink-faint" aria-hidden="true">
              {elapsedSaid(seconds)}
            </span>
          ) : null}
        </p>
      ) : (
        <button
          type="button"
          className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
          aria-disabled={disabled}
          onClick={() => {
            if (!disabled) ask();
          }}
        >
          {label}
        </button>
      )}

      {error ? <p className="mt-2 text-sm text-rose">{error}</p> : null}

      {answer ? (
        <div className="mt-2 rounded-xl border border-[var(--line)] bg-sand/60 p-3">
          {answer.searched === false ? (
            <p className="mb-2 text-sm text-ink-faint">
              I could not search for this one, so the season part is general
              rather than checked.
            </p>
          ) : null}

          {answer.note ? (
            <p className="mb-2 text-sm text-ink">{answer.note}</p>
          ) : null}

          {windows.length ? (
            <ul className="space-y-2">
              {windows.map((window_) => (
                <li
                  key={window_.months.join(",")}
                  className="rounded-lg border border-[var(--line)] bg-white p-3"
                >
                  <p className="font-medium text-ink">{window_.label}</p>
                  <p className="mt-0.5 text-sm text-ink-soft">{window_.said}</p>
                  <p className="mt-1 text-sm leading-relaxed text-ink">
                    {window_.because}
                  </p>
                  <button
                    type="button"
                    className="btn btn-ghost mt-2"
                    onClick={() => use(window_)}
                  >
                    Tick these months
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft">
              I could not get a straight answer about the seasons here. Ticking
              the months yourself is better than a guess from me.
            </p>
          )}

          {sources.length ? (
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              {sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                >
                  {source.title}
                </a>
              ))}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
