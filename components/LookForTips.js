"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lookSummary, runLook } from "@/lib/tips/run";
import { Spinner } from "./LinkPending";
import { mayWrite } from "@/lib/travelers/allowed";
import { SECONDARY } from "@/lib/travelers/access";

/**
 * The button that goes and looks, lifted out of the Tips card so it can live
 * somewhere that stays on screen.
 *
 * A look is the slowest thing in the app -- five grounded model calls, most of a
 * minute on a bad day -- and it used to sit on the Tips tab, which meant the
 * price of starting one was standing on the tab least likely to be the one that
 * changed, watching a spinner. Now it lives in the trip header, which every tab
 * is underneath: press it, carry on reading the itinerary or ticking off the
 * packing list, and the count of what it found appears above whatever you moved
 * on to.
 *
 * The waiting is still said out loud in three ways at once -- a turning ring, a
 * bar that fills a place at a time, and a second count that climbs -- because
 * the failure this is guarding against is a minute of silence that reads as a
 * button that did not work.
 */
export default function LookForTips({
  tripId,
  // What one press covers. A trip-level look walks the trip, the packing list
  // and the next few bookings, because nobody presses a button on thirty
  // itinerary cards.
  chain = null,
  scope = "trip",
  // Whether anything has been found already, which is the difference between
  // "Look for tips" and "Look again".
  hasTips = false,
  // Handed the breakdown when a look finishes, so the page can say where the
  // tips went.
  onLooked = null,
  // Where to send somebody who wants to read the tips that landed elsewhere.
  onGo = null,
  readOnly = false,
  className = "",
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [progress, setProgress] = useState(null); // null | {done, total}
  const [landed, setLanded] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(0);

  useEffect(() => {
    if (!busy) return;
    startedRef.current = Date.now();
    setElapsed(0);
    const tick = setInterval(
      () => setElapsed(Math.round((Date.now() - startedRef.current) / 1000)),
      1000,
    );
    return () => clearInterval(tick);
  }, [busy]);

  const look = useCallback(async () => {
    setBusy(true);
    setProblem("");
    const steps = chain && chain.length ? chain : [{ scope }];
    const {
      found,
      error,
      tookMs,
      note: said,
      byScope,
    } = await runLook({
      tripId,
      steps,
      onNote: setNote,
      onProgress: setProgress,
    });
    const took = tookMs ? ` (${Math.max(1, Math.round(tookMs / 1000))}s)` : "";
    // Whatever was found is already saved, so ask the server for the list again
    // either way -- a look that stopped halfway still has something to show.
    if (found) router.refresh();
    const summary = lookSummary({ byScope: byScope || {} });
    setLanded(summary.places.filter((place) => place.tab));
    if (onLooked)
      onLooked({
        byScope: byScope || {},
        found,
        error: error || null,
        summary,
      });
    if (error) {
      setProblem(error);
      setNote(found ? `${found} found before that stopped${took}.` : "");
      setBusy(false);
      setProgress(null);
      return;
    }
    setNote(
      found
        ? `${summary.said}${took}`
        : said || `Nothing worth telling you right now${took}.`,
    );
    setBusy(false);
    setProgress(null);
  }, [chain, scope, tripId, router, onLooked]);

  // Producing a tip is refused by policy for a secondary traveler -- pro_tips
  // carries a pro_tips_no_secondary_insert policy -- so the button is not
  // offered rather than offered and swallowed.
  if (!tripId || !mayWrite(readOnly ? SECONDARY : null, "tripTips"))
    return null;

  return (
    /* A row, not a column: the header has a wide empty strip to the right of the
       dates, and a button on its own out there wastes the same space it was
       moved into. So the button sits under the location and everything the look
       has to say about itself -- the seconds climbing, the count it found, the
       tabs it filed against -- runs along the line beside it. */
    <div className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <button
          type="button"
          onClick={look}
          disabled={busy}
          className="btn btn-ghost no-print shrink-0 px-3 py-1.5 text-xs disabled:opacity-60"
        >
          {busy ? (
            <span className="flex items-center gap-1.5">
              <Spinner className="h-3.5 w-3.5" />
              Looking…
            </span>
          ) : hasTips ? (
            "Look again"
          ) : (
            "Look for tips"
          )}
        </button>

        {problem ? (
          <p
            role="alert"
            className="min-w-0 basis-full text-[0.82rem] text-rose sm:flex-1 sm:basis-0"
          >
            {problem}
          </p>
        ) : busy ? (
          <p
            aria-live="polite"
            className="min-w-0 basis-full text-[0.82rem] text-ink-soft sm:flex-1 sm:basis-0"
          >
            {note || "Looking…"}
            {elapsed ? ` \u00b7 ${elapsed}s` : ""}
          </p>
        ) : note ? (
          <p
            aria-live="polite"
            className="min-w-0 basis-full text-[0.82rem] text-ink-soft sm:flex-1 sm:basis-0"
          >
            {note}
          </p>
        ) : (
          /* What the button is for, on the line beside it, where a heading over
             an empty card used to say it. */
          /* Off the phone entirely: a sentence explaining a button, set in a
             column three words wide beside it, is worse than the button
             standing on its own. */
          <p className="hidden min-w-0 text-[0.82rem] text-ink-soft sm:block sm:flex-1">
            {hasTips
              ? "Runs while you carry on reading; new tips land on the tab they belong to."
              : "Aly reads these dates and plans and files what she finds on the tab it belongs to. Carry on while it runs."}
          </p>
        )}
      </div>

      {/* The bar is both: a fill for how many places are done, and a shimmer
          across the rest so the middle of a check still moves. */}
      {busy ? (
        <div
          className="sk mt-2 h-1.5 overflow-hidden rounded-full bg-sand-deep"
          role="progressbar"
          aria-label="How far the look has got"
          aria-valuemin={0}
          aria-valuemax={progress?.total || 1}
          aria-valuenow={progress?.done || 0}
        >
          <div
            className="h-full rounded-full bg-teal transition-[width] duration-500 ease-out"
            style={{
              width: `${Math.round(
                ((progress?.done || 0) / Math.max(1, progress?.total || 1)) *
                  100,
              )}%`,
            }}
          />
        </div>
      ) : null}

      {/* The tabs a look actually filed something against. The button can be
          pressed from any tab now, so a count with no way to reach what it
          counted is worse here than it was on the Tips tab. */}
      {!busy && onGo && landed.length ? (
        <div className="no-print mt-1.5 flex flex-wrap gap-2">
          {landed.map((place) => (
            <button
              key={place.tab}
              type="button"
              onClick={() => onGo(place.tab)}
              className="btn-ghost px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em]"
            >
              {`Open ${place.label.replace(/^the /, "")}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
