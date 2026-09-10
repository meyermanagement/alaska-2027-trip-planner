"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CompassLoader from "@/components/CompassLoader";
import { useBooted, useRevealed } from "@/components/reveal";
import { runToStandIn } from "@/lib/practice/session";

/**
 * The client shell for the interview proof step.
 *
 * On mount, asks the /api/interview/proof endpoint for a day in a place the
 * family names and paints the answer. This is the last onboarding screen, so
 * the button at the bottom carries them into the trip builder.
 *
 * One question, four answers: a meal, something to do, how the family gets
 * around, and where it stays. Those four arrive together rather than as separate
 * things to pick between, because a person asked to choose which one to look at
 * mostly looks at one and leaves.
 *
 * Under them, what to pack for that day and a couple of pro tips, both about the
 * choices above rather than about the place in general. They sit inside the same
 * card because they are consequences of the plan, not a second subject, and each
 * one is asked to name the choice it belongs to -- the point being that a
 * packing list only gets specific once something specific has been planned.
 *
 * This screen used to show the same question answered twice, side by side: once
 * by an Aly who knew nothing about the family, and once with the interview
 * folded in. The left-hand column was there to prove the right-hand one had
 * changed. It cost half the width, a second model call, and the reader's first
 * job on the screen was to compare two things instead of reading one -- and the
 * column it was compared against was deliberately generic writing that nobody
 * asked for. The reasons under each choice already say which of their own
 * answers drove it, which is the same proof said once, in the answer they
 * actually want.
 *
 * The answer arrives as plan rows rather than a paragraph -- see the endpoint
 * for why -- laid out as the slot, the choice, and underneath it the reason that
 * choice won. The reason line is the whole point of the screen, so it gets its
 * own line rather than being tucked into the same sentence as the choice.
 *
 * ---- Voice --------------------------------------------------------------
 *
 * Aly says all of it, in the first person. The screen used to narrate her --
 * "Aly picks a meal", "the things you just told her", "Aly will choose
 * differently on different runs" -- which is odd on the one screen whose entire
 * argument is that she listened to this family personally. A third party
 * vouching for her is weaker than her saying what she did and why, and it
 * contradicted both the heading, which was already hers, and the reason lines
 * in the answer, which are written by her in the first person. So the whole
 * screen speaks with one voice: I pick, you told me, I will choose differently.
 *
 * The screen used to carry an extra line on a rehearsal saying it was a
 * rehearsal and whose answers it worked from. It was scaffolding for whoever was
 * testing the chain, sitting directly under the one sentence that matters, and
 * the answer itself already names the family it was written for. Gone.
 *
 * ---- Motion -------------------------------------------------------------
 *
 * The same ma- system as Meet Aly, imported from components/reveal.js: nothing
 * hidden until JavaScript is running, nothing moving until the boot veil has
 * lifted, and each block waiting until it is on screen. The heading rises a
 * word at a time the way her greeting does.
 *
 * The answer is the exception, and deliberately so. It is not revealed on
 * scroll, because it did not exist a second ago -- it arrives when the model
 * finishes, in place, under a loader the family has been watching. So the card
 * is uncovered top-edge first on ma-write, the way a line of writing appears,
 * and the rows inside it come in one after another. Aly is writing it while
 * they watch rather than sliding a finished thing into place.
 */

/**
 * The answer, as an itinerary.
 *
 * Falls back to the raw paragraph when the model ignored the row shape, because
 * a prose answer is still a real answer. The reason line is dropped when a row
 * came back without one instead of leaving an empty line under the choice.
 */
function PlanRows({ rows, fallback, at = 0 }) {
  if (!rows?.length) {
    return (
      <p
        className="ma-in whitespace-pre-wrap text-sm leading-relaxed text-ink"
        style={{ animationDelay: `${at}s` }}
      >
        {fallback || "(no answer)"}
      </p>
    );
  }
  // Not the section-label class. That rule is unlayered in globals.css and so
  // wins the cascade over any Tailwind text color, which would quietly render
  // the slot labels in gray however they are classed here.
  const slot =
    "text-[0.7rem] font-semibold uppercase tracking-[0.09em] text-teal";
  return (
    <ol className="space-y-3">
      {rows.map((row, i) => (
        <li
          key={`${row.when}-${i}`}
          className={`ma-in ${i > 0 ? "border-t border-teal/30 pt-3" : ""}`}
          style={{ animationDelay: `${at + i * 0.11}s` }}
        >
          <p className={slot}>{row.when}</p>
          <p className="mt-0.5 text-sm font-medium leading-snug text-ink">
            {row.what}
          </p>
          {row.why && (
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              {row.why}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * The packing lines or the tips, under the plan they came from.
 *
 * Deliberately lighter than the plan: no rules between the lines and no card of
 * its own, because these follow from the four decisions above rather than
 * standing beside them. The reason is on the same line as the thing rather than
 * under it, since "which part of the day needs it" is a phrase and not the
 * sentence a choice gets.
 */
function Extras({ label, rows, note, at = 0 }) {
  return (
    <section className="mt-3 border-t border-teal/30 pt-3">
      <h2
        className="ma-in text-[0.7rem] font-semibold uppercase tracking-[0.09em] text-teal"
        style={{ animationDelay: `${at}s` }}
      >
        {label}
      </h2>
      {note && (
        <p
          className="ma-in mt-0.5 text-xs italic text-ink-soft"
          style={{ animationDelay: `${at + 0.06}s` }}
        >
          {note}
        </p>
      )}
      <ul className="mt-1.5 space-y-1.5">
        {rows.map((row, i) => (
          <li
            key={`${row.what}-${i}`}
            className="ma-in text-sm leading-snug"
            style={{ animationDelay: `${at + 0.12 + i * 0.07}s` }}
          >
            <span className="font-medium text-ink">{row.what}</span>
            {row.why && (
              <span className="text-ink-soft">
                {" "}
                &mdash; {row.why.replace(/^--\s*/, "")}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Places to offer as the trip the answer is about.
 *
 * A blank box works, but it asks a person to invent a destination in the middle
 * of being shown something, and whatever they type sets the quality of the one
 * answer the screen gets to give. These five are places families actually
 * consider, and between them they pull the two answers apart for different
 * reasons -- a city, a beach, a park, cold weather, and a trip where the
 * lodging is the plan. Typing their own is still right there underneath.
 *
 * Offered in both states, not only on the empty-calendar one. A family that
 * does have a trip booked was getting no picker at all, which meant one
 * answer about one place and no way to try another -- and the returning
 * primary who reaches this screen from the family page is exactly the person
 * most likely to want a second look at it.
 */
const SUGGESTED_PLACES = [
  { label: "Paris", destination: "Paris, France" },
  { label: "Maui", destination: "Maui, Hawaii" },
  { label: "Disney World", destination: "Walt Disney World, Florida" },
  { label: "Iceland", destination: "Reykjavik, Iceland" },
  {
    label: "Safari in South Africa",
    destination: "a safari out of Johannesburg, South Africa",
  },
];

/**
 * When each part of a block moves, in seconds after that block is on screen.
 * Same shape as MeetAly's own beats: the eyebrow, then the heading rising a word
 * at a time, then the sentence under it.
 */
const BEAT = {
  eyebrow: 0.12,
  headline: 0.24,
  word: 0.075,
  intro: 0.62,
  chip: 0.1,
  chipStep: 0.045,
  // Inside the answer: the card uncovers itself first, so the rows start once
  // it is most of the way open rather than racing it.
  plan: 0.34,
  pack: 0.72,
  tips: 0.92,
  caveat: 1.05,
};

export default function ProofClient({ demo = false, backHref = null } = {}) {
  const router = useRouter();
  // Armed in an effect, so with JavaScript off nothing is hidden. Everything
  // waits on the boot veil the way Meet Aly does, so a cold open does not spend
  // the sequence behind the splash.
  const [armed, setArmed] = useState(false);
  const booted = useBooted();
  const [head, headShown] = useRevealed("0px");
  const [foot, footShown] = useRevealed();
  useEffect(() => setArmed(true), []);
  // Bumped to re-ask the same question after a failure. There is no category
  // to nudge any more: one question covers all four slots.
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  // A family that signed up today has no trip: nothing in the welcome chain
  // creates one. So the destination may have to come from the primary. `place`
  // is what they are typing; `destination` is what has been asked about, and
  // changing it re-runs the pair.
  const [place, setPlace] = useState("");
  const [destination, setDestination] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setData(null);
    fetch("/api/interview/proof", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // A rehearsal carries whatever family was typed on the way here, so the
      // answer is about that family rather than the built-in stand-in. Read at
      // fetch time rather than held in state, so a person who steps back,
      // changes an answer, and returns gets the changed answer. Null on a real
      // visit and on an untouched rehearsal, and ignored by the endpoint either
      // way.
      body: JSON.stringify({
        demo,
        destination: destination || null,
        standIn: demo ? runToStandIn() : null,
      }),
    })
      .then((r) => r.json().catch(() => null))
      .then((json) => {
        if (cancelled) return;
        if (!json?.ok) {
          setError(json?.error || "That didn't come through.");
          setLoading(false);
          return;
        }
        setData(json);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("That didn't come through. Try again in a moment.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt, demo, destination]);

  const headline = "Here is a day, planned around what you just told me.";

  return (
    <div className="space-y-6" {...(armed ? { "data-ma-armed": "1" } : {})}>
      <header
        className="space-y-2"
        ref={head}
        {...(booted && headShown ? { "data-ma-shown": "1" } : {})}
      >
        <p
          className="ma-fade section-label text-ink-soft"
          style={{ animationDelay: `${BEAT.eyebrow}s` }}
        >
          Proof
        </p>
        <h1 className="font-display text-3xl font-semibold leading-tight">
          {headline.split(" ").map((word, i) => (
            <span className="ma-line" key={`${word}-${i}`}>
              <span
                className="ma-word"
                style={{ animationDelay: `${BEAT.headline + i * BEAT.word}s` }}
              >
                {word}
              </span>
              {"\u00a0"}
            </span>
          ))}
        </h1>
        {/* What the reasons under each choice cannot say for themselves is
            what the four choices are, and that the place is one this family
            picked rather than a worked example. Both fit in a sentence.

            A place they pick, not their trip: this screen runs immediately
            after the interview, before the family has made a single trip, so
            there is nothing to look up. Everyone who sees it names a place in
            the box below or takes one of the five offered. */}
        <p
          className="ma-in text-base leading-relaxed text-ink-soft"
          style={{ animationDelay: `${BEAT.intro}s` }}
        >
          Name a place and I will pick a meal, something to do, how you get
          around, and where you stay, then pack for that day and tell you what
          to watch out for &mdash; saying each time which of your own answers
          made me choose it.
        </p>
      </header>

      {/* The place the answer is about, still switchable after the first
          answer. Nothing here comes from the trips table: this screen runs
          while the family is being built and has no trips yet, so the place is
          always something the person named. */}
      {!loading && !error && data && !data.needsDestination && (
        <nav
          className="flex flex-wrap items-center gap-2"
          aria-label="Which place to ask about"
          {...(armed ? { "data-ma-shown": "1" } : {})}
        >
          <span className="section-label text-ink-soft">Ask about:</span>
          {SUGGESTED_PLACES.map((option, i) => {
            const on = destination === option.destination;
            return (
              <button
                key={option.destination}
                type="button"
                onClick={() => {
                  setPlace(option.destination);
                  setDestination(option.destination);
                }}
                aria-pressed={on}
                style={{
                  animationDelay: `${BEAT.chip + i * BEAT.chipStep}s`,
                }}
                className={`ma-chip rounded-full border px-3 py-1.5 text-sm ${
                  on
                    ? "border-teal bg-teal text-white"
                    : "border-sand-deep bg-white text-ink-soft"
                }`}
              >
                {option.label}
              </button>
            );
          })}
          {/* Back to the box, for a place that is not one of the five. Without
              it, picking a suggestion is a one-way door: the form is gone and
              the row only offers those five. */}
          <button
            type="button"
            onClick={() => {
              setPlace("");
              setDestination("");
            }}
            className="rounded-full border border-sand-deep bg-white px-3 py-1.5 text-sm text-ink-soft underline underline-offset-4"
          >
            Somewhere else
          </button>
        </nav>
      )}

      {/* No destination named yet, which is where everybody starts. Asked as
          one question rather than assumed, because the answer is the difference
          between a plan for a real place and a plan for "your next trip". */}
      {!loading && !error && data?.needsDestination && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const next = place.trim();
            if (next) setDestination(next);
          }}
          className="space-y-3 rounded-2xl border border-sand-deep bg-sand-soft/60 p-4"
        >
          <label
            htmlFor="proof-place"
            className="block font-display text-lg text-ink"
          >
            Where are you thinking of going?
          </label>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Somewhere to start with"
          >
            {SUGGESTED_PLACES.map((option) => (
              <button
                key={option.destination}
                type="button"
                onClick={() => {
                  setPlace(option.destination);
                  setDestination(option.destination);
                }}
                className="rounded-full border border-sand-deep bg-white px-3 py-1.5 text-sm text-ink-soft"
              >
                {option.label}
              </button>
            ))}
          </div>
          <input
            id="proof-place"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="Or type anywhere else"
            maxLength={60}
            autoComplete="off"
            className="w-full rounded-xl border border-sand-deep bg-white p-3 text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
          />
          <button
            type="submit"
            disabled={!place.trim()}
            className="btn btn-primary px-4 py-2 text-sm disabled:opacity-50"
          >
            Plan a day there
          </button>
        </form>
      )}

      {loading && !data?.needsDestination && (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 text-teal">
          <CompassLoader size={64} label="I am planning a day there." />
          <p className="text-sm text-ink-soft">
            Four choices, what to pack for them, and the reason for each. This
            takes me a moment.
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-terra-deep/50 bg-terra-soft/40 p-4 text-sm text-ink">
          {error}{" "}
          <button
            type="button"
            className="ml-2 underline underline-offset-4"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && data && !data.needsDestination && (
        <>
          {/* One card, full width. It was half a screen when there was a
              generic answer beside it to argue with. */}
          <article
            className="ma-write flex flex-col gap-2 rounded-2xl border-2 border-teal bg-teal-soft/30 p-4"
            {...(armed ? { "data-ma-shown": "1" } : {})}
          >
            <header>
              {/* Same cascade trap as the slot labels above: section-label
                  would override the teal, so the label is spelled out. */}
              <p
                className="ma-in text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-teal"
                style={{ animationDelay: `${BEAT.plan - 0.12}s` }}
              >
                A day in {data.destination}
              </p>
              <p
                className="ma-in mt-1 text-xs italic text-ink-soft"
                style={{ animationDelay: `${BEAT.plan - 0.06}s` }}
              >
                Built from the {data.preferenceCount || "several"} things you
                just told me.
              </p>
            </header>
            <PlanRows
              rows={data.withPrefsRows}
              fallback={data.withPrefs}
              at={BEAT.plan}
            />
            {/* Left out rather than headed and empty when a run came back
                without these rows, which is the honest thing for a screen whose
                whole job is showing what Aly can actually do. */}
            {data.packRows?.length > 0 && (
              <Extras
                label="Pack for that day"
                rows={data.packRows}
                note="Each line says which part of the day needs it."
                at={BEAT.pack}
              />
            )}
            {data.tipRows?.length > 0 && (
              <Extras label="Pro tips" rows={data.tipRows} at={BEAT.tips} />
            )}
          </article>

          {/* The flag has to sit on an ancestor: the ma- rules animate a
              descendant of a shown block, so an element that marks itself shown
              stays hidden. */}
          <div {...(armed ? { "data-ma-shown": "1" } : {})}>
            <p
              className="ma-in text-xs italic text-ink-soft"
              style={{ animationDelay: `${BEAT.caveat}s` }}
            >
              Ask me again and I will choose differently. What stays true is
              that every choice comes from something you told me.
            </p>
          </div>
        </>
      )}

      <div
        className="flex flex-wrap gap-2 border-t border-sand-deep pt-5"
        ref={foot}
        {...(booted && footShown ? { "data-ma-shown": "1" } : {})}
      >
        {/* This used to open one more onboarding screen, which said what Aly
            would do and offered one more question to ask her. Two demos in a
            row before the family had done anything, when the thing they need
            next is a trip. So the proof screen is the last one, and this button
            is the first real piece of work: the trip builder, because a family
            reaching the end of this sequence has no trip yet. */}
        <button
          type="button"
          onClick={() => {
            if (demo) {
              router.push(backHref || "/interview-check");
              return;
            }
            router.push("/trips/new");
          }}
          className="ma-cta btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
        >
          {demo ? "Take me to my trips" : "Plan our trip"}
        </button>
      </div>
    </div>
  );
}
