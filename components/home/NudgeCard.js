"use client";

import { useEffect, useRef, useState } from "react";
import { useBooted } from "@/components/reveal";
import { NUDGES } from "@/lib/home/nudges";

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
 * The second is something that has to be booked on a particular day: the
 * Road to Hāna is Monday, March 16, and Waiʻānapanapa State Park admits
 * visitors only with a timed entry and parking reservation, released 30 days
 * ahead at midnight Hawaii time with no same-day booking
 * (gostateparks.hawaii.gov/waianapanapa, checked September 24, 2026). March 16
 * less 30 days is February 14.
 *
 * The third is the same Tuesday the day demo further down shows: at 7:20 lunch
 * is at one and the 1 PM forecast is passing showers, so at 11:10 Aly moves
 * lunch earlier to get the family home before they start.
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
 * when something has to be done on a date Aly already knows, and teal for a
 * change on the day that Aly has worked out and only needs a yes. The words say what
 * the color means for that card, so the color is never the only signal.
 *
 * The heading says what the cards are and why they matter: nobody has to know
 * the right question to get the answer, because Aly is watching the trip and
 * speaks first. A message that arrives on its own is not something a visitor
 * expects from an assistant, so it is said outright. Each card leads with a title a
 * reader can take in at a glance, and says when it was sent against the trip,
 * because how early Aly noticed is the point.
 */

// Long enough to read each one at about 220 words a minute, and never less
// than five and a half seconds.
const holdFor = (n) => Math.max(5500, `${n.title} ${n.text}`.split(/\s+/).length * 270);

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
    }, holdFor(NUDGES[at]));
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
      <div className="flex items-center justify-between gap-3">
        <p className="home-nudge-heading">Before you think to ask</p>
        <span className="home-nudge-badge">Example</span>
      </div>
      <p className="mb-3 mt-1 text-[12px] leading-relaxed text-[rgba(246,243,236,0.66)]">
        You don’t have to know the right questions to ask. Aly watches your trip and tells you when something needs you.
      </p>
      <div className="home-nudge-stack">
        {NUDGES.map((n, i) => (
          <div
            key={n.sent}
            className="home-nudge rounded-[var(--radius-card)] p-5"
            data-level={n.level}
            data-on={i === at ? "true" : "false"}
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
              <p className="home-nudge-stamp">{n.sent}</p>
              <span className="home-nudge-level">{n.tag}</span>
            </div>
            <p className="home-nudge-title mt-3">{n.title}</p>
            <p className="mt-1 text-[15px] leading-relaxed text-[rgba(246,243,236,0.92)]">
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
            key={n.sent}
            type="button"
            className="home-nudge-mark"
            data-level={n.level}
            data-on={i === at ? "true" : "false"}
            aria-label={`Example ${i + 1} of ${NUDGES.length}: ${n.title}`}
            aria-pressed={i === at}
            onClick={() => {
              setAt(i);
              setTurning(false);
            }}
          />
        ))}
      </div>
    </div>
  );
}
