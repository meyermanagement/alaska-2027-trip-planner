"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CompassLoader from "@/components/CompassLoader";
import { runToStandIn } from "@/lib/practice/session";

/**
 * The client shell for the interview proof step.
 *
 * On mount, kicks off two model calls in parallel via the /api/interview
 * /proof endpoint and paints them into a side-by-side card. The primary
 * can re-roll on a different category (food or day) to see the same
 * proof against another question. This is the last onboarding screen, so the
 * button at the bottom carries them into the trip builder, or to the trip list
 * when the family already has one.
 *
 * Both answers arrive as plan rows rather than paragraphs -- see the endpoint
 * for why -- and are laid out as an itinerary: the hour, the choice, and
 * underneath it the reason that choice won. The reason line is the whole point
 * of the screen, so it is given its own line rather than tucked into the same
 * sentence as the choice, and the two columns share the row shape so the eye
 * can travel across a row and see what the interview moved.
 */

/**
 * One column's answer, as an itinerary.
 *
 * Falls back to the raw paragraph when the model ignored the row shape, because
 * a prose answer is still a real answer and the comparison survives it. The
 * reason line is dropped when a row came back without one instead of leaving an
 * empty line under the choice.
 */
function PlanRows({ rows, fallback, tone }) {
  if (!rows?.length) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
        {fallback || "(no answer)"}
      </p>
    );
  }
  const rule = tone === "with" ? "border-teal/30" : "border-sand-deep";
  // Not the section-label class. That rule is unlayered in globals.css and so
  // wins the cascade over any Tailwind text color, which would quietly render
  // both columns' hours in the same gray and lose half the point of the pair.
  const when = `text-[0.7rem] font-semibold uppercase tracking-[0.09em] tabular-nums ${
    tone === "with" ? "text-teal" : "text-ink-soft"
  }`;
  return (
    <ol className="space-y-3">
      {rows.map((row, i) => (
        <li
          key={`${row.when}-${i}`}
          className={`${i > 0 ? `border-t ${rule} pt-3` : ""}`}
        >
          <p className={when}>{row.when}</p>
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

export default function ProofClient({ demo = false, backHref = null } = {}) {
  const router = useRouter();
  const [category, setCategory] = useState("food");
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
      // A rehearsal carries whatever family was typed on the way here, so
      // the "with what you told me" side answers about that family rather
      // than the built-in stand-in. Read at fetch time rather than held in
      // state, so a person who steps back, changes an answer, and returns
      // gets the changed answer in the comparison. Null on a real visit and
      // on an untouched rehearsal, and ignored by the endpoint either way.
      body: JSON.stringify({
        category,
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
  }, [category, demo, destination]);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="section-label text-ink-soft">Proof</p>
        <h1 className="font-display text-3xl font-semibold leading-tight">
          Watch the same question, answered two ways.
        </h1>
        {/* Which side is which is already said by the two column headers, and
            the reason printed under each choice speaks for itself once you are
            looking at it. What is left is the pair of facts the screen cannot
            show: that the question is a real one about a real trip, and that
            nothing but the interview differs between the two answers. That
            second fact used to be carried by the word model, which asks a
            family on their first screen to know what a model is. */}
        <p className="text-base leading-relaxed text-ink-soft">
          Aly answers one real question about your trip twice. Nothing changes
          between the two answers except whether she knows what you just told
          her.
        </p>
        {/* A rehearsal answers about a stand-in family, and which stand-in it
            is changes what the right-hand answer should look like. Saying so
            here is what lets somebody tell a working comparison from one that
            quietly fell back to the built-in family. */}
        {demo && (
          <p className="text-sm leading-relaxed text-ink-soft">
            {data?.standInCustom
              ? "This is a rehearsal, answered about the family you typed on the way here."
              : "This is a rehearsal, answered about a stand-in family. Walk the practice chain from the welcome form to use your own answers instead."}
          </p>
        )}
      </header>

      <nav
        className="flex flex-wrap items-center gap-2"
        aria-label="Question category"
      >
        <span className="section-label text-ink-soft">Ask about:</span>
        <button
          type="button"
          onClick={() => setCategory("food")}
          className={`rounded-full border px-3 py-1.5 text-sm ${
            category === "food"
              ? "border-teal bg-teal text-white"
              : "border-sand-deep bg-white text-ink-soft"
          }`}
        >
          Where to eat
        </button>
        <button
          type="button"
          onClick={() => setCategory("day")}
          className={`rounded-full border px-3 py-1.5 text-sm ${
            category === "day"
              ? "border-teal bg-teal text-white"
              : "border-sand-deep bg-white text-ink-soft"
          }`}
        >
          What to do
        </button>
      </nav>

      {/* No trip on the calendar and no destination given yet. Asked as one
          question rather than assumed, because the answer is the difference
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
          <input
            id="proof-place"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            placeholder="Alaska, Curacao, Orlando, anywhere"
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
          <CompassLoader
            size={64}
            label="Aly is answering the same question twice."
          />
          <p className="text-sm text-ink-soft">
            Two answers, side by side. This takes a moment.
          </p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-2xl border border-terra-deep/50 bg-terra-soft/40 p-4 text-sm text-ink">
          {error}{" "}
          <button
            type="button"
            className="ml-2 underline underline-offset-4"
            onClick={() => setCategory(category)}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && data && !data.needsDestination && (
        <>
          <section
            aria-labelledby="proof-question-heading"
            className="rounded-2xl border border-sand-deep bg-sand-soft/60 p-4"
          >
            <p className="section-label text-ink-soft">
              The question Aly is answering
            </p>
            <p
              id="proof-question-heading"
              className="mt-1 font-display text-lg text-ink"
            >
              &ldquo;{data.question}&rdquo;
            </p>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <article className="flex flex-col gap-2 rounded-2xl border border-sand-deep bg-white p-4">
              <header>
                <p className="section-label text-ink-soft">
                  Aly, knowing nothing about you
                </p>
                <p className="mt-1 text-xs italic text-ink-soft">
                  What a general travel article would say.
                </p>
              </header>
              <PlanRows
                rows={data.withoutRows}
                fallback={data.without}
                tone="without"
              />
            </article>

            <article className="flex flex-col gap-2 rounded-2xl border-2 border-teal bg-teal-soft/30 p-4">
              <header>
                {/* Same cascade trap as the hour above: section-label would
                    override the teal, so the label is spelled out here. */}
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-teal">
                  Aly, with your interview
                </p>
                <p className="mt-1 text-xs italic text-ink-soft">
                  Based on the {data.preferenceCount || "several"} things you
                  just told her.
                </p>
              </header>
              <PlanRows
                rows={data.withPrefsRows}
                fallback={data.withPrefs}
                tone="with"
              />
            </article>
          </div>

          <p className="text-xs italic text-ink-soft">
            Aly will say different things on different runs. What stays true is
            which of these two fits your family.
          </p>
        </>
      )}

      <div className="flex flex-wrap gap-2 border-t border-sand-deep pt-5">
        {/* This used to open one more onboarding screen, which said what Aly
            would do and offered one more question to ask her. Two demos in a
            row before the family had done anything, when the thing they need
            next is a trip. So the proof screen is the last one, and this button
            is the first real piece of work: the trip builder when there is no
            trip yet, the trip list when there already is one. */}
        <button
          type="button"
          onClick={() => {
            if (demo) {
              router.push(backHref || "/interview-check");
              return;
            }
            router.push(data?.onCalendar ? "/trips" : "/trips/new");
          }}
          className="btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
        >
          {demo || data?.onCalendar ? "Take me to my trips" : "Plan our trip"}
        </button>
      </div>
    </div>
  );
}
