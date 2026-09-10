"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CompassLoader from "@/components/CompassLoader";
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
 */

/**
 * The answer, as an itinerary.
 *
 * Falls back to the raw paragraph when the model ignored the row shape, because
 * a prose answer is still a real answer. The reason line is dropped when a row
 * came back without one instead of leaving an empty line under the choice.
 */
function PlanRows({ rows, fallback }) {
  if (!rows?.length) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
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
          className={i > 0 ? "border-t border-teal/30 pt-3" : ""}
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

export default function ProofClient({ demo = false, backHref = null } = {}) {
  const router = useRouter();
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

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="section-label text-ink-soft">Proof</p>
        <h1 className="font-display text-3xl font-semibold leading-tight">
          Here is a day, planned around what you just told me.
        </h1>
        {/* What the reasons under each choice cannot say for themselves is
            what the four choices are, and that the place is one this family
            picked rather than a worked example. Both fit in a sentence.

            A place they pick, not their trip: this screen runs immediately
            after the interview, before the family has made a single trip, so
            there is nothing to look up. Everyone who sees it names a place in
            the box below or takes one of the five offered. */}
        <p className="text-base leading-relaxed text-ink-soft">
          Name a place and Aly picks a meal, something to do, how you get
          around, and where you stay &mdash; and says which of your own answers
          made her choose it.
        </p>
        {/* A rehearsal answers about a stand-in family, and which stand-in it
            is changes what the right-hand answer should look like. Saying so
            here is what lets somebody tell a working run from one that
            quietly fell back to the built-in family. */}
        {demo && (
          <p className="text-sm leading-relaxed text-ink-soft">
            {data?.standInCustom
              ? "This is a rehearsal, answered about the family you typed on the way here."
              : "This is a rehearsal, answered about a stand-in family. Walk the practice chain from the welcome form to use your own answers instead."}
          </p>
        )}
      </header>

      {/* The place the answer is about, still switchable after the first
          answer. Nothing here comes from the trips table: this screen runs
          while the family is being built and has no trips yet, so the place is
          always something the person named. */}
      {!loading && !error && data && !data.needsDestination && (
        <nav
          className="flex flex-wrap items-center gap-2"
          aria-label="Which place to ask about"
        >
          <span className="section-label text-ink-soft">Ask about:</span>
          {SUGGESTED_PLACES.map((option) => {
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
                className={`rounded-full border px-3 py-1.5 text-sm ${
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
          <CompassLoader size={64} label="Aly is planning a day there." />
          <p className="text-sm text-ink-soft">
            Four choices and the reason for each. This takes a moment.
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
          <article className="flex flex-col gap-2 rounded-2xl border-2 border-teal bg-teal-soft/30 p-4">
            <header>
              {/* Same cascade trap as the slot labels above: section-label
                  would override the teal, so the label is spelled out. */}
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-teal">
                A day in {data.destination}
              </p>
              <p className="mt-1 text-xs italic text-ink-soft">
                Based on the {data.preferenceCount || "several"} things you just
                told her.
              </p>
            </header>
            <PlanRows rows={data.withPrefsRows} fallback={data.withPrefs} />
          </article>

          <p className="text-xs italic text-ink-soft">
            Aly will choose differently on different runs. What stays true is
            that every choice comes from something you told her.
          </p>
        </>
      )}

      <div className="flex flex-wrap gap-2 border-t border-sand-deep pt-5">
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
          className="btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
        >
          {demo ? "Take me to my trips" : "Plan our trip"}
        </button>
      </div>
    </div>
  );
}
