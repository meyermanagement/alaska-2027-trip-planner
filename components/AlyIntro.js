"use client";

import { useEffect, useState } from "react";
import { Housing, Needle } from "@/components/CompassLoader";
import { useBooted, useRevealed } from "@/components/reveal";

/**
 * The top of a first-run screen, said by Aly.
 *
 * The screen before this one is Meet Aly, where she introduces herself in the
 * first person and says what she looks after. Then the family arrived at a form
 * headed "Welcome to Alyeska" that told them what Aly would be able to do once
 * they filled it in -- a product talking about its assistant, one tap after the
 * assistant had been talking to them. The person they just met had left the
 * room, and the first thing they were asked to do was data entry for somebody
 * else's software.
 *
 * So she asks for it herself: her mark, her heading, and one line saying why it
 * is worth two minutes. Nothing more. An earlier version listed what she does
 * with each of the three answers, which read well in isolation and badly in
 * place -- the cards below already say what home, the family and the animals are
 * for, in her voice, right next to the fields, and on a phone the list pushed the
 * first field off the screen to explain a field nobody had reached yet.
 *
 * The same block heads both About you screens with their own heading and lead,
 * so a family walking the first-run chain hears one voice from Meet Aly through
 * to the interview instead of an assistant on the first screen and a product on
 * the next two.
 *
 * `does` is still here, unused by any caller, for a screen whose fields cannot
 * explain themselves where they are. Passing lines to a form that can is the
 * mistake this comment exists to prevent.
 *
 * The mark, the word-at-a-time heading and the hairline are the same ma- motion
 * as Meet Aly, imported from components/reveal.js, so this reads as the second
 * page of one conversation rather than a new screen with a similar font.
 * Nothing is hidden until JavaScript is running, and nothing moves until the
 * boot veil has lifted.
 */

const BEAT = {
  needle: 0.2,
  eyebrow: 0.12,
  headline: 0.26,
  word: 0.075,
  lead: 0.66,
  line: 0.8,
  lineStep: 0.1,
  rule: 0.62,
};

export default function AlyIntro({
  headline = "Now tell me who I am planning for.",
  eyebrow = "Welcome",
  lead = "Three quick things and I can be useful straight away.",
  does = [],
}) {
  const [armed, setArmed] = useState(false);
  const booted = useBooted();
  const [ref, shown] = useRevealed("0px");
  useEffect(() => setArmed(true), []);

  return (
    // Two elements, not one: the ma- rules animate a descendant of a shown
    // block inside an armed block, so arming and revealing the same element
    // leaves everything inside it hidden.
    <div {...(armed ? { "data-ma-armed": "1" } : {})}>
      <header
        className="space-y-3"
        ref={ref}
        {...(booted && shown ? { "data-ma-shown": "1" } : {})}
      >
        <div className="flex items-center gap-3">
          <span
            className="ma-fade inline-flex shrink-0 items-center justify-center text-teal"
            aria-hidden="true"
          >
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
              <Housing />
              <g
                className="ma-swing"
                style={{ animationDelay: `${BEAT.needle}s` }}
              >
                <Needle spin={false} />
              </g>
            </svg>
          </span>
          <p
            className="ma-fade section-label text-ink-soft"
            style={{ animationDelay: `${BEAT.eyebrow}s` }}
          >
            {eyebrow}
          </p>
        </div>

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

        <p
          className="ma-in text-base leading-relaxed text-ink-soft"
          style={{ animationDelay: `${BEAT.lead}s` }}
        >
          {lead}
        </p>

        {Array.isArray(does) && does.length > 0 && (
          <ul className="space-y-1.5">
            {does.map((line, i) => (
              <li
                key={line}
                className="ma-in text-sm leading-relaxed text-ink-soft"
                style={{ animationDelay: `${BEAT.line + i * BEAT.lineStep}s` }}
              >
                {line}
              </li>
            ))}
          </ul>
        )}

        <div
          className="ma-rule h-px bg-sand-deep"
          style={{ animationDelay: `${BEAT.rule}s` }}
        />
      </header>
    </div>
  );
}
