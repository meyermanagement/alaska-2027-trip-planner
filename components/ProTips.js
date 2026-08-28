"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { compareTips, tipWhen } from "@/lib/tips/tip";
import { runLook } from "@/lib/tips/run";
import { Spinner } from "./LinkPending";

/**
 * A tip, and the two things worth doing with one.
 *
 * Either it is worth remembering — Remind me turns it into a dated task the
 * morning email will chase — or you are done with it, which is Clear. There used
 * to be an Ignore alongside Clear, drawing a distinction between "read it" and
 * "not for us" that nobody pressing a button actually feels. So there is one
 * dismiss now, and it behaves the way the kinder of the two behaved: cleared tips
 * are kept in a list at the bottom of Reminders and can be brought back, because
 * the reason a tip was wrong in August may have stopped being true by March.
 *
 * Clearing is optimistic. The tip goes the moment it is pressed and comes back
 * with an apology if the save failed, because waiting on a round trip to make
 * something disappear feels like the button did not work.
 */
export default function ProTips({
  tips: initial = [],
  today,
  tripId,
  scope = "trip",
  itemId = null,
  // Whether this place has ever been looked at, which is the difference between
  // "no tips" and "no tips yet" — two states that deserve different words.
  everLooked = false,
  // What one press of the button should cover. A trip-level look is worth walking
  // the whole trip — the trip itself, the packing list, the next few bookings —
  // because nobody is going to press a button on thirty itinerary cards. Left
  // empty it just looks at this one scope.
  chain = null,
  heading = "Pro tips",
  compact = false,
  // The date of the thing these tips are about, when they hang off something
  // dated — an itinerary item. A tip with no deadline of its own is read and
  // sorted against this rather than being filed under "later".
  relatedDate = null,
}) {
  const router = useRouter();
  const [tips, setTips] = useState(initial);
  const [gone, setGone] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [looked, setLooked] = useState(everLooked);
  // A look is the slowest thing in the app — five grounded model calls, most of a
  // minute on a bad day — so it has to keep proving it is alive. A turning ring, a
  // bar that fills a fifth at a time, and a second count that climbs are three
  // different ways of saying the same thing, and between them nobody has to guess
  // whether the button worked.
  const [progress, setProgress] = useState(null); // null | {done, total}
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(0);

  // A look writes its tips to the database, not to this component, so the way
  // they arrive on screen is the server sending the list down again. That only
  // helps if this list follows the props it was given: holding the first render
  // in state forever is what used to make a reload necessary to read a tip that
  // had already been found and saved.
  useEffect(() => {
    setTips(initial);
  }, [initial]);

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

  // Soonest first. They arrive in the order they were found, which is the order
  // a model happened to say them in and means nothing to anyone reading.
  const shown = useMemo(
    () =>
      tips
        .filter((tip) => !gone[tip.id])
        .map((tip) =>
          relatedDate && !tip.act_by
            ? { ...tip, related_date: relatedDate }
            : tip,
        )
        .sort(compareTips),
    [tips, gone, relatedDate],
  );

  const resolve = useCallback(async (tip, status) => {
    setProblem("");
    setGone((prev) => ({ ...prev, [tip.id]: status }));
    try {
      const res = await fetch(`/api/tips/${tip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setGone((prev) => {
        const next = { ...prev };
        delete next[tip.id];
        return next;
      });
      setProblem("That did not save. It is still here — try again.");
    }
  }, []);

  // One press, several questions. The loop lives in lib/tips/run.js because Aly
  // drives the same one when she decides to go and look herself.
  // "Remind me about this." A tip and a task promise different things: a tip is
  // worth knowing and then goes quiet either way, while a task is the app
  // agreeing to chase you every morning until it is ticked off. Turning one over
  // clears the tip, because the same sentence in two places, one of which nags,
  // is how a checklist stops being trusted.
  const makeTask = useCallback(async (tip) => {
    setProblem("");
    setGone((prev) => ({ ...prev, [tip.id]: "cleared" }));
    try {
      const res = await fetch(`/api/tips/${tip.id}/task`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "");
      setNote(
        body?.task?.due_date
          ? `On the checklist, due ${body.task.due_date}. The morning email will say so.`
          : "On the checklist. The morning email will say so.",
      );
    } catch (err) {
      setGone((prev) => {
        const next = { ...prev };
        delete next[tip.id];
        return next;
      });
      setProblem(
        err?.message || "Could not add that to the checklist. Try again.",
      );
    }
  }, []);

  const look = useCallback(async () => {
    setBusy(true);
    setProblem("");
    const steps = chain && chain.length ? chain : [{ scope, itemId }];
    const { found, error, tookMs } = await runLook({
      tripId,
      steps,
      onNote: setNote,
      onProgress: setProgress,
    });
    // Said out loud, because a look that takes twenty seconds and says so reads as
    // work being done, while the same twenty seconds in silence reads as broken.
    const took = tookMs ? ` (${Math.max(1, Math.round(tookMs / 1000))}s)` : "";
    // Whatever was found is already saved, so ask the server for the list again
    // either way — a look that stopped halfway still has something to show.
    if (found) router.refresh();
    if (error) {
      setProblem(error);
      setNote(found ? `${found} found before that stopped${took}.` : "");
      setBusy(false);
      setProgress(null);
      return;
    }
    setLooked(true);
    setNote(
      found
        ? found === 1
          ? `One tip${took}.`
          : `${found} tips${took}.`
        : `Nothing worth telling you right now${took}.`,
    );
    setBusy(false);
    setProgress(null);
  }, [chain, scope, itemId, tripId, router]);

  if (!shown.length && compact && looked) return null;

  return (
    <section
      aria-label={heading}
      className={compact ? "mb-3" : "card mb-5 p-5"}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.09em] text-ink-soft">
          {heading}
          {shown.length > 1 ? ` · ${shown.length}` : ""}
        </h3>
        {/* No button on an itinerary card. A trip has thirty of them and nobody
            is pressing thirty buttons — the look at trip level walks the
            bookings as well. */}
        {tripId && !compact ? (
          <button
            type="button"
            onClick={look}
            disabled={busy}
            className="btn-ghost px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] disabled:opacity-50"
          >
            {busy ? (
              <span className="flex items-center gap-1.5">
                <Spinner className="h-3.5 w-3.5" />
                Looking…
              </span>
            ) : shown.length ? (
              "Look again"
            ) : (
              "Look for tips"
            )}
          </button>
        ) : null}
      </div>

      {problem ? (
        <p role="alert" className="mb-2 text-[0.82rem] text-rose">
          {problem}
        </p>
      ) : null}
      {busy ? (
        <div className="mb-3">
          <p
            aria-live="polite"
            className="flex items-center gap-2 text-[0.82rem] text-ink-soft"
          >
            <Spinner className="h-4 w-4 shrink-0 text-teal" />
            <span>
              {note || "Looking…"}
              {elapsed ? ` · ${elapsed}s` : ""}
            </span>
          </p>
          {/* The bar is both: a fill for how many places are done, and a shimmer
              across the rest so the middle of a check still moves. */}
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
        </div>
      ) : note ? (
        <p aria-live="polite" className="mb-2 text-[0.82rem] text-ink-soft">
          {note}
        </p>
      ) : null}

      {shown.length ? (
        <ul className="space-y-3">
          {shown.map((tip) => (
            <TipCard
              key={tip.id}
              tip={tip}
              today={today}
              onResolve={resolve}
              onTask={tip.trip_id ? makeTask : null}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[0.86rem] leading-relaxed text-ink-soft">
          {looked
            ? "Nothing worth flagging here at the moment. Tips only appear when there is something specific to say about your dates, your plans, or what you have told the app you like."
            : "Nothing here yet. Ask for a look and anything genuinely useful about these particular plans will show up."}
        </p>
      )}
    </section>
  );
}

const TONES = {
  late: "border-rose/40 bg-rose/10 text-rose",
  now: "border-amber/40 bg-amber/10 text-amber",
  soon: "border-teal/30 bg-teal-soft text-teal",
  quiet: "border-[var(--line)] bg-white text-ink-faint",
};

function TipCard({ tip, today, onResolve, onTask }) {
  const when = tipWhen(tip, today);
  const sources = Array.isArray(tip.sources) ? tip.sources.slice(0, 3) : [];

  return (
    <li className="rounded-xl border border-[var(--line)] bg-white/70 p-4">
      {/* The label above the title rather than beside it. Beside it looks tidier
          on a laptop and squeezes the title into a column two words wide on a
          phone, which is where most of this will be read. */}
      <span className={`chip border ${TONES[when.tone] || TONES.quiet}`}>
        {when.label}
      </span>
      <h4 className="mt-1.5 font-semibold leading-snug text-ink">
        {tip.title}
      </h4>
      <p className="mt-1.5 text-[0.9rem] leading-relaxed text-ink-soft">
        {tip.body}
      </p>
      {tip.because ? (
        <p className="mt-2 border-l-2 border-teal/30 pl-3 text-[0.8rem] leading-relaxed text-ink-faint">
          Why you: {tip.because}
        </p>
      ) : null}
      {sources.length ? (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.75rem]">
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
      <div className="no-print mt-3 flex flex-wrap gap-2">
        {onTask ? (
          <button
            type="button"
            onClick={() => onTask(tip)}
            className="btn-ghost px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em]"
          >
            Remind me
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onResolve(tip, "cleared")}
          className="btn-ghost px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em]"
        >
          Clear
        </button>
      </div>
    </li>
  );
}
