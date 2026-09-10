"use client";

import { useEffect, useRef, useState } from "react";
import { Needle, RING_LEN, BEZEL } from "@/components/CompassLoader";
import {
  DEMO_FAMILIES,
  DEMO_QUESTION,
  DEMO_DESTINATION,
} from "@/lib/welcome/meetAlyDemo";
import { ALY_ABILITIES } from "@/lib/welcome/alyAbilities";

/**
 * Meet Aly -- the first screen a brand-new primary sees.
 *
 * Three acts, in the order a person reads them:
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
 * ---- Motion -------------------------------------------------------------
 *
 * This is the screen the whole app gets judged on, so nothing on it simply
 * appears. The mark builds itself and finds north, the greeting rises a word
 * at a time out of a clipped line, each hairline in the panel draws west to
 * east, each family's facts pop in as small hard objects, and a live answer is
 * uncovered from its top edge the way a line of writing appears rather than
 * sliding in from somewhere.
 *
 * The part that matters most is when all of that runs. Every block waits until
 * it is actually on screen, because an animation that played while it was
 * below the fold is an animation nobody saw, and scrolling into a section that
 * has already finished moving feels flatter than one that never moved. That is
 * what `useRevealed` is for: one IntersectionObserver per block, disconnected
 * the moment it fires, so a block moves once and never again while the primary
 * scrolls back and forth.
 *
 * Two things make this safe rather than clever. `armed` is set in an effect,
 * so the CSS only hides anything once JavaScript is running -- a browser with
 * scripting off renders the whole screen plainly visible instead of a page of
 * invisible blocks waiting for an observer that will never come. And a browser
 * with no IntersectionObserver is treated as already-revealed rather than
 * never-revealed. All of the movement is off under prefers-reduced-motion; the
 * needle beside Thinking, which is the one piece of movement carrying
 * information rather than delight, keeps its own slower treatment there.
 *
 * ---- Copy ---------------------------------------------------------------
 *
 * Deliberately thin. The screen has to argue that Aly is not a search box, and
 * the demonstration is the argument, so anything that says in prose what the
 * four columns already show is cut -- including the sentence that used to tell
 * people to compare them. For the same reason the line about what happens to
 * what you tell her sits beside the button at the bottom, where somebody about
 * to commit is the one who wants it, rather than interrupting the hello.
 *
 * onContinue is the escape hatch: the button below moves the primary to the
 * next screen (the welcome form in real mode, back to the practice hub in
 * practice mode). The component itself does not know which one.
 */

// Where each thing lands inside its own block, in seconds. Because blocks wait
// for the scroll rather than for the clock, these are offsets from the moment a
// block is revealed -- not positions in one page-long timeline.
const BEAT = {
  markTicks: 0.1, // after the rim starts closing
  markTickStep: 0.028,
  needle: 0.32,
  eyebrow: 0.18,
  word: 0.34,
  wordStep: 0.075,
  // She finishes saying her name at about 1.3s. Then a pause you can see,
  // then the two things she wants you to know, one line at a time.
  beat: 1.28,
  say: 1.92,
  sayStep: 0.46,
  abilityHeading: 0,
  abilityRow: 0.12,
  abilityStep: 0.055,
  demoHeading: 0,
  demoCard: 0.14,
  demoCardStep: 0.09,
  chip: 0.26, // after the card it sits in
  chipStep: 0.07,
  answer: 0.34,
  ask: 0.2,
  liveStep: 0.11,
};

/**
 * True once the returned ref's element has been on screen. Fires once and
 * forgets: a block that has arrived does not arrive again on the way back up.
 *
 * Starts true where there is no observer to ask, so an old browser gets the
 * screen rather than a blank one.
 */
function useRevealed(rootMargin = "-12% 0px -8% 0px") {
  const ref = useRef(null);
  const [shown, setShown] = useState(
    typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, rootMargin]);

  return [ref, shown];
}

/**
 * The Alyeska mark, built rather than drawn whole: the rim closes round from
 * north, the sixteen marks drop in clockwise behind it, and the needle swings
 * in off-heading and settles. Same geometry the boot splash and the loader use
 * -- imported, not redrawn -- so the mark on the first screen is the same
 * instrument, not a lookalike.
 */
function BuildingMark() {
  return (
    <span
      className="inline-flex h-14 w-14 shrink-0 items-center justify-center text-teal"
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" fill="none" className="h-14 w-14">
        {/* A circle path starts at the east point, so it is turned back a
            quarter to open from north, which is where the eye is. */}
        <circle
          cx="16"
          cy="16"
          r="15"
          stroke="currentColor"
          strokeWidth="1"
          className="ma-draw"
          transform="rotate(-90 16 16)"
          style={{ "--len": RING_LEN }}
        />
        {BEZEL.map(([d, w, o, len], i) => (
          <path
            key={d}
            d={d}
            stroke="currentColor"
            strokeWidth={w}
            strokeLinecap="round"
            opacity={o}
            className="ma-draw"
            style={{
              "--len": len,
              animationDuration: "0.24s",
              animationDelay: `${BEAT.markTicks + i * BEAT.markTickStep}s`,
            }}
          />
        ))}
        <g className="ma-swing" style={{ animationDelay: `${BEAT.needle}s` }}>
          {/* Two groups, so the endless drift composes with the one-off swing
              rather than replacing its rotation. */}
          <g className="ma-drift">
            <Needle spin={false} />
          </g>
        </g>
      </svg>
    </span>
  );
}

/** The needle, spinning, for the one wait on this screen that is a real wait. */
function ThinkingMark() {
  return (
    <span className="compass-spin inline-flex" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" width="14" height="14">
        <Needle />
      </svg>
    </span>
  );
}

/**
 * The question under one of the seven lines, and whatever Aly has said about it.
 *
 * Deliberately a button with the question written on it rather than an icon or
 * the whole row being tappable. A person reading the line has a specific thing
 * they want to know, and seeing their own question already written is what
 * makes it obvious they are allowed to ask it -- an icon would have to be
 * learned, and a tappable row would leave them guessing what tapping does.
 *
 * The answer is bordered on its left rather than boxed, because it is Aly
 * speaking in reply to the line above it and not a new panel of content.
 */
function AbilityQuestion({ ability, state, onAsk, delay }) {
  const open = Boolean(state?.open);
  return (
    <>
      <button
        type="button"
        onClick={() => onAsk(ability)}
        aria-expanded={open}
        className={`ma-in mt-2 inline-flex max-w-full items-center rounded-lg border px-2.5 py-1 text-left text-xs leading-snug text-teal transition-colors duration-200 ${
          open
            ? "border-teal/50 bg-teal-soft/60"
            : "border-teal/25 bg-white hover:border-teal/60 hover:bg-teal-soft/40"
        }`}
        style={{ animationDelay: `${delay}s` }}
      >
        {ability.ask}
      </button>
      {open && state?.busy && (
        <p className="mt-2 text-ink-faint">
          <span className="aly-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="sr-only">Aly is thinking</span>
        </p>
      )}
      {open && state?.answer && (
        <p className="ma-write mt-2 border-l-2 border-teal/30 pl-3 text-sm leading-relaxed text-ink">
          {state.answer}
        </p>
      )}
      {open && state?.error && (
        <p className="mt-2 text-xs text-terra-deep">{state.error}</p>
      )}
    </>
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
  const [armed, setArmed] = useState(false);
  // One entry per line the family has poked at, keyed by ability. Answers are
  // kept once fetched, so tapping a line shut and open again is instant and
  // does not ask the model the same question twice.
  const [topics, setTopics] = useState({});

  // Only once JavaScript is running does the CSS get permission to hide
  // anything. Before this, and forever in a browser with scripting off, the
  // screen is plainly visible.
  useEffect(() => setArmed(true), []);

  const [heroRef, heroShown] = useRevealed("0px");
  const [abilitiesRef, abilitiesShown] = useRevealed();
  const [demoRef, demoShown] = useRevealed();
  const [askRef, askShown] = useRevealed();
  const [footRef, footShown] = useRevealed();

  /**
   * A line in "What I look after", tapped. The first tap asks Aly the
   * question that line carries; a second folds her answer away; a third opens
   * the answer we already have rather than asking for it twice.
   */
  async function askAbility(a) {
    const held = topics[a.key];
    if (held?.busy) return;
    if (held?.open) {
      setTopics((t) => ({ ...t, [a.key]: { ...held, open: false } }));
      return;
    }
    if (held?.answer) {
      setTopics((t) => ({ ...t, [a.key]: { ...held, open: true } }));
      return;
    }
    setTopics((t) => ({ ...t, [a.key]: { open: true, busy: true } }));
    try {
      const res = await fetch("/api/welcome/meet-aly-ability", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: a.key }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.answer) {
        setTopics((t) => ({
          ...t,
          [a.key]: {
            open: true,
            error: data?.error || "Aly did not reply this time.",
          },
        }));
        return;
      }
      setTopics((t) => ({
        ...t,
        [a.key]: { open: true, answer: data.answer },
      }));
    } catch {
      setTopics((t) => ({
        ...t,
        [a.key]: { open: true, error: "That did not go through." },
      }));
    }
  }

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
    <div className="space-y-10" {...(armed ? { "data-ma-armed": "1" } : {})}>
      {practice && <p className="section-label text-ink-soft">Practice</p>}

      {/* 1. The greeting. */}
      <header ref={heroRef} {...(heroShown ? { "data-ma-shown": "1" } : {})}>
        <div className="flex items-start gap-4">
          <BuildingMark />
          <div>
            <p
              className="ma-fade section-label text-ink-soft"
              style={{ animationDelay: `${BEAT.eyebrow}s` }}
            >
              Meet Aly
            </p>
            <h1 className="mt-1 font-display text-3xl font-semibold leading-tight">
              {/* One clipped line per word, so each rises out of the line
                  rather than fading on top of it. */}
              {["Hi", "\u2014", "I\u2019m", "Aly."].map((word, i) => (
                <span key={word} className="ma-line">
                  <span
                    className="ma-word"
                    style={{
                      animationDelay: `${BEAT.word + i * BEAT.wordStep}s`,
                    }}
                  >
                    {word}
                  </span>
                  {i < 3 ? "\u00a0" : ""}
                </span>
              ))}
            </h1>
          </div>
        </div>
        {/* She is being introduced, not described, so what she has to say
            about herself arrives the way a person says it: her name first,
            then a pause you can see, then two lines with a breath between
            them. The wrapper is relative because the pause is drawn on top of
            where the first line is about to be, which is what keeps a visible
            pause from costing any height. */}
        <div className="relative mt-4 max-w-2xl">
          <span
            className="ma-beat aly-dots text-ink-faint"
            aria-hidden="true"
            style={{ animationDelay: `${BEAT.beat}s` }}
          >
            <i />
            <i />
            <i />
          </span>
          {[
            "I look after your family\u2019s travel \u2014 the trip itself, and everything around it.",
            "I remember who you travel with, what you like, and what you skip, so my answers fit you and not a generic traveler.",
          ].map((line, i) => (
            <p
              key={line}
              className={`ma-in text-base leading-relaxed text-ink ${i ? "mt-2" : ""}`}
              style={{ animationDelay: `${BEAT.say + i * BEAT.sayStep}s` }}
            >
              {line}
            </p>
          ))}
        </div>
      </header>

      {/* 2. What she does besides plan the days. One panel of seven lines in
          two columns, with hairlines between them instead of a border each:
          the same seven facts, read as one list of jobs rather than as a wall
          of cards.

          Every line is also a question. Under each one sits the thing a person
          actually wants to know about it, and tapping that asks Aly the
          question and she answers it right there, live, before this family has
          an account or a trip. Seven claims a stranger can interrogate is a
          different thing from seven claims a stranger has to take on faith,
          and it is most of the difference between reading about somebody and
          being introduced to them. */}
      <section
        ref={abilitiesRef}
        {...(abilitiesShown ? { "data-ma-shown": "1" } : {})}
        aria-labelledby="meet-aly-abilities-heading"
        className="rounded-2xl border border-sand-deep bg-white p-5 sm:p-6"
      >
        <h2
          id="meet-aly-abilities-heading"
          className="ma-in font-display text-lg font-semibold text-ink"
          style={{ animationDelay: `${BEAT.abilityHeading}s` }}
        >
          What I look after
        </h2>
        <div className="mt-1 grid gap-x-8 sm:grid-cols-2">
          {ALY_ABILITIES.map((a, i) => {
            const at = BEAT.abilityRow + i * BEAT.abilityStep;
            return (
              <article
                key={a.key}
                // An odd number of lines leaves half a rule hanging at the
                // bottom of a two-column list, so the last one takes the whole
                // width and the list closes on a full-width hairline.
                className={`py-3.5 ${
                  i === ALY_ABILITIES.length - 1 && ALY_ABILITIES.length % 2
                    ? "sm:col-span-2"
                    : ""
                }`}
              >
                {/* The rule is its own element rather than a border, because a
                    border cannot be drawn on and this one is. */}
                <div
                  className="ma-rule h-px bg-sand-deep"
                  style={{ animationDelay: `${at}s` }}
                />
                {/* Spelled out rather than section-label: that rule is
                    unlayered in globals.css and would win over the teal. */}
                <p
                  className="ma-in mt-3.5 text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-teal"
                  style={{ animationDelay: `${at + 0.1}s` }}
                >
                  {a.heading}
                </p>
                <p
                  className="ma-in mt-1 text-sm leading-relaxed text-ink-soft"
                  style={{ animationDelay: `${at + 0.16}s` }}
                >
                  {a.body}
                </p>
                <AbilityQuestion
                  ability={a}
                  state={topics[a.key]}
                  onAsk={askAbility}
                  delay={at + 0.22}
                />
              </article>
            );
          })}
        </div>
      </section>

      {/* 3. The demonstration, and the live version of it, in one section. */}
      <section
        aria-labelledby="meet-aly-demo-heading"
        className="rounded-2xl border border-sand-deep bg-sand-soft/60 p-5 sm:p-6"
      >
        <div ref={demoRef} {...(demoShown ? { "data-ma-shown": "1" } : {})}>
          <p
            className="ma-fade section-label text-ink-soft"
            style={{ animationDelay: `${BEAT.demoHeading}s` }}
          >
            The same question, four families
          </p>
          <h2
            id="meet-aly-demo-heading"
            className="ma-in mt-1 font-display text-lg font-semibold leading-snug text-ink"
            style={{ animationDelay: `${BEAT.demoHeading + 0.06}s` }}
          >
            &ldquo;{DEMO_QUESTION}&rdquo;
            <span className="text-ink-soft"> &mdash; {DEMO_DESTINATION}</span>
          </h2>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {DEMO_FAMILIES.map((f, i) => {
              const at = BEAT.demoCard + i * BEAT.demoCardStep;
              return (
                <article
                  key={f.key}
                  className="ma-in flex flex-col rounded-xl border border-sand-deep bg-white p-4"
                  style={{ animationDelay: `${at}s` }}
                >
                  <p className="font-display text-base font-semibold text-ink">
                    {f.heading}
                  </p>
                  {/* The two facts as chips rather than a bulleted list: they
                      are what Aly knows about this family, not points she is
                      making, and the shape says so before the words are read.
                      Two rows' worth of height whether they wrap or not, so
                      the rule above the answers sits at the same place in
                      every card and the four answers can be read across. */}
                  <div className="mt-2 flex min-h-[3.25rem] flex-wrap content-start gap-1.5">
                    {f.facts.map((fact, j) => (
                      <span
                        key={fact}
                        className="ma-chip rounded-full border border-sand-deep bg-sand-soft/70 px-2 py-0.5 text-[0.7rem] leading-relaxed text-ink-soft"
                        style={{
                          animationDelay: `${at + BEAT.chip + j * BEAT.chipStep}s`,
                        }}
                      >
                        {fact}
                      </span>
                    ))}
                  </div>
                  <p
                    className="ma-fade mt-3 border-t border-sand-deep pt-3 text-sm leading-relaxed text-ink"
                    style={{ animationDelay: `${at + BEAT.answer}s` }}
                  >
                    {f.answer}
                  </p>
                </article>
              );
            })}
          </div>
        </div>

        {/* The live version, inside the same section and under the same four
            families, so it reads as the demonstration being run again on the
            family's own question rather than as a separate feature. */}
        <div
          ref={askRef}
          {...(askShown ? { "data-ma-shown": "1" } : {})}
          className="mt-6 pt-5"
        >
          <div
            className="ma-rule mb-5 h-px bg-sand-deep"
            style={{ animationDelay: "0s" }}
          />
          <h3
            className="ma-in font-display text-base font-semibold text-ink"
            style={{ animationDelay: `${BEAT.ask}s` }}
          >
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
            className="ma-in mt-2 w-full rounded-lg border border-sand-deep bg-white p-3 text-sm text-ink transition-colors duration-200 placeholder:text-ink-faint focus:border-teal focus:outline-none"
            style={{ animationDelay: `${BEAT.ask + 0.08}s` }}
          />
          <div
            className="ma-in mt-2 flex flex-wrap items-center gap-3"
            style={{ animationDelay: `${BEAT.ask + 0.14}s` }}
          >
            <button
              type="button"
              onClick={ask}
              disabled={busy || question.trim().length < 3}
              className="btn btn-primary whitespace-nowrap px-4 py-2 text-sm transition-transform duration-150 active:scale-[0.97]"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  Thinking
                  <ThinkingMark />
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
                  // Keyed on the question as well as the family, so asking a
                  // second thing remounts the four cards and they are written
                  // out again instead of silently swapping their text.
                  key={`${answer.question}::${f.key}`}
                  className="ma-write rounded-xl border border-teal/30 bg-white p-4"
                  // Uncovered top edge first, in the same left-to-right
                  // order the examples arrived in.
                  style={{ animationDelay: `${i * BEAT.liveStep}s` }}
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

      <div ref={footRef} {...(footShown ? { "data-ma-shown": "1" } : {})}>
        <div className="ma-rule h-px bg-sand-deep" />
        <button
          type="button"
          onClick={onContinue}
          className="ma-cta btn btn-primary mt-6 whitespace-nowrap px-5 py-2.5 text-sm transition-transform duration-150 hover:-translate-y-px active:translate-y-0"
        >
          {continueLabel}
        </button>
        <p
          className="ma-in mt-4 text-sm leading-relaxed text-ink-soft"
          style={{ animationDelay: "0.2s" }}
        >
          What you tell me stays on your family&rsquo;s file, never sold. You
          can read or delete any of it on the Family and Preferences pages.
        </p>
      </div>
    </div>
  );
}
