"use client";

import { useCallback, useEffect, useState } from "react";
import ChatPanel from "./ChatPanel";
import ConversationList from "./ConversationList";
import { ASK_ALY_EVENT } from "./AskAlyTrigger";

// `trip` may be null, which puts Aly in general mode: she sees every trip and
// can create or delete one, but cannot touch what is inside them.
export default function AskAlyDrawer({ trip = null, onApplied, focus }) {
  const [open, setOpen] = useState(false);
  // Set when something on the page opens Aly with an opening message already
  // written — "Create with Aly" on the Trips page does this. Cleared on close,
  // so the next plain "Ask Aly" starts from an empty box.
  const [seed, setSeed] = useState(null);
  // Which conversation is on screen. `null` means the list of them, which is
  // what opening Aly normally shows; `{ id: null }` is a conversation that has
  // been started but not yet said anything, so it has no id until the first
  // reply comes back.
  const [current, setCurrent] = useState(null);
  const close = useCallback(() => {
    setOpen(false);
    setSeed(null);
    setCurrent(null);
  }, []);

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
      // Opened with something already written — "Create with Aly" — goes straight
      // into a fresh conversation. There is no sense showing a list to somebody
      // who has already typed their question.
      setCurrent(detail.seed ? { id: null, title: null } : null);
      setOpen(true);
    };
    window.addEventListener(ASK_ALY_EVENT, onAsk);
    return () => window.removeEventListener(ASK_ALY_EVENT, onAsk);
  }, []);

  // Arriving from the trips list with ?ask=1 opens it straight away. Read from
  // location rather than useSearchParams so there's no prerender constraint.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("ask")) setOpen(true);
  }, []);

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

  if (!open) return null;

  return (
    <div
      className="no-print fixed inset-0 z-40 flex justify-end"
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
      <aside className="aly-panel relative flex h-full w-full max-w-md flex-col border-l border-[var(--line)] bg-white shadow-2xl">
        {current ? (
          <ChatPanel
            trip={trip}
            onApplied={onApplied}
            onClose={close}
            onBack={() => setCurrent(null)}
            focus={seed?.focus || focus}
            seed={seed?.text}
            autoSendSeed={seed?.autoSend}
            conversationId={current.id}
            conversationTitle={current.title}
            conversationTripName={current.tripName}
            onConversationStarted={(id) =>
              setCurrent((c) => (c && !c.id ? { ...c, id } : c))
            }
            fill
          />
        ) : (
          <ConversationList
            onClose={close}
            onNew={() =>
              setCurrent({ id: null, title: null, tripName: trip?.name })
            }
            onPick={(conversation) =>
              setCurrent({
                id: conversation.id,
                title: conversation.title,
                tripName: conversation.tripName,
              })
            }
          />
        )}
      </aside>
    </div>
  );
}
