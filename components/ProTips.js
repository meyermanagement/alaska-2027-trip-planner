"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { announceTipResolved, onTipResolved } from "@/lib/tips/cleared";
import { useRouter } from "next/navigation";
import { compareTips, lookedToday, tipWhen } from "@/lib/tips/tip";
import { lookOpening, lookSummary, runLook } from "@/lib/tips/run";
import { formatFullDay } from "@/lib/format";
import { offerDate, offerHost } from "@/lib/rewards-offers";
import { Spinner } from "./LinkPending";
import { ChevronDisc } from "./ChevronDisc";
import { BinocularsIcon } from "./Icons";
import { mayWrite } from "@/lib/travelers/allowed";
import { SECONDARY } from "@/lib/travelers/access";

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
  // The terms behind any of these tips that came from a welcome offer, keyed by
  // the tip they produced. Two things need them: the line saying where the offer
  // was read and when it ends, and the button that turns it down on those terms
  // rather than merely clearing the sentence.
  offers = [],
  today,
  tripId,
  scope = "trip",
  itemId = null,
  // Whether this place has ever been looked at, which is the difference between
  // "no tips" and "no tips yet" — two states that deserve different words.
  everLooked = false,
  // Whether opening this screen should run the look on its own, rather than
  // waiting to be asked. Off everywhere by default, and on where the screen
  // itself is the reason to look: the Wallet, which the family opens to find out
  // whether a credit is going unused or points are about to lapse, and where
  // asking them to remember a button is asking them to remember the thing the
  // screen was supposed to notice for them.
  //
  // Held to once a day by lastLookedAt below, the same gate the trip page uses.
  // A look is two grounded model calls here and most of a minute; running it on
  // every open would spend the day's budget re-answering breakfast.
  autoLook = false,
  // When a look last ran here, so the once-a-day gate can be judged against the
  // reader's own midnight rather than the server's.
  lastLookedAt = null,
  // What one press of the button should cover. A trip-level look is worth walking
  // the whole trip — the trip itself, the packing list, the next few bookings —
  // because nobody is going to press a button on thirty itinerary cards. Left
  // empty it just looks at this one scope.
  chain = null,
  heading = "Pro tips",
  // Whether this place can be looked at at all. A trip can; so can the Wallet,
  // which has no trip behind it; an itinerary card cannot, because a trip has
  // thirty of them and the trip-level look already walks the bookings.
  canLook = undefined,
  // What to say when there is nothing. The default talks about dates and plans,
  // which is right on a trip and wrong in the Wallet.
  emptyLooked = "Nothing worth flagging here at the moment. Tips only appear when there is something specific to say about your dates, your plans, or what you have told the app you like.",
  emptyFresh = "Nothing here yet. Ask for a look and anything genuinely useful about these particular plans will show up.",
  // Whether to stay on screen with nothing to show. Normally an empty section
  // with no button is furniture, so it goes; the trip's Tips tab is the
  // exception, because it is a tab somebody chose to open and a tab that renders
  // nothing at all reads as broken. Its button now lives in the header above it,
  // so the empty wording has somewhere to point.
  showEmpty = false,
  compact = false,
  // Handed the breakdown when a look finishes, so the screen that owns the button
  // can say where the tips went. A trip look writes to three tabs, and the tab it
  // was pressed on is usually not the one that changed most.
  onLooked = null,
  // Where to send somebody who wants to read the tips that did not land here.
  // Given a tab id; the trip page switches tabs. Left off, the breakdown is still
  // said, just not pressable.
  onGo = null,
  // The date of the thing these tips are about, when they hang off something
  // dated — an itinerary item. A tip with no deadline of its own is read and
  // sorted against this rather than being filed under "later".
  relatedDate = null,
  // A secondary traveler does not see advice at all. Every button on a tip --
  // Check for pro tips, Remind me, Clear -- writes, and the database refuses all three
  // without raising an error, so they would look like they worked. But a tip with
  // its buttons taken off is worse than no tip: it is a list of things somebody
  // else has to do, shown to the one person in the household who cannot do any of
  // them, and clearing it is how a tip is meant to leave. So the whole card goes.
  readOnly = false,
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
  // Which places the last look actually filed something against. Kept so the
  // sentence under the button can name them, and so the tabs that changed can be
  // opened from here -- the tab a look is started on is usually not the one that
  // changed most, and a screen reporting "6 tips" while showing two of them is a
  // screen answering a question nobody asked.
  const [landed, setLanded] = useState([]);
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef(0);
  const autoRanRef = useRef(false);

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

  const offerByTip = useMemo(
    () =>
      new Map((offers || []).filter((o) => o.tip_id).map((o) => [o.tip_id, o])),
    [offers],
  );

  // Cleared from the band at the top of the screen. The write is already done up
  // there; this is only the card catching up.
  useEffect(
    () =>
      onTipResolved((id, status) =>
        setGone((prev) => {
          if (status) return { ...prev, [id]: status };
          const next = { ...prev };
          delete next[id];
          return next;
        }),
      ),
    [],
  );

  const resolve = useCallback(async (tip, status) => {
    setProblem("");
    setGone((prev) => ({ ...prev, [tip.id]: status }));
    announceTipResolved(tip.id, status);
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
      announceTipResolved(tip.id, null);
      setProblem("That did not save. It is still here — try again.");
    }
  }, []);

  // "Not this card." One write, to the offer, and the route moves the tip that
  // carried the terms along with it. Deliberately not resolve() above: that
  // writes 'cleared', which is the sentence being read, and a refusal is a
  // different fact about the family that belongs on the offers side of the
  // record. Returns whether it stuck, so the button can come back if it did not.
  const refuse = useCallback(
    async (tip, offer) => {
      setProblem("");
      setGone((prev) => ({ ...prev, [tip.id]: "declined" }));
      announceTipResolved(tip.id, "declined");
      try {
        const res = await fetch(`/api/offers/${offer.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "declined" }),
        });
        if (!res.ok) throw new Error();
        // So the refusal appears under History, and its count on the tab, without
        // waiting for the next visit.
        router.refresh();
        return true;
      } catch {
        // Put the card back. A refusal that was never filed and a card that
        // vanished anyway is the worst of both: the reader believes the app has
        // been told, and the next look offers the same terms again.
        setGone((prev) => {
          const next = { ...prev };
          delete next[tip.id];
          return next;
        });
        announceTipResolved(tip.id, null);
        setProblem("That did not save. The card is still here — try again.");
        return false;
      }
    },
    [router],
  );

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
    announceTipResolved(tip.id, "cleared");
    try {
      const res = await fetch(`/api/tips/${tip.id}/task`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "");
      setNote(
        body?.task?.due_date
          ? // formatFullDay, not the raw column: this sentence is read by a person
            // and 2026-09-21 in the middle of one is a serial number. The year is
            // kept because a booking window can open in a different year from the
            // trip it belongs to.
            `On the checklist, due ${formatFullDay(body.task.due_date)}. The morning email will say so.`
          : "On the checklist. The morning email will say so.",
      );
    } catch (err) {
      setGone((prev) => {
        const next = { ...prev };
        delete next[tip.id];
        return next;
      });
      announceTipResolved(tip.id, null);
      setProblem(
        err?.message || "Could not add that to the checklist. Try again.",
      );
    }
  }, []);

  const look = useCallback(async () => {
    setBusy(true);
    setProblem("");
    const steps = chain && chain.length ? chain : [{ scope, itemId }];
    // Named for where it is going, so the wait says something about this trip
    // rather than about the software. See lookOpening.
    const opening = lookOpening(steps);
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
      opening,
    });
    // Said out loud, because a look that takes twenty seconds and says so reads as
    // work being done, while the same twenty seconds in silence reads as broken.
    const took = tookMs ? ` (${Math.max(1, Math.round(tookMs / 1000))}s)` : "";
    // Whatever was found is already saved, so ask the server for the list again
    // either way — a look that stopped halfway still has something to show.
    if (found) router.refresh();
    // Worked out before the early return on error, because a look that stopped
    // halfway still filed what it found and the person who waited deserves to
    // know where it went.
    const summary = lookSummary({ byScope: byScope || {} });
    // Only places somebody can actually be sent to, and never the one they are
    // already standing on.
    setLanded(
      summary.places.filter((place) => place.tab && place.tab !== scope),
    );
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
    setLooked(true);
    setNote(
      found
        ? // Broken out by place when the look covered several. One press here
          // walks the trip, the packing list and the next few bookings, and a
          // bare total leaves the two tabs that changed looking untouched.
          `${summary.said}${took}`
        : // "Nothing worth telling you" is a claim about the world. When the
          // server says it never got as far as the world -- an empty Wallet, for
          // instance -- its words are the true ones.
          said || `Nothing worth telling you right now${took}.`,
    );
    setBusy(false);
    setProgress(null);
  }, [chain, scope, itemId, tripId, router, onLooked]);

  // Producing a tip is refused by policy for a secondary traveler, so the button
  // is not offered rather than offered and swallowed.
  const canLookHere = mayWrite(readOnly ? SECONDARY : null, "tripTips");

  // Whether pressing anything here would do something. A trip's Tips tab and the
  // Wallet own the Look button; the packing list and an itinerary card are told
  // about tips found elsewhere and have no button of their own.
  const offersLook = Boolean(
    (canLook ?? Boolean(tripId)) && !compact && canLookHere,
  );

  // The same look the button runs, started on its own, once per visit. The ref
  // is what keeps it once: this component is remounted by a route change but
  // re-rendered constantly, and a look that fires twice costs twice.
  useEffect(() => {
    if (!autoLook) return;
    if (!offersLook) return;
    if (autoRanRef.current) return;
    if (busy) return;
    if (lookedToday(lastLookedAt)) return;
    autoRanRef.current = true;
    look();
  }, [autoLook, offersLook, busy, lastLookedAt, look]);

  // After the hooks, so a person's level changing does not change how many of
  // them run.
  //
  // Nothing found, and no button to go and find any: then there is nothing to
  // say, and a heading over a sentence explaining that nothing was said is just
  // a paragraph of furniture above the thing you came to read. The section goes
  // entirely. Where the Look button does live the empty wording stays, because
  // there it is telling you what the button is for.
  //
  // A secondary traveler sees the tips that exist. Hiding the section when there
  // are some took the advice away from the person most likely to need telling --
  // what the dress code is, which door to use, what the park will not let you
  // carry -- to protect a dismiss button that is gated separately a few lines
  // down. This hides the empty case only.
  if (!shown.length && !offersLook && !showEmpty && !busy && !note && !problem)
    return null;

  return (
    <section
      aria-label={heading}
      className={compact ? "mt-3 mb-3" : "card mb-5 p-5"}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.09em] text-ink-soft">
          {heading}
          {shown.length > 1 ? ` · ${shown.length}` : ""}
        </h3>
        {/* No button on an itinerary card. A trip has thirty of them and nobody
            is pressing thirty buttons — the look at trip level walks the
            bookings as well. */}
        {/* No Look button for a secondary traveler, and this one is the database's
            decision rather than a preference: pro_tips carries a
            pro_tips_no_secondary_insert policy, so a look by Veda would run the
            grounded search, cost money and save nothing. Measured, not assumed --
            the same probe found item_insights has no such policy, which is why the
            day research is offered to her and this is not. See
            lib/travelers/allowed.js. */}
        {offersLook ? (
          <button
            type="button"
            onClick={look}
            disabled={busy}
            className="btn btn-primary btn-sm disabled:opacity-70"
          >
            {/* The same button as the one on a trip screen, down to the
                binoculars: it is the same press, and the Wallet had it drawn as
                a small uppercase ghost, which read as a caption rather than the
                one thing on the page worth waiting for. The spinner takes the
                icon's place so the button keeps its width mid-look. */}
            {busy ? (
              <>
                <Spinner className="h-3.5 w-3.5" />
                Looking…
              </>
            ) : (
              <>
                <BinocularsIcon />
                {shown.length
                  ? "Check for pro tips again"
                  : "Check for pro tips"}
              </>
            )}
          </button>
        ) : null}
      </div>

      {problem ? (
        <p role="alert" className="mb-2 text-sm text-rose">
          {problem}
        </p>
      ) : null}
      {busy ? (
        <div className="mb-3">
          <p
            aria-live="polite"
            className="flex items-center gap-2 text-sm text-ink-soft"
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
        <div className="mb-2">
          <p aria-live="polite" className="text-sm text-ink-soft">
            {note}
          </p>
          {/* Directly under the sentence that names them, and directly under the
              button that filled them in. A panel of links to the tabs that
              changed, rendered at the bottom of a card that may be holding six
              tips, is a panel nobody scrolls to. */}
          {onGo && landed.length ? (
            <div className="no-print mt-1.5 flex flex-wrap gap-2">
              {landed.map((place) => (
                <button
                  key={place.tab}
                  type="button"
                  onClick={() => onGo(place.tab)}
                  className="btn btn-ghost px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em]"
                >
                  {`Open ${place.label.replace(/^the /, "")}`}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {shown.length ? (
        <ul className="space-y-3">
          {shown.map((tip) => (
            <TipCard
              key={tip.id}
              tip={tip}
              today={today}
              offer={offerByTip.get(tip.id) || null}
              onResolve={readOnly ? null : resolve}
              onRefuse={readOnly ? null : refuse}
              onTask={readOnly || !tip.trip_id ? null : makeTask}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed text-ink-soft">
          {looked ? emptyLooked : emptyFresh}
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

// A tip, shut. Six tips open at once is most of a screen, and a tip is a
// paragraph, a reason and two links -- worth reading once and then in the way.
// So the title and its date carry the tip, and the rest is a tap away: enough to
// decide whether to open it, and the urgent ones are said again in the band at
// the top of every screen regardless. Every one of them starts shut, including
// the first: an opened tip is four or five lines deep, so the one that happened
// to be first pushed the second and third headline off a phone screen and made
// the list look like one tip rather than six. What a tip is, is obvious from the
// first tap; what a screen holds is not obvious if the top of it is filled.
//
// Because nothing is open on arrival, the chevron has to carry the whole
// invitation, which is what ChevronDisc is: a tinted disc in the accent color,
// shared with the record of cleared tips under this list so the two kinds of tip
// cannot end up opening differently.
//
// The body is in the tree either way and hidden with a class rather than
// unmounted, so printing a trip prints every tip in full.
function TipCard({ tip, today, offer, onResolve, onRefuse, onTask }) {
  const [open, setOpen] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const when = tipWhen(tip, today);
  const sources = Array.isArray(tip.sources) ? tip.sources.slice(0, 3) : [];

  return (
    <li className="rounded-xl border border-[var(--line)] bg-white/70">
      {/* The whole header is the target, so a thumb does not have to find a
          chevron. The label sits above the title rather than beside it: beside
          it looks tidier on a laptop and squeezes the title into a column two
          words wide on a phone, which is where most of this will be read. */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className={`chip border ${TONES[when.tone] || TONES.quiet}`}>
            {when.label}
          </span>
          <span className="mt-1.5 block font-semibold leading-snug text-ink">
            {tip.title}
          </span>
        </span>
        <ChevronDisc open={open} />
      </button>

      <div className={open ? "px-4 pb-4" : "hidden px-4 pb-4 print:block"}>
        <p className="text-base leading-relaxed text-ink-soft">{tip.body}</p>
        {tip.because ? (
          <p className="mt-2 border-l-2 border-teal/30 pl-3 text-sm leading-relaxed text-ink-faint">
            Why you: {tip.because}
          </p>
        ) : null}
        {sources.length && !offer ? (
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
        {offer ? (
          // Where the terms came from and when they stop being true. An offer
          // read off a page in September is a claim about September, and saying
          // the date out loud is the difference between advice and a rumour.
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            Read from{" "}
            {offer.source_url ? (
              <a
                href={offer.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
              >
                {offerHost(offer.source_url)}
              </a>
            ) : (
              "the issuer's page"
            )}{" "}
            on {offerDate(offer.verified_on)}
            {offer.offer_ends_on
              ? `, and the offer ends ${offerDate(offer.offer_ends_on)}`
              : ""}
            . Check the issuer&rsquo;s own application page before you apply.
          </p>
        ) : null}
        {onTask || (offer ? onRefuse : onResolve) ? (
          <div className="no-print mt-3 flex flex-wrap gap-2">
            {onTask ? (
              <button
                type="button"
                onClick={() => onTask(tip)}
                className="btn btn-ghost px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em]"
              >
                Remind me
              </button>
            ) : null}
            {/* No Clear on an offer. Clear says "I have read this", which is not
                a thing anybody wants recorded about a card they were shown --
                the only two useful answers are opening it and not opening it on
                these terms, and the second one has its own button below. Two
                buttons that both make the card go away, filing the same decision
                under two different headings, is how the Delta offer ended up in
                the refusals and the cleared tips at once. */}
            {onResolve && !offer ? (
              <button
                type="button"
                onClick={() => onResolve(tip, "cleared")}
                className="btn btn-ghost px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em]"
              >
                Clear
              </button>
            ) : null}
            {offer && onRefuse ? (
              // The only answer this card takes. It says "not on these terms",
              // and the app remembers the terms, so the same card does not come
              // round again unless the bonus goes up, the spending goes down or
              // the fee does. One press, one write: the route files the refusal
              // against the terms and moves the tip with it, so nothing here has
              // to clear the tip separately.
              <button
                type="button"
                disabled={refusing}
                onClick={async () => {
                  setRefusing(true);
                  const ok = await onRefuse(tip, offer);
                  if (!ok) setRefusing(false);
                }}
                className="btn btn-ghost px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] disabled:opacity-60"
              >
                {refusing ? "Noting it…" : "Not this card"}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
