"use client";

import { useEffect, useRef, useState } from "react";
import AlyeskaMark from "./AlyeskaMark";

// Prompts follow whichever section the user was looking at.
const SUGGESTIONS = {
  itinerary: [
    "What's on the schedule the first day?",
    "What still needs to be booked?",
    "Add dinner Thursday at 7",
  ],
  packing: [
    "What's left to pack for Veda?",
    "Add sunscreen and bug spray for everyone",
    "I packed the swimsuits",
  ],
  tasks: [
    "What still isn't done?",
    "Remind me to do online check-in the day before we fly",
    "Add a task to refill prescriptions a week before",
  ],
  notes: [
    "What notes do we have?",
    "Save a note that Veda wants Space Mountain first",
  ],
  // No trip open: Aly works across all of them.
  general: [
    "Which trip is next and how far away is it?",
    "How is packing coming along across our trips?",
    "Start a new trip for Italy in spring 2028",
  ],
};

const SECTION_LABELS = {
  itinerary: "Itinerary",
  packing: "Packing",
  tasks: "Tasks",
  notes: "Notes",
};

export default function ChatPanel({
  trip,
  onApplied,
  onClose,
  focus,
  fill = false,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { actions, forMessage }
  const [applying, setApplying] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const tripId = trip?.id || null;

  // The conversation lives in the database, so reopening Aly picks up where the
  // last one left off — same on a phone as on a laptop.
  useEffect(() => {
    let alive = true;
    setLoadingHistory(true);
    setMessages([]);
    setPending(null);
    const url = tripId
      ? `/api/chat/history?tripId=${encodeURIComponent(tripId)}`
      : "/api/chat/history";
    fetch(url)
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((data) => {
        if (!alive) return;
        setMessages(Array.isArray(data?.messages) ? data.messages : []);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingHistory(false);
      });
    return () => {
      alive = false;
    };
  }, [tripId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, busy, loadingHistory]);

  // The message box grows with what is in it, up to a ceiling, so a pasted
  // itinerary is readable instead of scrolling past inside one line. Clearing
  // the box after a send shrinks it back on its own.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  async function send(text) {
    const clean = text.trim();
    if (!clean || busy) return;

    setError("");
    setPending(null);
    setInput("");
    setMessages((m) => [...m, { role: "user", text: clean }]);
    setBusy(true);

    try {
      // Only the new message goes up; the server reads the rest of the thread
      // from the database.
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          focus,
          message: clean,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "The assistant is unavailable right now.");
        setBusy(false);
        return;
      }

      if (data.reply) {
        setMessages((m) => [...m, { role: "assistant", text: data.reply }]);
      }
      if (data.actions?.length) {
        setPending({ actions: data.actions });
      } else if (!data.reply) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: "I could not work out a change for that.",
          },
        ]);
      }
      if (data.problems?.length && !data.reply) {
        setError(data.problems.join(" "));
      }
    } catch {
      setError("Network hiccup. Try that again.");
    }
    setBusy(false);
  }

  async function apply() {
    if (!pending || applying) return;
    setApplying(true);
    setError("");
    try {
      const res = await fetch("/api/chat/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          actions: pending.actions,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Could not save those changes.");
        setApplying(false);
        return;
      }

      // The server writes the receipt into the thread and hands it back, so the
      // screen and the stored conversation always say the same thing.
      const failed = (data.results || []).filter((r) => !r.ok);
      const okCount = data.applied || 0;
      const fallback =
        (okCount > 0
          ? `Saved ${okCount} change${okCount === 1 ? "" : "s"}.`
          : "Nothing was saved.") +
        (failed.length
          ? ` ${failed.length} failed: ${failed
              .map((f) => f.error || f.summary)
              .join("; ")}`
          : "");

      setMessages((m) => [
        ...m,
        { role: "assistant", text: data.receipt || fallback, kind: "receipt" },
      ]);
      setPending(null);
      onApplied?.();
    } catch {
      setError("Network hiccup while saving. Nothing may have been applied.");
    }
    setApplying(false);
  }

  // Clearing really forgets: the stored thread goes with it, so Aly starts over
  // too rather than remembering a conversation the user thinks is gone.
  async function clear() {
    if (busy || applying) return;
    setMessages([]);
    setPending(null);
    setError("");
    try {
      const url = tripId
        ? `/api/chat/history?tripId=${encodeURIComponent(tripId)}`
        : "/api/chat/history";
      await fetch(url, { method: "DELETE" });
    } catch {
      setError("Cleared on screen, but the saved conversation may still be there.");
    }
  }

  return (
    <section
      className={
        fill
          ? "flex h-full min-h-0 flex-col overflow-hidden bg-white"
          : "card flex h-[32rem] flex-col overflow-hidden"
      }
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <AlyeskaMark className="h-7 w-7 shrink-0 text-teal" />
          <div className="min-w-0">
            <h2 className="font-display text-base font-semibold leading-none">
              Ask Aly
            </h2>
            <p className="mt-1 truncate text-xs text-ink-soft">
              {trip ? trip.name : "All trips"}
              {trip && SECTION_LABELS[focus]
                ? ` · ${SECTION_LABELS[focus]}`
                : ""}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {messages.length > 0 && (
            <button
              type="button"
              onClick={clear}
              className="btn btn-ghost px-3 py-1.5 text-xs"
            >
              Clear
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the assistant"
              className="rounded-lg p-1.5 text-ink-soft transition hover:bg-sand hover:text-ink"
            >
              <svg
                viewBox="0 0 20 20"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M5 5l10 10M15 5 5 15" />
              </svg>
            </button>
          )}
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 && !busy && !loadingHistory && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              {trip ? (
                <>
                  Aly is working on{" "}
                  <span className="font-semibold text-ink">{trip.name}</span>
                  {SECTION_LABELS[focus]
                    ? `, and assumes you mean the ${SECTION_LABELS[focus].toLowerCase()} unless you say otherwise.`
                    : "."}
                </>
              ) : (
                <>
                  Aly is looking across{" "}
                  <span className="font-semibold text-ink">all your trips</span>
                  . She can start a new one or remove one from here — open a trip
                  to work on what is inside it.
                </>
              )}{" "}
              You approve every change before it saves.
            </p>
            <div className="flex flex-wrap gap-2">
              {(trip
                ? SUGGESTIONS[focus] || SUGGESTIONS.itinerary
                : SUGGESTIONS.general
              ).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-[var(--line)] px-3 py-1.5 text-left text-xs font-semibold text-ink-soft transition hover:border-teal hover:text-teal"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user" ? "flex justify-end" : "flex justify-start"
            }
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-teal text-white"
                  : m.kind === "receipt"
                    ? "bg-teal-soft text-teal"
                    : "bg-sand text-ink"
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-sand px-3.5 py-2.5 text-sm text-ink-soft">
              Thinking…
            </div>
          </div>
        )}

        {pending && (
          <div
            className={`rounded-xl border bg-white p-4 ring-1 ${
              pending.actions.some((a) => a.destructive)
                ? "border-rose/50 ring-rose/20"
                : "border-teal/40 ring-teal/20"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {pending.actions.length === 1
                ? "Proposed change"
                : `${pending.actions.length} proposed changes`}
            </p>
            {/* A pasted itinerary can propose dozens of rows at once. Cap the
                height so Apply and Discard stay in reach without scrolling. */}
            <ul className="mt-2 max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {pending.actions.map((a, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink">
                  <span
                    aria-hidden="true"
                    className={a.destructive ? "text-rose" : "text-teal"}
                  >
                    •
                  </span>
                  <span>{a.summary}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={apply}
                disabled={applying}
                className={`btn px-4 py-1.5 text-sm ${
                  pending.actions.some((a) => a.destructive)
                    ? "bg-rose text-white hover:bg-[#8c364e]"
                    : "btn-primary"
                }`}
              >
                {applying
                  ? "Saving…"
                  : pending.actions.some((a) => a.destructive)
                    ? "Yes, delete"
                    : "Apply"}
              </button>
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={applying}
                className="btn btn-ghost px-4 py-1.5 text-sm"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-rose/10 px-3 py-2 text-sm text-rose">
            {error}
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex shrink-0 items-end gap-2 border-t border-[var(--line)] bg-sand/50 px-3 py-3"
      >
        <textarea
          ref={inputRef}
          rows={1}
          className="field max-h-48 resize-none overflow-y-auto leading-relaxed"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter still sends. Shift-Enter makes a new line, so a whole
            // itinerary can be typed or pasted as one message.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={
            trip ? "Add dinner Thursday at 6…" : "Ask about any trip…"
          }
          disabled={busy}
          aria-label="Message Aly"
        />
        <button
          className="btn btn-primary shrink-0 px-4"
          disabled={busy || !input.trim()}
        >
          Send
        </button>
      </form>
    </section>
  );
}
