"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ASK_ALY_EVENT } from "@/components/AskAlyTrigger";
import DictationHint from "@/components/DictationHint";
import { SCREEN_INTROS } from "@/lib/screenCopy";
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
 * A trip is seven questions -- where, when, how you get there, where you sleep,
 * what you do, how you get around, and roughly what you would like it to cost. A
 * sentence typed here usually answers two or
 * three of them at once, Aly asks about the rest, and the answer to each is
 * allowed to be vague. The screen's whole job is to get a real sentence rather
 * than a keyword, which is why the examples are shown at full length and why the
 * seven light up as you type: seeing "that already covers where, when and what you
 * do" is what makes somebody add the manta rays.
 *
 * The one question that is not one of the seven -- is this booked, decided on, or
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
export default function TripBuilderStart({
  drafts = [],
  seed = "",
  fromPlace = "",
}) {
  const [idea, setIdea] = useState(seed);
  const boxRef = useRef(null);
  const clean = idea.trim();

  const read = readIdea(idea);
  const covered = new Set(read.filter((r) => r.mentioned).map((r) => r.id));

  // Arriving from the bucket list, the cursor belongs at the end of the sentence
  // that is already there.
  //
  // The point of this screen when it is seeded is not to read the paragraph, it
  // is to add the two things the list never held -- how you would get there,
  // where you would sleep -- and a full box with no cursor in it asks somebody
  // to tap into a wall of text and then hunt for the end of it. preventScroll
  // keeps the browser from hauling the box to the top of the window, which on a
  // phone would push the panel saying where the sentence came from off screen at
  // the moment it needs to be read.
  // The ref, rather than an empty dependency list, is what keeps this to once:
  // the cursor must not be thrown back to the end while somebody is fixing the
  // middle of the paragraph, and in development the effect runs twice anyway.
  const placed = useRef(false);
  useEffect(() => {
    if (!seed || placed.current) return;
    const box = boxRef.current;
    if (!box) return;
    placed.current = true;
    box.focus({ preventScroll: true });
    box.setSelectionRange(seed.length, seed.length);
    // Setting the selection does not move the box's own scroll until something
    // is typed, so on a phone the caret sat at the end of a paragraph whose
    // first line was the only one showing. Scroll it to the bottom by hand.
    box.scrollTop = box.scrollHeight;
  }, [seed]);

  // The examples sit at the bottom of the screen and the box they fill is at the
  // top, so on a phone pressing one used to look like nothing happening: the
  // sentence went into a box three screens above the thumb. Take the page back
  // to the top, then put the cursor at the end of the sentence so the first
  // thing you can do is change it. preventScroll keeps the focus call from
  // fighting the smooth scroll it was asked for.
  function takeExample(example) {
    setIdea(example);
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() => {
      const box = boxRef.current;
      if (!box) return;
      box.focus({ preventScroll: true });
      box.setSelectionRange(example.length, example.length);
    });
  }

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
        {SCREEN_INTROS.newTrip}
      </p>

      {/* The drafts this family already has, above the box rather than beside
          it. A person who came here to carry on with Portugal sees an empty box
          and no sign that Portugal exists, and the fastest thing to do with an
          empty box is type into it -- which is how one trip becomes two half
          trips. So the unfinished ones are named first, each a link into the
          trip it belongs to, and the box comes after them. */}
      {drafts.length > 0 && (
        <div className="mt-5 rounded-2xl border border-amber/40 bg-sand-deep/25 p-4">
          <p className="text-sm font-semibold">
            {drafts.length === 1
              ? "You have a trip draft in progress"
              : `You have ${drafts.length} trip drafts in progress`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Planning one of these? Open it to pick up where you left off.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-2">
            {drafts.map((draft) => (
              <li key={draft.key} className="min-w-0">
                <Link
                  href={draft.href}
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 transition hover:border-teal"
                >
                  <span className="emoji-badge shrink-0" aria-hidden="true">
                    {draft.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* Wraps rather than truncates: a name cut to "Portugal
                        Spring..." loses the year, and the year is often the
                        whole difference between two drafts. */}
                    <span className="block break-words text-sm font-semibold">
                      {draft.name}
                    </span>
                    <span className="block truncate text-xs text-ink-soft">
                      {[draft.when || "No dates yet", draft.destination]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {/* Words on a wide screen, a chevron on a phone. At 320px the
                      words cost more than they say: they take enough room off
                      the name that "Portugal Spring 2027" truncates to
                      "Portugal", and the trip's name is the only thing on this
                      row that tells you whether it is the trip you came to
                      carry on with. */}
                  <span className="ml-auto shrink-0 text-xs font-semibold text-teal">
                    <span className="hidden sm:inline">Continue planning</span>
                    <svg
                      className="inline h-4 w-4 sm:hidden"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M8 5l5 5-5 5" />
                    </svg>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Where the sentence in the box came from, when it came from somewhere.
          Without this the builder looks like it guessed: a box that is suddenly
          full is unsettling, and the first thing somebody needs to know is that
          these are their own words from the bucket list and that changing them
          changes the trip and not the list. */}
      {fromPlace ? (
        <div className="mt-5 rounded-2xl border border-teal/40 bg-teal-soft/25 p-4">
          <p className="text-sm font-semibold">
            Started from {fromPlace} on your bucket list
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Your saved ideas are in the box below. Add anything else you have in
            mind, then start planning. This will not change your bucket list.
          </p>
        </div>
      ) : null}

      <textarea
        ref={boxRef}
        className="field mt-5 text-base leading-relaxed"
        rows={5}
        placeholder="I want to go to the big island of Hawaii for spring break next year so that I can swim with the manta rays…"
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) start(clean);
        }}
        /* Only when there is nothing above it. Taking the cursor on arrival is
           right on an empty screen and wrong on one carrying a list of drafts:
           the phone scrolls the focused box to the top of the window and the
           very thing this screen now says first goes off it. */
        /* The seeded case is handled by the effect above, which also has to put
           the cursor somewhere in particular. */
        autoFocus={drafts.length === 0 && !seed}
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
          A trip is seven things
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
          sentences looks like. Pressing one puts it in the box, where it can be
          changed into the trip somebody actually means before it is sent. */}
      <div className="mt-9 border-t border-[var(--line)] pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Some examples
        </p>
        <p className="mt-1 text-xs text-ink-soft">
          None of these is a full answer. Press one and change it into yours.
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
                  onClick={() => takeExample(example)}
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
