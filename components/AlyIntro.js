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
 * So she asks for it herself, and says what she does with each of the three
 * answers. The lines are the same three things the form collects, in the same
 * order the cards below appear, because a form is easier to fill in when the
 * reason for each field arrived before the field did.
 *
 * The same block heads the About you screens, with its own heading and its own
 * three lines, so a family walking the first-run chain hears one voice from Meet
 * Aly through to the interview instead of an assistant on the first screen and a
 * product on the next two.
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

const DOES = [
  "Where you live tells me how early to get you out the door, and what the drive or the flight actually costs you.",
  "Who travels with you is who I pack for, book rooms for, and check entry rules for.",
  "Any animals in the family, because a trip with a dog in it is a different trip.",
];

export default function AlyIntro({
  headline = "Now tell me who I am planning for.",
  eyebrow = "Welcome",
  lead = "Three quick things and I can be useful straight away.",
  does = DOES,
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

        <div
          className="ma-rule h-px bg-sand-deep"
          style={{ animationDelay: `${BEAT.rule}s` }}
        />
      </header>
    </div>
  );
}
