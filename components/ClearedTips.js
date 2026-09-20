"use client";

import { useCallback, useEffect, useState } from "react";
import { announceTipResolved } from "@/lib/tips/cleared";
import { ChevronDisc } from "./ChevronDisc";
import ClearedTipSearch from "./ClearedTipSearch";
import ClearedTipCheck from "./ClearedTipCheck";

/**
 * The tips you have put away, kept where they can be found again.
 *
 * Shut by default and under the advice it is a record of, because that is what
 * it is for: a record rather than a screen. Nothing is fetched until it is
 * opened, so the list costs nothing on the days nobody wonders.
 *
 * Worth keeping at all because clearing a tip is a judgement about a moment. "We
 * are not driving that road" is true until the itinerary changes; "we already have
 * a converter" is true until it is left in a drawer. Six months on, the list is
 * the only way to find out what the app stopped mentioning.
 *
 * It sat at the bottom of Reminders until now, once, listing every tip the
 * household had ever cleared with the trip named beside each line. Which put the
 * one place you could look something up on the one screen it had nothing to do
 * with, and made the list longer every month whether or not you were thinking
 * about any of the trips in it. It now sits on the trip whose tips it holds, and
 * in the Wallet for the Wallet's. Recent records stay local to that screen;
 * an explicit search can find older advice within that same trip or Wallet.
 *
 * It used to list only the tips pressed with Ignore, back when Clear and Ignore
 * were different buttons. They are one button now, and it lists everything put
 * away either way.
 *
 * Each line inside it is shut too, the way a live tip on the Tips tab is, and for
 * a stronger version of the same reason: a record only grows, so a year in this
 * is twenty paragraphs behind one summary rather than six. The title, the screen
 * it was cleared on and the day it was cleared carry the row -- enough to find
 * the one you came looking for -- and the advice itself, its reason and the
 * button that brings it back are a tap further in.
 */

// Where a cleared tip was cleared, in the words the app uses for those screens
// elsewhere. Worth saying because a trip's record covers every tab: a line about
// the ferry and a line about the suitcase read as the same kind of thing once
// they are both in a list, and the difference is the only clue to where it will
// reappear if you bring it back. "trip" says nothing, because a tip filed on the
// trip itself came from the tab this list is sitting on.
const CAME_FROM = {
  item: "Itinerary",
  packing: "Packing",
  daypack: "Day packs",
  offers: "Welcome offers",
};

// The day a tip was put away, which is most of what somebody is looking for when
// they open this: a line cleared the week the itinerary changed means something
// different from one cleared a year ago. Said on the row itself rather than in
// the body, because with every row shut it is the only thing besides the title
// that distinguishes them, and it is what the list is in order of.
function clearedOn(value) {
  if (!value) return "";
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return "";
  return when.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// One cleared tip, shut. The same shape a live tip has on the Tips tab, for the
// same reason: a tip is a paragraph, a reason and a button, and a record of
// twenty of them opened all at once is a wall rather than a list. The title and
// the two things that place it -- where it was cleared and when -- carry the
// row, and the rest is a tap away.
//
// It is quieter than a live tip throughout, in the softer inks rather than the
// body's own: these are the tips the household has already decided against, and
// they should not compete with the advice above them for the same eye.
function ClearedCard({ tip, onRestore }) {
  const [open, setOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const from = CAME_FROM[tip.scope];
  const on = clearedOn(tip.resolved_at);
  const said = [tip.trips?.name || (tip.scope === "wallet" || tip.scope === "offers" ? "Wallet" : ""), from, on].filter(Boolean).join(" · ");

  return (
    <li className="rounded-xl border border-[var(--line)] bg-white/60">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <span className="min-w-0 flex-1">
          {said ? (
            <span className="block text-2xs font-semibold uppercase tracking-[0.06em] text-ink-faint">
              {said}
            </span>
          ) : null}
          <span className="mt-1.5 block font-semibold leading-snug text-ink-soft">
            {tip.title}
          </span>
        </span>
        <ChevronDisc open={open} quiet />
      </button>

      <div className={open ? "px-4 pb-4" : "hidden px-4 pb-4 print:block"}>
        {tip.matchReason && <p className="mb-3 text-sm text-teal">{tip.matchReason}</p>}
        <p className="mb-2 text-xs font-semibold text-ink-soft">Original advice · Not rechecked</p>
        <p className="text-sm leading-relaxed text-ink-soft">{tip.body}</p>
        {tip.because ? (
          <p className="mt-2 border-l-2 border-[var(--line)] pl-3 text-sm leading-relaxed text-ink-soft">
            Why you: {tip.because}
          </p>
        ) : null}
        <button
          type="button"
          disabled={restoring}
          onClick={async () => { if (restoring) return; setRestoring(true); try { await onRestore(tip); } finally { setRestoring(false); } }}
          className="btn btn-ghost no-print mt-3 px-3 py-1 text-2xs font-semibold uppercase tracking-[0.06em]"
        >
          {restoring ? "Restoring…" : "Bring it back"}
        </button>
        <ClearedTipCheck tip={tip} />
      </div>
    </li>
  );
}

export default function ClearedTips({
  // Which record to show: one trip's, or the Wallet's. Exactly one of these.
  tripId = null,
  wallet = false,
  // Without the disclosure around it, for a surface that is already the record
  // -- the Wallet's History tab. On a trip the list sits under the live advice
  // and has to ask before it takes up room; on a tab you opened on purpose,
  // making you press a second time to see the only thing there would be a door
  // in front of a door. The rows inside stay shut either way.
  bare = false,
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setProblem("");
    try {
      const query = wallet ? "wallet=1" : `trip=${encodeURIComponent(tripId)}`;
      const res = await fetch(`/api/tips/cleared?${query}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "");
      setRows(json.tips || []);
    } catch {
      setProblem("Could not fetch those. Try opening it again.");
    }
    setBusy(false);
  }, [tripId, wallet]);

  const restore = useCallback(async (tip) => {
    // If it was cleared a minute ago and this is somebody taking it back, the
    // card and the band still have it in hand and only need telling to show it
    // again. If it was cleared last month they never had it, and nothing short of
    // a reload can put it back -- which is fine, because that is not the case
    // anybody is anxious about.
    try {
      const res = await fetch(`/api/tips/${tip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) throw new Error();
      setRows((prev) => (prev || []).filter((row) => row.id !== tip.id));
      announceTipResolved(tip.id, null);
      setProblem("");
      return true;
    } catch {
      setProblem("That did not save. It is still here.");
      return false;
    }
  }, []);

  if (!tripId && !wallet) return null;

  // Bare: nothing to press, so nothing waits to be asked. The fetch runs on
  // mount, and the tab that holds this only mounts it the first time somebody
  // goes there, so the cost is still paid once and only by whoever wanted it.
  if (bare) {
    return (
      <section className="no-print">
        <h2 className="font-display text-lg font-semibold">
          Tips you have cleared
        </h2>
        <div className="mt-3">
          <Record
            busy={busy}
            problem={problem}
            rows={rows}
            wallet={wallet}
            tripId={tripId}
            onLoad={load}
            onRestore={restore}
          />
        </div>
      </section>
    );
  }

  return (
    <details
      className="no-print mt-8 border-t border-[var(--line)] pt-5"
      onToggle={(event) => {
        const isOpen = event.currentTarget.open;
        setOpen(isOpen);
        if (isOpen && rows === null && !busy) load();
      }}
    >
      <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.09em] text-ink-faint transition hover:text-ink-soft">
        {open ? "Hide" : "Show"} tips you have cleared
      </summary>

      <div className="mt-4">
        <Record
          busy={busy}
          problem={problem}
          rows={rows}
          wallet={wallet}
          tripId={tripId}
          onRestore={restore}
        />
      </div>
    </details>
  );
}

// The list itself, which is the same whether a disclosure opened it or a tab
// did. onLoad is passed only by the bare version, which has nothing to press and
// so has to fetch for itself.
function Record({ busy, problem, rows, wallet, tripId, onLoad = null, onRestore }) {
  useEffect(() => {
    if (onLoad) onLoad();
  }, [onLoad]);

  return (
    <>
      {problem ? (
        <p role="alert" className="text-sm text-rose">
          {problem}
        </p>
      ) : null}
      {busy && rows === null ? (
        <p className="text-sm text-ink-soft">Fetching…</p>
      ) : null}
      <ClearedTipSearch key={wallet ? "wallet" : tripId} tripId={tripId} wallet={wallet} onRestore={onRestore}
        renderTip={(tip, restore) => <ClearedCard key={tip.id} tip={tip} onRestore={restore} />}>
      {rows && !rows.length ? (
        <p className="text-sm leading-relaxed text-ink-soft">
          {wallet
            ? "Nothing cleared here yet. Anything you clear in the Wallet ends up here, in case it stops being wrong, and can be brought back."
            : "Nothing cleared on this trip yet. Anything you clear — here, on the Itinerary, or on the packing list — ends up here, in case it stops being wrong, and can be brought back."}
        </p>
      ) : null}
      {rows && rows.length ? (
        <><p className="mb-3 text-xs text-ink-soft">Recent cleared tips. Search above to find older advice {wallet ? "from your Wallet" : "from this trip"}.</p>
        <ul className="space-y-3">
          {rows.map((tip) => (
            <ClearedCard key={tip.id} tip={tip} onRestore={onRestore} />
          ))}
        </ul></>
      ) : null}
      </ClearedTipSearch>
    </>
  );
}
