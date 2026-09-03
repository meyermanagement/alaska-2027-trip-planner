"use client";

import { useState } from "react";
import { ASK_ALY_EVENT } from "@/components/AskAlyTrigger";
import DictationHint from "@/components/DictationHint";
import {
  BASICS,
  TRIP_IDEA_EXAMPLES,
  ideaAskingReality,
  readIdea,
  coverageLine,
} from "@/lib/trips/basics";

/**
 * Where a trip starts now: one box, and a conversation.
 *
 * This replaced a form. The form asked for a name, a destination, two dates, a
 * kind and a cover emoji, and it was the wrong question five times over. Nobody
 * decides to go to Hawaii and then thinks "the display name should be Hawaii
 * 2027" -- and worse, a date field cannot hold "spring break next year", which is
 * what people actually know at this stage. So the form made you either invent
 * dates you had not chosen or leave the trip with no when at all, and it could
 * not hear the two most useful things anybody says first: why they want to go,
 * and what they want to do there.
 *
 * A trip is six questions -- where, when, how you get there, where you sleep,
 * what you do, how you get around. A sentence typed here usually answers two or
 * three of them at once, Aly asks about the rest, and the answer to each is
 * allowed to be vague. The screen's whole job is to get a real sentence rather
 * than a keyword, which is why the examples are shown at full length and why the
 * six light up as you type: seeing "that already covers where, when and what you
 * do" is what makes somebody add the manta rays.
 *
 * The one question that is not one of the six -- is this booked, decided on, or
 * still an idea -- was asked here, as three buttons, and it had to come out. They
 * sat immediately above the start button, and when the box is empty that button
 * says "ask me", so it read as a fourth answer to the question above it rather
 * than as the way in for somebody who has not typed anything. Aly asks it now,
 * with her other questions, which is where a question belongs; the sentence that
 * leaves this screen tells her to ask before she creates anything.
 *
 * Nothing here writes to the database. Aly creates the trip from the
 * conversation.
 */
export default function TripBuilderStart() {
  const [idea, setIdea] = useState("");
  const clean = idea.trim();

  const read = readIdea(idea);
  const covered = new Set(read.filter((r) => r.mentioned).map((r) => r.id));

  function start(seed) {
    const text = ideaAskingReality(seed);
    if (!text) return;
    window.dispatchEvent(
      new CustomEvent(ASK_ALY_EVENT, {
        detail: { seed: text, autoSend: true, focus: "new_trip" },
      }),
    );
  }

  return (
    <>
      <h1 className="font-display text-3xl font-semibold">
        What trip are you thinking about?
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Say it however it is in your head — a place, a rough time of year, the
        one thing you want to do. Aly asks about whatever is missing, and you do
        not need dates.
      </p>

      <textarea
        className="field mt-5 text-base leading-relaxed"
        rows={5}
        placeholder="I want to go to the big island of Hawaii for spring break next year so that I can swim with the manta rays…"
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start(clean);
        }}
        autoFocus
      />

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <DictationHint />
        <p
          className="text-xs leading-relaxed text-ink-soft"
          aria-live="polite"
          role="status"
        >
          {coverageLine(idea)}
        </p>
      </div>

      <button
        type="button"
        className="btn btn-primary mt-5 w-full sm:w-auto"
        onClick={() =>
          start(
            clean ||
              "I want to start a new trip. I have not worked out the details yet — ask me about them.",
          )
        }
      >
        {clean ? "Start planning with Aly" : "Help me work it out"}
      </button>

      {/* What she will ask about, and which of it your sentence already said.
          Not a form and not a checklist to complete -- a trip with three of these
          is a perfectly good draft. It is here so the box does not feel like a
          void, and so somebody can see that mentioning the manta rays counted. */}
      <div className="mt-9 border-t border-[var(--line)] pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          A trip is six things
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          Aly will work through these with you. Rough answers are fine — the
          details come later, on the trip itself.
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {BASICS.map((basic) => {
            const on = covered.has(basic.id);
            return (
              <li
                key={basic.id}
                className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                  on
                    ? "border-teal bg-teal-soft/40"
                    : "border-[var(--line)] bg-white"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    on
                      ? "bg-teal text-on-accent"
                      : "border border-sand-deep bg-sand text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {basic.question}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                    {on ? (
                      <>
                        <span className="font-semibold text-teal">
                          You mentioned this.
                        </span>{" "}
                        {basic.why}
                      </>
                    ) : (
                      basic.why
                    )}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* The same device as the About You screen, for the same reason: a box asking
          for a few sentences gets three words unless somebody shows you what a few
          sentences looks like. Pressing one starts the conversation with it, which
          is also the fastest way to see what the thing does. */}
      <div className="mt-9 border-t border-[var(--line)] pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Some examples
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          None of these is a full answer. Press one to see how it goes.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {TRIP_IDEA_EXAMPLES.map((example) => (
            <div
              key={example}
              className="flex flex-col justify-between rounded-xl border border-[var(--line)] bg-sand/50 p-3"
            >
              <blockquote className="text-xs leading-relaxed text-ink-soft">
                &ldquo;{example}&rdquo;
              </blockquote>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-ghost px-2.5 py-1 text-xs"
                  onClick={() => setIdea(example)}
                >
                  Use this
                </button>
                <button
                  type="button"
                  className="btn btn-ghost px-2.5 py-1 text-xs"
                  onClick={() => start(example)}
                >
                  Start with it
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
