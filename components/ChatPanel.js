"use client";

import { useEffect, useRef, useState } from "react";

const SUGGESTIONS = [
  "What's on the schedule the first day?",
  "Add sunscreen and bug spray to the shared packing list",
  "Remind me to do online check-in the day before we fly",
  "What still needs to be booked?",
];

export default function ChatPanel({ trip, onApplied }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { actions, forMessage }
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, busy]);

  async function send(text) {
    const clean = text.trim();
    if (!clean || busy) return;

    setError("");
    setPending(null);
    setInput("");
    const next = [...messages, { role: "user", text: clean }];
    setMessages(next);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: trip.id, messages: next }),
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
          { role: "assistant", text: "I could not work out a change for that." },
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
        body: JSON.stringify({ tripId: trip.id, actions: pending.actions }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || "Could not save those changes.");
        setApplying(false);
        return;
      }

      const failed = (data.results || []).filter((r) => !r.ok);
      const okCount = data.applied || 0;
      const summary =
        okCount > 0
          ? `Saved ${okCount} change${okCount === 1 ? "" : "s"}.`
          : "Nothing was saved.";
      const detail = failed.length
        ? ` ${failed.length} failed: ${failed
            .map((f) => f.error || f.summary)
            .join("; ")}`
        : "";

      setMessages((m) => [
        ...m,
        { role: "assistant", text: summary + detail, kind: "receipt" },
      ]);
      setPending(null);
      onApplied?.();
    } catch {
      setError("Network hiccup while saving. Nothing may have been applied.");
    }
    setApplying(false);
  }

  return (
    <section className="card flex h-[32rem] flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-sand-deep px-4 py-3">
        <div>
          <h2 className="font-display text-base font-semibold">Trip assistant</h2>
          <p className="text-xs text-ink-soft">
            Ask about {trip.name}, or tell it what to change.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMessages([]);
              setPending(null);
              setError("");
            }}
            className="btn btn-ghost shrink-0 px-3 py-1.5 text-xs"
          >
            Clear
          </button>
        )}
      </header>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !busy && (
          <div className="space-y-3">
            <p className="text-sm text-ink-soft">
              It can add or change itinerary items, packing, tasks and notes. You
              approve every change before it saves.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-sand-deep px-3 py-1.5 text-left text-xs font-semibold text-ink-soft transition hover:border-teal hover:text-teal"
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
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
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
            <div className="rounded-2xl bg-sand px-3.5 py-2.5 text-sm text-ink-soft">
              Thinking…
            </div>
          </div>
        )}

        {pending && (
          <div className="rounded-2xl border border-teal/40 bg-white p-4 ring-1 ring-teal/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
              {pending.actions.length === 1
                ? "Proposed change"
                : `${pending.actions.length} proposed changes`}
            </p>
            <ul className="mt-2 space-y-1.5">
              {pending.actions.map((a, i) => (
                <li key={i} className="flex gap-2 text-sm text-ink">
                  <span aria-hidden="true" className="text-teal">
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
                className="btn btn-primary px-4 py-1.5 text-sm"
              >
                {applying ? "Saving…" : "Apply"}
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
        className="flex gap-2 border-t border-sand-deep bg-sand/50 px-3 py-3"
      >
        <input
          className="field"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add dinner Thursday at 6…"
          disabled={busy}
          aria-label="Message the trip assistant"
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
