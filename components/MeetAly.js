"use client";

import { useState } from "react";
import { Housing, Needle } from "@/components/CompassLoader";
import {
  DEMO_FAMILIES,
  DEMO_QUESTION,
  DEMO_DESTINATION,
} from "@/lib/welcome/meetAlyDemo";
import { ALY_ABILITIES } from "@/lib/welcome/alyAbilities";

/**
 * Meet Aly -- the first screen a brand-new primary sees.
 *
 * Three acts, in one downward sequence, and the screen is organized around
 * that sequence rather than around four sections of equal weight:
 *
 *   1. Aly says hello, in her own voice, once.
 *   2. What she looks after besides the itinerary -- one panel of short lines,
 *      not seven separate boxes. Seven bordered cards read as a wall and get
 *      skipped; seven lines inside one bordered panel read as a list of jobs.
 *   3. The demonstration: the same question answered four ways, and directly
 *      underneath it the box that runs the same demonstration live on the
 *      primary's own question. The example and the live version belong to one
 *      section, because they are the same argument twice -- once prepared and
 *      once proved.
 *
 * The abilities come before the demonstration on purpose. A family that reads
 * only the demonstration concludes this is a cleverer way to get trip ideas,
 * and then finds the wallet, the packing lists, the budget, the reminders and
 * the on-trip answers by accident weeks later.
 *
 * The demo pair is fixed strings so the first screen paints instantly and
 * never fails. The live box below is the model doing the same job in front of
 * the primary, on demand, so what looked like polish is proven to be real.
 *
 * Motion. Every block carries `meet-aly-in` with its position in the sequence
 * as an inline delay, and the needle in the greeting swings to north as it
 * arrives -- the same swing the after-welcome checklist uses, so the mark
 * behaves like one instrument across the first-run screens. It settles in
 * about a second and then holds still. Nothing loops except the thinking dots,
 * which are the one piece of movement on the screen that carries information.
 * All of it is off under prefers-reduced-motion.
 *
 * The copy here is deliberately thin. The screen has to argue that Aly is not
 * a search box, and the demonstration is the argument -- so anything that says
 * in prose what the four columns already show is cut, including the sentence
 * that used to tell people to compare them. A screen that both shows and
 * explains gets read as an explanation and skipped. For the same reason the
 * line about what happens to your information sits down beside the button,
 * where somebody about to commit is the one who wants it, instead of in the
 * greeting where it interrupts the introduction.
 *
 * onContinue is the escape hatch: the button below moves the primary to the
 * next screen (the welcome form in real mode, back to the practice hub in
 * practice mode). The component itself does not know which one.
 */

// Where each block lands in the arrival sequence, in seconds. Kept in one
// place so the order on screen and the order in time can be read together and
// cannot drift apart as blocks move.
const BEAT = {
  greeting: 0,
  greetingBody: 0.1,
  abilities: 0.2,
  abilityRow: 0.26,
  abilityStep: 0.04,
  demo: 0.44,
  demoCard: 0.5,
  demoStep: 0.08,
  ask: 0.86,
  footer: 0.96,
};

function ThinkingDots() {
  return (
    <span className="aly-dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

export default function MeetAly({
  onContinue,
  continueLabel = "Take me in",
  practice = false,
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState("");

  async function ask() {
    const q = question.trim();
    if (!q || q.length < 3 || busy) return;
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      const res = await fetch("/api/welcome/meet-aly-demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Aly did not reply this time.");
        setBusy(false);
        return;
      }
      setAnswer({ answers: data.answers || {}, question: q });
      setBusy(false);
    } catch {
      setError("That did not go through. Try again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      {practice && <p className="section-label text-ink-soft">Practice</p>}

      {/* 1. The greeting. */}
      <header>
        <div
          className="meet-aly-in flex items-start gap-4"
          style={{ animationDelay: `${BEAT.greeting}s` }}
        >
          <span
            className="inline-flex h-14 w-14 shrink-0 items-center justify-center text-teal"
            aria-hidden="true"
          >
            <svg viewBox="0 0 32 32" fill="none" className="h-14 w-14">
              <Housing />
              {/* Same swing the after-welcome checklist marks use. */}
              <g
                className="next-steps-needle"
                style={{ animationDelay: `${BEAT.greeting + 0.15}s` }}
              >
                <Needle spin={false} />
              </g>
            </svg>
          </span>
          <div>
            <p className="section-label text-ink-soft">Meet Aly</p>
            <h1 className="mt-1 font-display text-3xl font-semibold leading-tight">
              Hi &mdash; I&rsquo;m Aly.
            </h1>
          </div>
        </div>
        <p
          className="meet-aly-in mt-4 max-w-2xl text-base leading-relaxed text-ink"
          style={{ animationDelay: `${BEAT.greetingBody}s` }}
        >
          I look after your family&rsquo;s travel &mdash; the trip itself, and
          everything around it. I remember who you travel with, what you like,
          and what you skip, so my answers fit you and not a generic traveler.
        </p>
      </header>

      {/* 2. What she does besides plan the days. One panel of seven lines in
          two columns, with hairlines between them instead of a border each:
          the same seven facts, read as one list of jobs rather than as a wall
          of cards. Nothing here is tappable -- the family has no account yet,
          and a row that looks like a button and does nothing is worse than a
          row that plainly reads as a sentence. */}
      <section
        aria-labelledby="meet-aly-abilities-heading"
        className="meet-aly-in rounded-2xl border border-sand-deep bg-white p-5 sm:p-6"
        style={{ animationDelay: `${BEAT.abilities}s` }}
      >
        <h2
          id="meet-aly-abilities-heading"
          className="font-display text-lg font-semibold text-ink"
        >
          What I look after
        </h2>
        <div className="mt-1 grid gap-x-8 sm:grid-cols-2">
          {ALY_ABILITIES.map((a, i) => (
            <article
              key={a.key}
              // An odd number of lines leaves half a rule hanging at the
              // bottom of a two-column list, so the last one takes the whole
              // width and the list closes on a full-width hairline.
              className={`meet-aly-in border-t border-sand-deep py-3.5 ${
                i === ALY_ABILITIES.length - 1 && ALY_ABILITIES.length % 2
                  ? "sm:col-span-2"
                  : ""
              }`}
              style={{
                animationDelay: `${BEAT.abilityRow + i * BEAT.abilityStep}s`,
              }}
            >
              {/* Spelled out rather than section-label: that rule is unlayered
                  in globals.css and would win over the teal. */}
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-teal">
                {a.heading}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {a.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      {/* 3. The demonstration, and the live version of it, in one section. */}
      <section
        aria-labelledby="meet-aly-demo-heading"
        className="meet-aly-in rounded-2xl border border-sand-deep bg-sand-soft/60 p-5 sm:p-6"
        style={{ animationDelay: `${BEAT.demo}s` }}
      >
        <p className="section-label text-ink-soft">
          The same question, four families
        </p>
        <h2
          id="meet-aly-demo-heading"
          className="mt-1 font-display text-lg font-semibold leading-snug text-ink"
        >
          &ldquo;{DEMO_QUESTION}&rdquo;
          <span className="text-ink-soft"> &mdash; {DEMO_DESTINATION}</span>
        </h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {DEMO_FAMILIES.map((f, i) => (
            <article
              key={f.key}
              className="meet-aly-in flex flex-col rounded-xl border border-sand-deep bg-white p-4"
              style={{
                animationDelay: `${BEAT.demoCard + i * BEAT.demoStep}s`,
              }}
            >
              <p className="font-display text-base font-semibold text-ink">
                {f.heading}
              </p>
              {/* The two facts as chips rather than a bulleted list: they are
                  what Aly knows about this family, not points she is making,
                  and the shape says so before the words are read. */}
              {/* Two rows' worth of height whether the chips wrap or not, so
                  the hairline above the answers sits at the same place in
                  every card and the four answers can be read across. */}
              <div className="mt-2 flex min-h-[3.25rem] flex-wrap content-start gap-1.5">
                {f.facts.map((fact) => (
                  <span
                    key={fact}
                    className="rounded-full border border-sand-deep bg-sand-soft/70 px-2 py-0.5 text-[0.7rem] leading-relaxed text-ink-soft"
                  >
                    {fact}
                  </span>
                ))}
              </div>
              <p className="mt-3 border-t border-sand-deep pt-3 text-sm leading-relaxed text-ink">
                {f.answer}
              </p>
            </article>
          ))}
        </div>

        {/* The live version, inside the same section and under the same four
            families, so it reads as the demonstration being run again on the
            family's own question rather than as a separate feature. */}
        <div
          className="meet-aly-in mt-6 border-t border-sand-deep pt-5"
          style={{ animationDelay: `${BEAT.ask}s` }}
        >
          <h3 className="font-display text-base font-semibold text-ink">
            Ask something of your own
          </h3>
          <label htmlFor="meet-aly-question" className="sr-only">
            Your question
          </label>
          <textarea
            id="meet-aly-question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            maxLength={240}
            placeholder={`e.g. "Where should we eat on a Friday night in Paris?"`}
            className="mt-2 w-full rounded-lg border border-sand-deep bg-white p-3 text-sm text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={ask}
              disabled={busy || question.trim().length < 3}
              className="btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  Thinking
                  <ThinkingDots />
                </span>
              ) : (
                "Ask Aly"
              )}
            </button>
            {error && <p className="text-xs text-terra-deep">{error}</p>}
          </div>

          {answer && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {DEMO_FAMILIES.map((f, i) => (
                <article
                  key={f.key}
                  className="meet-aly-in rounded-xl border border-teal/30 bg-white p-4"
                  // A fresh answer arrives in the same left-to-right order the
                  // examples did. The delay is from mount, not from the page,
                  // so this stagger is the answers landing rather than the
                  // page opening.
                  style={{ animationDelay: `${i * BEAT.demoStep}s` }}
                >
                  <p className="font-display text-base font-semibold text-ink">
                    {f.heading}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
                    {answer.answers[f.key] || "(no answer this time)"}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      <div
        className="meet-aly-in space-y-4 border-t border-sand-deep pt-6"
        style={{ animationDelay: `${BEAT.footer}s` }}
      >
        <button
          type="button"
          onClick={onContinue}
          className="btn btn-primary whitespace-nowrap px-5 py-2.5 text-sm"
        >
          {continueLabel}
        </button>
        <p className="text-sm leading-relaxed text-ink-soft">
          What you tell me stays on your family&rsquo;s file, never sold. You
          can read or delete any of it on the Family and Preferences pages.
        </p>
      </div>
    </div>
  );
}
