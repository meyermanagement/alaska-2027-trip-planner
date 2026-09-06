"use client";

import { tripRef } from "@/lib/trips/route";
import { useCallback, useEffect, useRef, useState } from "react";
import ChatPanel from "./ChatPanel";
import ConversationList from "./ConversationList";
import { ASK_ALY_EVENT } from "./AskAlyTrigger";

// `trip` may be null, which puts Aly in general mode: she sees every trip and
// can create or delete one, but cannot touch what is inside them.
// `onApplied` runs the moment something is saved and must only touch data on the
// client. `onRefresh` is for re-rendering the page from the server, and it is
// held back until the drawer closes — see the note on `needsRefresh` below.
export default function AskAlyDrawer({
  trip = null,
  onApplied,
  onRefresh,
  focus,
}) {
  const [open, setOpen] = useState(false);
  // Set when something on the page opens Aly with an opening message already
  // written — the trip builder screen does this. Cleared on close,
  // so the next plain "Ask Aly" starts from an empty box.
  const [seed, setSeed] = useState(null);
  // Which conversation is on screen. `null` means the list of them, which is
  // what opening Aly normally shows; `{ id: null }` is a conversation that has
  // been started but not yet said anything, so it has no id until the first
  // reply comes back.
  const [current, setCurrent] = useState(null);
  // Looking up which conversation to reopen. Brief, and worth waiting for: the
  // alternative is drawing an empty panel and having last week's messages drop
  // in underneath whatever they have started typing.
  const [resuming, setResuming] = useState(false);
  // Refreshing the page from the server while the drawer is open destroys the
  // conversation. Every screen the drawer sits on has a loading.js, so if the
  // refresh is slow — and these pages make seven database round trips — Next
  // swaps in that skeleton, which unmounts the page subtree the drawer lives in
  // and takes its state with it. What that looked like was approving the first
  // suggestion, being dropped back on the Trips page, and finding the rest of
  // the suggestions gone. So the refresh waits for the drawer to close, when
  // there is no longer anything to lose.
  const needsRefresh = useRef(false);
  // ?ask=1 opens the drawer once, on arrival. Guarded because openWith changes
  // whenever the trip does, and reopening the drawer because somebody edited the
  // trip's name would throw away whatever was on screen.
  const openedFromUrl = useRef(false);
  const noteApplied = useCallback(() => {
    needsRefresh.current = true;
    onApplied?.();
  }, [onApplied]);
  /**
   * Opening Aly, on the conversation they were already having.
   *
   * She used to start over every time. Nine separate threads had built up on one
   * Portugal draft -- none longer than five messages, several the same question
   * asked from a different button -- because every press of Ask Aly, and every
   * Change with Aly on the draft, filed its question under a brand-new
   * conversation that began knowing nothing about the last one.
   *
   * So the trip's own thread is looked up first and reopened with its messages on
   * screen. One per trip, per person: the lookup is scoped by the database to
   * whoever is asking, so two people on the same trip keep two conversations and
   * neither can reach the other's.
   *
   * Two openings do not resume. Building a trip from nothing starts fresh: the
   * second trip idea has no business arriving in the middle of the first. And
   * pressing Ask Aly with no trip in play -- from Home, or the trips list --
   * lands on the list of conversations, because there the question is which
   * conversation, and an index of them is a better answer than the last one.
   * Somebody who arrives with a question already typed is past that point, so a
   * seeded opening with no trip resumes the general thread rather than showing
   * them a list they did not ask for.
   */
  const openWith = useCallback(
    async (opening) => {
      const wanted = opening?.focus || focus || null;
      setOpen(true);
      if (wanted === "new_trip" || wanted === "log_trip") {
        setCurrent({
          id: null,
          title: null,
          tripId: trip?.id || null,
          tripRef: tripRef(trip) || null,
          tripName: trip?.name,
        });
        return;
      }
      // Home: the list, as it was. `current` null is what draws it.
      if (!trip?.id && !opening?.seeded) {
        setCurrent(null);
        return;
      }
      setResuming(true);
      setCurrent(null);
      let found = null;
      try {
        const params = new URLSearchParams();
        if (trip?.id) params.set("tripId", trip.id);
        if (wanted) params.set("focus", wanted);
        const res = await fetch(`/api/chat/resume?${params.toString()}`);
        if (res.ok) found = (await res.json())?.conversation || null;
      } catch {
        // Nothing to report. A resume that does not answer means a new
        // conversation, which is what pressing this always used to do.
      }
      setCurrent({
        id: found?.id || null,
        // A trip's thread is headed with the trip, not with the first thing ever
        // asked in it. Titles are written from the opening message, which was
        // right when every question got its own conversation and is wrong now
        // that this one runs for the length of the trip -- nobody wants a
        // fortnight of planning filed under "where is currently Lisbon".
        title: (trip?.name && found?.id ? trip.name : found?.title) || null,
        tripId: trip?.id || found?.tripId || null,
        tripRef: tripRef(trip) || found?.tripRef || null,
        tripName: trip?.name,
      });
      setResuming(false);
    },
    [focus, trip?.id, trip?.name],
  );

  const close = useCallback(() => {
    setOpen(false);
    setSeed(null);
    setCurrent(null);
    setResuming(false);
    if (needsRefresh.current) {
      needsRefresh.current = false;
      onRefresh?.();
    }
  }, [onRefresh]);

  // Opened by the "Ask Aly" button in the top bar, which lives in a separate
  // server-rendered subtree, so a window event is the simplest bridge.
  useEffect(() => {
    const onAsk = (event) => {
      const detail = event?.detail || {};
      setSeed(
        detail.seed
          ? {
              text: detail.seed,
              autoSend: detail.autoSend !== false,
              focus: detail.focus,
            }
          : null,
      );
      // Either way this goes to the conversation about this trip: somebody who
      // has already typed their question does not want a list, and somebody who
      // pressed the button plainly does not want to start over.
      openWith({ focus: detail.focus, seeded: Boolean(detail.seed) });
    };
    window.addEventListener(ASK_ALY_EVENT, onAsk);
    return () => window.removeEventListener(ASK_ALY_EVENT, onAsk);
  }, [openWith]);

  // Arriving from the trips list with ?ask=1 opens it straight away. Read from
  // location rather than useSearchParams so there's no prerender constraint.
  useEffect(() => {
    if (openedFromUrl.current) return;
    if (!new URLSearchParams(window.location.search).get("ask")) return;
    openedFromUrl.current = true;
    openWith(null);
  }, [openWith]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  // Two measurements, because the keyboard makes two different demands.
  //
  // The cover must stay as tall as the page, or the trip shows through the band
  // below it -- so it gets the layout height, which the keyboard does not change,
  // and which only ever grows here: iOS collapses its address bar while you type
  // and hands back a taller window, and a cover that shrank on the way back down
  // would flash the page through the bottom of the screen.
  //
  // The panel must fit what is still visible, so it gets the visual viewport.
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const root = document.documentElement;
    const viewport = window.visualViewport;
    let tallest = 0;

    const sync = () => {
      tallest = Math.max(tallest, window.innerHeight || 0);
      if (tallest) root.style.setProperty("--aly-layout-h", `${tallest}px`);
      if (!viewport) return;
      root.style.setProperty("--aly-viewport-h", `${viewport.height}px`);
      root.style.setProperty("--aly-viewport-top", `${viewport.offsetTop}px`);
      // What the keyboard is sitting on: everything below the visible band. The
      // panel turns it into padding rather than giving the height back.
      const hidden = Math.max(
        0,
        Math.round(tallest - viewport.height - viewport.offsetTop),
      );
      root.style.setProperty("--aly-keyboard-h", `${hidden}px`);
    };
    sync();

    // resize fires as the keyboard animates in; scroll fires when the page moves
    // underneath it, which iOS does to keep the focused field in view.
    window.addEventListener("resize", sync);
    viewport?.addEventListener("resize", sync);
    viewport?.addEventListener("scroll", sync);
    return () => {
      window.removeEventListener("resize", sync);
      viewport?.removeEventListener("resize", sync);
      viewport?.removeEventListener("scroll", sync);
      root.style.removeProperty("--aly-layout-h");
      root.style.removeProperty("--aly-viewport-h");
      root.style.removeProperty("--aly-viewport-top");
      root.style.removeProperty("--aly-keyboard-h");
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="aly-overlay no-print fixed inset-x-0 top-0 z-40 flex items-start justify-end"
      role="dialog"
      aria-modal="true"
      aria-label="Ask Aly"
    >
      <button
        type="button"
        aria-label="Close the assistant"
        onClick={close}
        className="aly-veil absolute inset-0 cursor-default bg-ink/40"
      />
      <aside className="aly-panel relative flex w-full max-w-md flex-col border-l border-[var(--line)] bg-white shadow-2xl">
        {resuming ? (
          // Not blank. The drawer is already over the trip and something has to
          // hold the space while the thread is found.
          <div className="flex min-h-0 flex-1 items-start px-4 py-4">
            <p className="text-sm text-ink-soft">
              Picking up where you left off…
            </p>
          </div>
        ) : current ? (
          <ChatPanel
            trip={trip}
            onApplied={noteApplied}
            onClose={close}
            onBack={() => setCurrent(null)}
            focus={seed?.focus || focus}
            seed={seed?.text}
            autoSendSeed={seed?.autoSend}
            conversationId={current.id}
            conversationTitle={current.title}
            conversationTripName={current.tripName}
            conversationTripId={current.tripId}
            conversationTripRef={current.tripRef}
            conversationOwnerName={current.ownerName}
            onConversationStarted={(id) =>
              setCurrent((c) => (c && !c.id ? { ...c, id } : c))
            }
            fill
          />
        ) : (
          <ConversationList
            onClose={close}
            onNew={() =>
              setCurrent({
                id: null,
                title: null,
                tripId: trip?.id || null,
                tripRef: tripRef(trip) || null,
                tripName: trip?.name,
              })
            }
            onPick={(conversation) =>
              setCurrent({
                id: conversation.id,
                title: conversation.title,
                // Only ever set when the conversation belongs to somebody
                // else; the list works out which.
                ownerName: conversation.ownerName || null,
                tripId: conversation.tripId || null,
                tripRef: conversation.tripRef || null,
                tripName: conversation.tripName,
              })
            }
          />
        )}
      </aside>
    </div>
  );
}
