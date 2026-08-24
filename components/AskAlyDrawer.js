"use client";

import { useCallback, useEffect, useState } from "react";
import ChatPanel from "./ChatPanel";
import { ASK_ALY_EVENT } from "./AskAlyTrigger";

// `trip` may be null, which puts Aly in general mode: she sees every trip and
// can create or delete one, but cannot touch what is inside them.
export default function AskAlyDrawer({ trip = null, onApplied, focus }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  // Opened by the "Ask Aly" button in the top bar, which lives in a separate
  // server-rendered subtree, so a window event is the simplest bridge.
  useEffect(() => {
    const onAsk = () => setOpen(true);
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
      <aside className="aly-panel relative flex h-full w-full max-w-md flex-col border-l border-sand-deep bg-white shadow-2xl">
        <ChatPanel
          trip={trip}
          onApplied={onApplied}
          onClose={close}
          focus={focus}
          fill
        />
      </aside>
    </div>
  );
}
