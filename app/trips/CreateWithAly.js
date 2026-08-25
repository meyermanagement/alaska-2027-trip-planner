"use client";

import { useState } from "react";
import { ASK_ALY_EVENT } from "@/components/AskAlyTrigger";

// Somewhere to start a trip from an idea rather than from a form. Whatever is
// typed here is handed to Aly as the opening message of a real conversation —
// she can ask about dates or who is coming before she drafts anything — so this
// is a doorway, not a wizard.
const EXAMPLES = [
  "A long weekend somewhere warm in February, no flight over four hours",
  "Two weeks in Japan for the cherry blossoms, spring 2028",
  "A national park road trip with one proper hotel in the middle",
];

export default function CreateWithAly() {
  const [idea, setIdea] = useState("");

  function start() {
    const clean = idea.trim();
    if (!clean) return;
    window.dispatchEvent(
      new CustomEvent(ASK_ALY_EVENT, {
        detail: { seed: clean, autoSend: true, focus: "new_trip" },
      }),
    );
    setIdea("");
  }

  return (
    <div className="no-print card p-5">
      <h3 className="font-display text-lg font-semibold">Create with Aly</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
        Tell her roughly what you have in mind. She will ask about anything she
        needs, then draft the trip and a day-by-day itinerary — leaning on your
        saved preferences and what you thought of the places you have already
        been.
      </p>

      <textarea
        className="field mt-3 min-h-[5.5rem]"
        rows={3}
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="Ten days somewhere we have never been, sometime next summer…"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start();
        }}
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={start}
          disabled={!idea.trim()}
        >
          Start planning
        </button>
        <span className="text-xs text-ink-soft">
          Nothing is saved until you press the cards she sends back.
        </span>
      </div>

      <div className="mt-4 border-t border-[var(--line)] pt-3">
        <p className="section-label">Or start from one of these</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setIdea(e)}
              className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5 text-left text-xs font-medium text-ink-soft transition hover:border-teal/40 hover:text-ink"
            >
              {e}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
