"use client";

import { useState } from "react";
import { readBasics } from "@/lib/trips/basics";
import {
  artifactDays,
  artifactSummaryLine,
  artifactTitle,
  isPendingField,
} from "@/lib/trips/artifact";

/**
 * The trip, on the screen, while it is still being talked about.
 *
 * Pinned above the conversation rather than dropped into it, because a thing that
 * scrolls away is not a thing you can check your work against. Two states per
 * value: saved, which reads normally, and proposed, which is dashed and amber and
 * says so. That pairing is the whole point -- somebody can see what a card is
 * about to do to the trip BEFORE pressing it, which is the only moment at which
 * a wrong date is cheap to fix.
 *
 * Collapsible, and collapsed still says something useful, because on a phone the
 * panel is the whole screen and a family arguing about restaurants should be able
 * to get the trip out of the way without losing track of how many changes are
 * waiting.
 *
 * Renders nothing at all when there is nothing to show. An empty artifact frame
 * above a fresh conversation would be a promise the screen has not kept yet.
 */
export default function TripArtifact({
  artifact,
  logged = false,
  // The packing list a new trip gets is worked out on the server after the
  // trip is saved, so its items never pass through a card and cannot appear in
  // the artifact by name. Saying it exists is honest; listing nothing under a
  // Packing heading would read as though the list had come back empty.
  packingNote = "",
}) {
  const [open, setOpen] = useState(true);
  if (!artifact || artifact.empty) return null;

  const { trip } = artifact;
  const basics = readBasics(trip);
  const days = artifactDays(artifact);
  const title = artifactTitle(artifact, { logged });
  const line = artifactSummaryLine(artifact);
  // A trip that exists is a fact; one waiting on a card is not, and the strip
  // must not read as though the family had already agreed to it.
  const state = artifact.created
    ? logged
      ? "Trip logged"
      : "Trip saved"
    : artifact.createdPending
      ? "Not created yet"
      : "";

  const mark = (pending) =>
    pending
      ? "border-dashed border-amber bg-amber/10"
      : "border-[var(--line)] bg-white";

  return (
    <section
      className="sticky top-0 z-10 -mx-4 -mt-4 mb-1 border-b border-[var(--line)] bg-sand/95 px-4 py-3 backdrop-blur"
      aria-label={logged ? "The trip being logged" : "The trip so far"}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{title}</span>
            <svg
              viewBox="0 0 20 20"
              className={`h-3.5 w-3.5 shrink-0 text-ink-faint transition ${open ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="M5 8l5 5 5-5" />
            </svg>
          </span>
          {(state || line) && (
            <span className="mt-0.5 block text-xs leading-snug text-ink-soft">
              {state && <span className="font-semibold text-ink">{state}</span>}
              {state && line ? " · " : ""}
              {line}
            </span>
          )}
        </button>
        {artifact.pendingCount > 0 && (
          <span
            className="shrink-0 rounded-full border border-dashed border-amber bg-amber/10 px-2 py-0.5 text-[0.65rem] font-semibold text-ink"
            aria-live="polite"
          >
            {artifact.pendingCount} waiting
          </span>
        )}
      </div>

      {open && (
        <div className="mt-2.5 space-y-2.5">
          {/* The six, for a trip being planned. A logged trip is not being
              planned, so it gets the two that are true of a finished trip --
              where and when -- and nothing that reads like a to-do. */}
          <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {(logged ? basics.slice(0, 2) : basics).map((basic) => {
              const field =
                basic.id === "where"
                  ? "destination"
                  : basic.id === "when"
                    ? "start_date"
                    : basic.id;
              const pending =
                isPendingField(artifact, field) ||
                (basic.id === "when" &&
                  (isPendingField(artifact, "date_note") ||
                    isPendingField(artifact, "end_date")));
              return (
                <div key={basic.id} className="min-w-0">
                  <dt className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
                    {basic.label}
                  </dt>
                  <dd
                    className={`text-xs leading-snug ${
                      basic.answered
                        ? pending
                          ? "font-semibold text-ink"
                          : "text-ink"
                        : "text-ink-faint"
                    }`}
                  >
                    {basic.answered ? basic.value : "Not said yet"}
                    {basic.answered && pending && (
                      <span className="ml-1 text-[0.65rem] font-normal text-ink-soft">
                        · unsaved
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>

          {days.length > 0 && (
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
                {logged ? "What you did" : "Itinerary"}
              </p>
              <div className="mt-1 space-y-1">
                {days.map((day) => (
                  <div key={day.date || "undated"}>
                    <p className="tabular text-[0.7rem] font-semibold text-ink-soft">
                      {day.date || "Day not set"}
                    </p>
                    <ul className="mt-0.5 space-y-1">
                      {day.items.map((item, i) => (
                        <li
                          key={`${item.title}-${i}`}
                          className={`flex items-baseline gap-1.5 rounded-lg border px-2 py-1 text-xs leading-snug ${mark(item.pending)}`}
                        >
                          {item.time && (
                            <span className="tabular shrink-0 text-ink-soft">
                              {item.time.slice(0, 5)}
                            </span>
                          )}
                          <span className="min-w-0 flex-1 break-words">
                            {item.title}
                          </span>
                          {item.pending && (
                            <span className="shrink-0 text-[0.65rem] text-ink-soft">
                              unsaved
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Packing is shown by name rather than as a count on a logged trip:
              the one mistake worth catching there is an item nobody listed, and
              a number would hide exactly that. */}
          {(artifact.packing.length > 0 || packingNote) && (
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
                {logged ? "What you packed" : "Packing"}
              </p>
              {packingNote && (
                <p className="mt-0.5 text-xs text-ink-soft">{packingNote}</p>
              )}
              <ul className="mt-1 flex flex-wrap gap-1">
                {artifact.packing.map((row, i) => (
                  <li
                    key={`${row.title}-${i}`}
                    className={`rounded-full border px-2 py-0.5 text-[0.7rem] ${mark(row.pending)}`}
                  >
                    {row.title}
                    {row.assignee && row.assignee !== "Shared" && (
                      <span className="text-ink-soft"> · {row.assignee}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {artifact.tasks.length > 0 && (
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
                To book or sort
              </p>
              <ul className="mt-1 space-y-1">
                {artifact.tasks.map((row, i) => (
                  <li
                    key={`${row.title}-${i}`}
                    className={`flex items-baseline gap-1.5 rounded-lg border px-2 py-1 text-xs leading-snug ${mark(row.pending)}`}
                  >
                    <span className="min-w-0 flex-1 break-words">
                      {row.title}
                    </span>
                    {(row.date || row.timing) && (
                      <span className="tabular shrink-0 text-[0.65rem] text-ink-soft">
                        {row.date || row.timing.replace(/_/g, " ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {artifact.notes.length > 0 && (
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-faint">
                {logged ? "For next time" : "Notes"}
              </p>
              <ul className="mt-1 space-y-1">
                {artifact.notes.map((row, i) => (
                  <li
                    key={`${row.title}-${i}`}
                    className={`rounded-lg border px-2 py-1 text-xs leading-snug ${mark(row.pending)}`}
                  >
                    <span className="break-words">{row.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {artifact.travelers.length > 0 && (
            <p className="text-xs text-ink-soft">
              Going: {artifact.travelers.join(", ")}
            </p>
          )}

          {artifact.pendingCount > 0 && (
            <p className="text-[0.7rem] leading-snug text-ink-soft">
              Anything dashed is proposed, not saved. Press the card below to
              keep it, or say what to change first.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
