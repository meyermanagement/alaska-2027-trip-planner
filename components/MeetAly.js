"use client";

import { useEffect, useRef, useState } from "react";
import { Needle, RING_LEN, BEZEL } from "@/components/CompassLoader";
import { ALY_ABILITIES } from "@/lib/welcome/alyAbilities";

/**
 * Meet Aly -- the first screen a brand-new primary sees.
 *
 * Three acts, in the order a person reads them:
 *
 *   1. Aly says hello, in her own voice, once.
 *   2. What she looks after -- one panel of short lines, not eight separate
 *      boxes. Eight bordered cards read as a wall and get skipped; eight lines
 *      inside one bordered panel read as a list of jobs. Every line carries the
 *      question a family actually has about it, and tapping the question has
 *      Aly answer it live, before this family has an account or a trip.
 *   3. The promise -- the company line, and who stays in charge -- immediately
 *      above the button in. Said last on purpose: the same words at the top of
 *      the screen would be a slogan somebody has to take on trust, and after
 *      eight specific jobs they are a summary of what was just read.
 *
 * There used to be a third act: one question -- where to eat on a Friday night
 * in Paris -- answered four ways for four invented families, with a box under
 * it that ran the same demonstration live on the primary's own question. It
 * argued the right thing, that Aly answers the same question differently
 * depending on who is asking, but it argued it with strangers. The per-line
 * questions make the same argument about this family's own screen and about
 * things the app actually does, so the invented families are gone.
 *
 * ---- Motion -------------------------------------------------------------
 *
 * This is the screen the whole app gets judged on, so nothing on it simply
 * appears. The mark builds itself and finds north, the greeting rises a word
 * at a time out of a clipped line, each hairline in the panel draws west to
 * east, and an answer Aly has just written is uncovered from its top edge the
 * way a line of writing appears rather than sliding in from somewhere.
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
 * the eight lines and their questions are the argument, so anything that says
 * in prose what a line already says is cut. For the same reason the line about
 * what happens to what you tell her sits beside the button at the bottom, where
 * somebody about to commit is the one who wants it, rather than interrupting
 * the hello.
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
};

/**
 * True once the boot veil has lifted off the page.
 *
 * This is the whole reason the screen's opening sequence was invisible. The
 * veil in the layout covers everything for the first five and a half seconds of
 * a cold open, and it sits at z-index 90 over a page that is already mounted
 * and already on screen -- so the hero's observer fired immediately, the
 * compass drew itself, the needle swung in and the greeting finished speaking,
 * all of it behind a splash, and the veil lifted onto a settled screen. An
 * introduction nobody can see is not an introduction.
 *
 * The veil announces itself by setting data-booted on <html>, so that is what
 * this watches. Three ways out, because the screen must never be stuck waiting:
 * the flag may already be set by the time this mounts on a warm navigation,
 * there may be no veil in the document at all, and the stylesheet lifts the
 * veil on its own at eight seconds if the veil's own component never ran.
 */
function useBooted() {
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.booted || !document.getElementById("boot-veil")) {
      setBooted(true);
      return;
    }
    // A beat after the flag, not on it: the veil takes 420ms to fade, and the
    // compass drawing itself through a dissolving splash is the one part of the
    // sequence worth waiting a fifth of a second for a clear page to show.
    let settle = null;
    const done = () => {
      mo.disconnect();
      clearTimeout(failsafe);
      settle = setTimeout(() => setBooted(true), 240);
    };
    const mo = new MutationObserver(() => {
      if (root.dataset.booted) done();
    });
    mo.observe(root, { attributes: true, attributeFilter: ["data-booted"] });
    const failsafe = setTimeout(done, 8200);
    return () => {
      mo.disconnect();
      clearTimeout(failsafe);
      if (settle) clearTimeout(settle);
    };
  }, []);

  return booted;
}

/**
 * True once the returned ref's element has been on screen. Fires once and
 * forgets: a block that has arrived does not arrive again on the way back up.
 *
 * A browser with no observer to ask is treated as already revealed on its first
 * effect, so an old browser gets the screen rather than a blank one -- but never
 * on the first render, because the server has to agree with it.
 */
function useRevealed(rootMargin = "-12% 0px -8% 0px") {
  const ref = useRef(null);
  // Always false on the first render, on the server and in the browser alike.
  // Reading IntersectionObserver here instead made the server send the markup
  // with the block already revealed and the browser hydrate it as not revealed,
  // which React reports as a hydration mismatch and does not patch up. The
  // no-observer case is handled in the effect below, where it is a browser fact
  // rather than a rendering one.
  const [shown, setShown] = useState(false);

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
 * The question under one of the eight lines, and whatever Aly has said about it.
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
      {/* The turning needle rather than the three dots: this is the one wait
          left on the screen and it is a real one, so it gets the mark the rest
          of the app uses for work actually happening. */}
      {open && state?.busy && (
        <p className="mt-2 flex items-center gap-2 text-xs text-ink-faint">
          <ThinkingMark />
          Aly is thinking
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
  const [armed, setArmed] = useState(false);
  // One entry per line the family has poked at, keyed by ability. Answers are
  // kept once fetched, so tapping a line shut and open again is instant and
  // does not ask the model the same question twice.
  const [topics, setTopics] = useState({});

  // Only once JavaScript is running does the CSS get permission to hide
  // anything. Before this, and forever in a browser with scripting off, the
  // screen is plainly visible.
  useEffect(() => setArmed(true), []);

  // Nothing moves while the boot veil is still over the page. Every block's
  // reveal is the observer AND this, so a section the family scrolls to later
  // is unaffected and the hero waits for the splash instead of playing under it.
  const booted = useBooted();

  const [heroRef, heroShown] = useRevealed("0px");
  const [abilitiesRef, abilitiesShown] = useRevealed();
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

  return (
    <div className="space-y-10" {...(armed ? { "data-ma-armed": "1" } : {})}>
      {practice && <p className="section-label text-ink-soft">Practice</p>}

      {/* 1. The greeting. */}
      <header
        ref={heroRef}
        {...(booted && heroShown ? { "data-ma-shown": "1" } : {})}
      >
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
            // Ends on the word it is about. The line used to finish "and not a
            // generic traveler", which spent its last breath on somebody who is
            // not in the room, and made a claim about other software rather than
            // a promise to the person reading.
            "I remember who you travel with, what you like, and what you skip, so every answer I give is meant for you.",
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

      {/* 2. What she looks after. One panel of eight lines in
          two columns, with hairlines between them instead of a border each:
          the same eight facts, read as one list of jobs rather than as a wall
          of cards.

          Every line is also a question. Under each one sits the thing a person
          actually wants to know about it, and tapping that asks Aly the
          question and she answers it right there, live, before this family has
          an account or a trip. Eight claims a stranger can interrogate is a
          different thing from eight claims a stranger has to take on faith,
          and it is most of the difference between reading about somebody and
          being introduced to them. */}
      <section
        ref={abilitiesRef}
        {...(booted && abilitiesShown ? { "data-ma-shown": "1" } : {})}
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
                {/* Three bullets rather than a paragraph, and they come in one
                    after another rather than as a block, so the list reads at
                    the speed somebody is scanning it. The dot is drawn rather
                    than a list marker, because a marker cannot be given the
                    teal or held on the first line of a bullet that wraps. */}
                <ul className="mt-1.5 space-y-1">
                  {a.points.map((point, j) => (
                    <li
                      key={point}
                      className="ma-in relative pl-3.5 text-sm leading-relaxed text-ink-soft before:absolute before:left-0 before:top-[0.6em] before:h-1 before:w-1 before:rounded-full before:bg-teal/60"
                      style={{ animationDelay: `${at + 0.16 + j * 0.05}s` }}
                    >
                      {point}
                    </li>
                  ))}
                </ul>
                <AbilityQuestion
                  ability={a}
                  state={topics[a.key]}
                  onAsk={askAbility}
                  delay={at + 0.34}
                />
              </article>
            );
          })}
        </div>
      </section>

      <div
        ref={footRef}
        {...(booted && footShown ? { "data-ma-shown": "1" } : {})}
      >
        <div className="ma-rule h-px bg-sand-deep" />
        {/* 3. The promise, last.

            The company line, arriving after the eight jobs rather than before
            them, because a promise made at the top of a screen is a slogan and
            the same words after eight specific claims are a summary of what was
            just read. The short form on purpose: the full version reaches at
            home and at work as well, and this app is only away yet, so the
            screen says the part it can keep and leaves the rest to the company
            that grows into it.

            The second half is the half a family needs on their first screen.
            Something that plans your trip, packs for you and watches your
            passport is only a relief if it cannot act on its own, so what she
            has your back with and what stays yours are said in the same
            breath, immediately above the button that takes them in.

            The first half is about time, not tasks. Earlier versions promised
            nothing would be booked, bought or sent, and then that every part of
            the trip was in view, and both read as promises about getting a trip
            arranged - which is the smallest part of what she does. The trip that
            matters is the one being lived: the morning it rains, the ferry that
            moves, the tip that arrives the day before it is useful, the list
            that packs you for the way home. So it names the span and stops.

            Length is a constraint here, not a preference. This paragraph fades
            in with the button below it on a fixed delay, so a third line moves
            the button and pushes the privacy line under the fold. Measured on
            the rendered page: two lines at 390, 360 and 320 pixels wide. Any
            rewrite past about seventy-eight characters breaks that at 320. */}
        <p
          className="ma-in mt-6 font-display text-xl leading-snug text-ink"
          style={{ animationDelay: "0.05s" }}
        >
          Aly has your back. You stay in control.
        </p>
        <p
          className="ma-in mt-1.5 text-sm leading-relaxed text-ink-soft"
          style={{ animationDelay: "0.12s" }}
        >
          From the first idea to the last day home. Nothing changes unless you
          say so.
        </p>
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
