"use client";

import { useState } from "react";
import { ASK_ALY_EVENT } from "@/components/AskAlyTrigger";
import DictationHint from "@/components/DictationHint";
import {
  LOG_ASKS,
  LOG_EXAMPLES,
  logSeed,
  logReadyLine,
} from "@/lib/trips/logbook";

/**
 * Writing down a trip that has already happened.
 *
 * The same shape as the trip builder next door, and deliberately so -- one screen,
 * a few boxes, and a conversation with Aly on the other side of the button -- but
 * every question is asked in the past tense, and the packing list is asked FOR
 * rather than offered. A finished trip needs no suggestions: what it needs is the
 * family's own record of it, because that record is what makes the next trip
 * better. "We took too many clothes to Disney" is worth more two years later than
 * any itinerary.
 *
 * Only the first box is needed. Somebody who remembers the trip but not what they
 * packed should still be able to log it, and a blank packing list stays blank --
 * this screen never fills one in on their behalf.
 *
 * Nothing here writes to the database. Aly creates the trip, finished, from what
 * these boxes say.
 */
export default function LogTripStart() {
  const [values, setValues] = useState({ trip: "", packing: "", notes: "" });
  const set = (id) => (event) =>
    setValues((v) => ({ ...v, [id]: event.target.value }));
  const seed = logSeed(values);

  function start() {
    if (!seed) return;
    window.dispatchEvent(
      new CustomEvent(ASK_ALY_EVENT, {
        detail: { seed, autoSend: true, focus: "log_trip" },
      }),
    );
  }

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">
        Log a trip you have already taken
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        For the record, and for the next trip. Tell it however you remember it —
        Aly writes it up as a finished trip, keeps the packing list you actually
        used, and reads your notes back when you plan something similar.
      </p>

      {LOG_ASKS.map((ask) => (
        <div key={ask.id} className="mt-6">
          <label
            className="block text-sm font-semibold"
            htmlFor={`log-${ask.id}`}
          >
            {ask.label}
            {!ask.required && (
              <span className="ml-2 text-xs font-normal text-ink-faint">
                Optional
              </span>
            )}
          </label>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            {ask.hint}
          </p>
          <textarea
            id={`log-${ask.id}`}
            className="field mt-2 text-base leading-relaxed"
            rows={ask.id === "trip" ? 4 : 3}
            placeholder={ask.placeholder}
            value={values[ask.id]}
            onChange={set(ask.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start();
            }}
          />
        </div>
      ))}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <DictationHint />
        <p
          className="text-xs leading-relaxed text-ink-soft"
          aria-live="polite"
          role="status"
        >
          {logReadyLine(values)}
        </p>
      </div>

      <button
        type="button"
        className="btn btn-primary mt-4 w-full sm:w-auto"
        onClick={start}
        disabled={!seed}
      >
        Log this trip
      </button>

      {/* Examples, and only examples. A box asking for a few sentences gets
          three words unless somebody shows what a few sentences looks like --
          but a button that pastes somebody else's trip into your box is worse
          than no button: what lands is a plausible-looking record of a holiday
          the family never took, and it is easier to type over a blank box than
          to notice that. They are short on purpose: a trip from 2011 that nobody
          kept notes on is still worth having. */}
      <div className="mt-9 border-t border-[var(--line)] pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Rough is enough
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          Any of these is a trip worth logging. They are here to show how little
          you need — nothing to press, just write your own in the first box.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {LOG_EXAMPLES.map((example) => (
            <blockquote
              key={example}
              className="rounded-xl border border-sand-deep bg-sand/50 p-3 text-xs leading-relaxed text-ink-soft"
            >
              &ldquo;{example}&rdquo;
            </blockquote>
          ))}
        </div>
      </div>

      {/* Said once, plainly, because it is the difference between this screen and
          the builder and somebody arriving here from the Trips page will assume
          the app is about to start planning at them. */}
      <p className="mt-9 border-t border-[var(--line)] pt-5 text-xs leading-relaxed text-ink-soft">
        A logged trip lands in Past trips. Nothing about it goes on the family
        calendar, nothing gets a countdown, and Aly will not suggest anything to
        book — it is a record, not a plan.
      </p>
    </>
  );
}
