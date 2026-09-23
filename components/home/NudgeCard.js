"use client";

import { useEffect, useRef, useState } from "react";
import { useBooted } from "@/components/reveal";

/**
 * The examples in the hero: things Aly sends without being asked.
 *
 * They replaced a typed question ("Where should we eat tonight?") on September
 * 23, 2026, because a question and an answer is the interaction every chat
 * agent shows. What the others do not have is the noticing, so the front door
 * leads with cards that arrive on their own, about the family's own trip, and
 * a pair of choices that leave the family in charge.
 *
 * Three of them, in the order a trip happens, so the set says the headline
 * back: two before you go, one while you are there. Maui is domestic, so the
 * document is a driver's license rather than a passport. It expires March 2,
 * twelve days before the March 14 flight on the Better together card.
 *
 * The second is a plan changing after it was booked: the dog was added to the
 * trip after the condo was. The Hawaii date is real arithmetic: the state
 * counts a 30-day wait from the day after the lab receives the rabies blood
 * sample (dab.hawaii.gov, 5 Day Or Less program), so a February 10 sample
 * clears a March 14 landing with a few days to spare.
 *
 * The choices are spans, not buttons, like every other control drawn on this
 * page: nothing here can be pressed, so a keyboard is never handed a control
 * that goes nowhere.
 *
 * They take turns rather than arriving as a stack, because a nudge is one thing
 * that turns up when it matters, and three at once read as a feed. Each one
 * stays long enough to read at a comfortable pace, counted from its own
 * length. All three sit in one grid cell, so the box is as tall as the longest
 * and the headline beside it never moves. The turn pauses while a pointer or
 * keyboard is on the card and while it is off screen, and the three marks under
 * it are the one real control here: pressing one shows that example and stops
 * the turning, which is also the way to stop it at all. With less motion asked
 * for, the three are simply stacked, as they were.
 *
 * Each carries how much it matters, in the colors the app already uses for how
 * soon a tip needs you: rose when the trip cannot go ahead without it, amber
 * when a plan needs a decision by a date and Aly has already found the options,
 * and teal when Aly has worked it out and only needs a yes. The word is always
 * there beside the color.
 */
const LEVELS = {
  high: "High",
  medium: "Medium",
  low: "Low",
};
const NUDGES = [
  {
    stamp: "Maui · January 8",
    text: "Dani’s driver’s license expires March 2, twelve days before the flight and the rental car pickup. Renew by mid-February.",
    act: "Add reminder",
    level: "high",
  },
  {
    stamp: "Maui · February 3",
    text: "Biscuit is coming now, but the condo doesn’t allow pets. Two pet-friendly condos nearby fit the dates, and the condo cancels free until February 20. Hawaii also needs her rabies blood test at the lab by February 10.",
    act: "See pet-friendly stays",
    level: "medium",
  },
  {
    stamp: "Kīhei · Tuesday, 11:10 am",
    text: "Rain is forecast at 2. Lunch at the condo moves to 12:30 and the Mākena snorkel stays dry. Sunset walk unchanged.",
    act: "Apply",
    level: "low",
  },
];

// Long enough to read each one at about 220 words a minute, and never less
// than five and a half seconds.
const holdFor = (text) => Math.max(5500, text.split(/\s+/).length * 270);

export default function NudgeCard() {
  const [at, setAt] = useState(0);
  const [turning, setTurning] = useState(true);
  const [held, setHeld] = useState(false);
  const [seen, setSeen] = useState(true);
  const box = useRef(null);
  // Nothing turns under the loading screen, so the first example is the first
  // one anybody sees.
  const booted = useBooted();

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) setTurning(false);
    const el = box.current;
    if (!el || !("IntersectionObserver" in window)) return undefined;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!booted || !turning || held || !seen) return undefined;
    const t = setTimeout(() => {
      if (document.visibilityState === "visible") setAt((n) => (n + 1) % NUDGES.length);
    }, holdFor(NUDGES[at].text));
    return () => clearTimeout(t);
  }, [booted, turning, held, seen, at]);

  return (
    <div
      ref={box}
      onPointerEnter={() => setHeld(true)}
      onPointerLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="home-nudge-stack">
        {NUDGES.map((n, i) => (
          <div
            key={n.stamp}
            className="home-nudge rounded-[var(--radius-card)] p-5"
            data-level={n.level}
            data-on={i === at ? "true" : "false"}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="home-nudge-stamp">{n.stamp}</p>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="home-nudge-level">{LEVELS[n.level]}</span>
                <span className="home-nudge-badge">Example</span>
              </span>
            </div>
            <p className="home-nudge-who mt-4">Aly</p>
            <p className="mt-1 text-[15px] leading-relaxed text-[rgba(246,243,236,0.96)]">
              {n.text}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="home-nudge-act" data-act="on">{n.act}</span>
              <span className="home-nudge-act">Not now</span>
            </div>
          </div>
        ))}
      </div>
      <div className="home-nudge-marks mt-3 flex items-center gap-1">
        {NUDGES.map((n, i) => (
          <button
            key={n.stamp}
            type="button"
            className="home-nudge-mark"
            data-level={n.level}
            data-on={i === at ? "true" : "false"}
            aria-label={`Example ${i + 1} of ${NUDGES.length}, ${LEVELS[n.level].toLowerCase()} importance`}
            aria-pressed={i === at}
            onClick={() => {
              setAt(i);
              setTurning(false);
            }}
          />
        ))}
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-[rgba(246,243,236,0.66)]">
        A real nudge is built from your own trip, your own travelers, and your
        own wallet. You choose what changes.
      </p>
    </div>
  );
}
