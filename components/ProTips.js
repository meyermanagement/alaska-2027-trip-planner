"use client";

import { useCallback, useMemo, useState } from "react";
import { tipWhen } from "@/lib/tips/tip";
import { runLook } from "@/lib/tips/run";

/**
 * A tip, and the two ways of being done with it.
 *
 * Clear means read and dealt with. Ignore means not for us. They look almost the
 * same on screen and they are not the same thing: the ignored ones are kept in a
 * list at the bottom of Reminders, because the reason a tip was wrong in August
 * may have stopped being true by March, and because a family should be able to
 * check what the app decided not to bother them about twice.
 *
 * Both are optimistic. The tip goes the moment it is pressed and comes back with
 * an apology if the save failed, because waiting on a round trip to make
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
}) {
  const [tips, setTips] = useState(initial);
  const [gone, setGone] = useState({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [problem, setProblem] = useState("");
  const [looked, setLooked] = useState(everLooked);

  const shown = useMemo(
    () => tips.filter((tip) => !gone[tip.id]),
    [tips, gone],
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
  const look = useCallback(async () => {
    setBusy(true);
    setProblem("");
    const steps = chain && chain.length ? chain : [{ scope, itemId }];
    const { found, error } = await runLook({
      tripId,
      steps,
      onNote: setNote,
    });
    if (error) {
      setProblem(error);
      setNote(
        found ? `${found} found before that stopped. Reload to read them.` : "",
      );
      setBusy(false);
      return;
    }
    setLooked(true);
    setNote(
      found
        ? found === 1
          ? "One tip. Reload to read it."
          : `${found} tips. Reload to read them.`
        : "Nothing worth telling you right now.",
    );
    setBusy(false);
  }, [chain, scope, itemId, tripId]);

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
            {busy ? "Looking…" : shown.length ? "Look again" : "Look for tips"}
          </button>
        ) : null}
      </div>

      {problem ? (
        <p role="alert" className="mb-2 text-[0.82rem] text-rose">
          {problem}
        </p>
      ) : null}
      {note ? (
        <p aria-live="polite" className="mb-2 text-[0.82rem] text-ink-soft">
          {note}
        </p>
      ) : null}

      {shown.length ? (
        <ul className="space-y-3">
          {shown.map((tip) => (
            <TipCard key={tip.id} tip={tip} today={today} onResolve={resolve} />
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

function TipCard({ tip, today, onResolve }) {
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
        <button
          type="button"
          onClick={() => onResolve(tip, "cleared")}
          className="btn-ghost px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em]"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => onResolve(tip, "ignored")}
          className="px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-ink-faint underline decoration-transparent underline-offset-2 transition hover:text-ink-soft hover:decoration-ink-faint"
        >
          Ignore
        </button>
      </div>
    </li>
  );
}
