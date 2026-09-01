"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lookSummary, runLook } from "@/lib/tips/run";
import { Spinner } from "./LinkPending";
import { BinocularsIcon } from "./Icons";
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
  // Whether anything has been found already, which only adds a word to the
  // label. It used to swap it for "Look again", which said nothing about what
  // was being looked for to anybody arriving at the trip cold.
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
    /* A column, sized by whoever placed it: this sits in the header's right
       hand column under Edit trip, which is where the card was leaving a blank
       strip the height of two buttons. Filling it with the one thing on this
       screen that does work worth waiting for is a better use of it than air.

       And it is drawn as the primary button, not a ghost like Edit trip. On a
       trip with no tips yet this is the press that fetches them, and a look
       that nobody notices is a look nobody asks for. */
    <div className={className}>
      <button
        type="button"
        onClick={look}
        disabled={busy}
        className="btn btn-primary btn-sm no-print w-full disabled:opacity-70"
      >
        {/* A pair of binoculars, which is the one shape that says what this
            press does. A magnifying glass would have been the reflex and the
            wrong pick: the app already uses one for search, and this is not a
            search of anything the family has -- it goes and looks ahead at a
            trip nobody has asked a question about yet. The spinner takes the
            icon's place while it runs, so the button does not change width
            mid-look. */}
        {busy ? (
          <>
            <Spinner className="h-3.5 w-3.5" />
            Looking…
          </>
        ) : (
          <>
            <BinocularsIcon />
            {hasTips ? "Check for pro tips again" : "Check for pro tips"}
          </>
        )}
      </button>

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

      {problem ? (
        <p
          role="alert"
          className="mt-1.5 text-[0.78rem] leading-snug text-rose"
        >
          {problem}
        </p>
      ) : busy ? (
        <p
          aria-live="polite"
          className="mt-1.5 text-[0.78rem] leading-snug text-ink-soft"
        >
          {note || "Looking…"}
          {elapsed ? ` \u00b7 ${elapsed}s` : ""}
        </p>
      ) : note ? (
        <p
          aria-live="polite"
          className="mt-1.5 text-[0.78rem] leading-snug text-ink-soft"
        >
          {note}
        </p>
      ) : (
        /* One line, not the paragraph a heading over an empty card used to
           carry: in a column this narrow the sentence was taller than the
           button it explained. Off the phone entirely, where it would push
           the tab bar down for no gain. */
        <p className="mt-1.5 hidden text-[0.78rem] leading-snug text-ink-soft sm:block">
          Runs while you carry on reading.
        </p>
      )}

      {/* The tabs a look actually filed something against. The button can be
          pressed from any tab now, so a count with no way to reach what it
          counted is worse here than it was on the Tips tab. */}
      {!busy && onGo && landed.length ? (
        <div className="no-print mt-1.5 flex flex-wrap gap-1.5">
          {landed.map((place) => (
            <button
              key={place.tab}
              type="button"
              onClick={() => onGo(place.tab)}
              className="btn-ghost px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em]"
            >
              {`Open ${place.label.replace(/^the /, "")}`}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
