"use client";

// The next question, one tap away.
//
// Only ever shown under the newest answer: a question that made sense four
// answers ago is usually the wrong one now, and a screen full of stale doors is
// worse than none. Pressing one asks it in the family's own voice, so it goes
// through exactly the path a typed question does -- nothing here saves anything.

export default function Followups({ questions, onAsk, busy = false }) {
  if (!Array.isArray(questions) || !questions.length) return null;
  return (
    <div className="mt-3 border-t border-sand-deep/70 pt-2.5">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        Ask next
      </p>
      <div className="flex flex-wrap gap-1.5">
        {questions.map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => onAsk?.(q)}
            className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-left text-xs font-medium text-ink-soft transition hover:border-teal hover:text-teal disabled:opacity-60"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
