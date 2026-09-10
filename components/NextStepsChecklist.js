"use client";

import { useEffect, useState } from "react";
import { Housing, Needle } from "@/components/CompassLoader";
import InboxAddressChip from "@/components/InboxAddressChip";
import { useBooted, useRevealed } from "@/components/reveal";

/**
 * The shown-once informational screen after the welcome walkthrough. Four
 * things worth doing next -- the rest of the family's own words, Wallet,
 * forwarding, past trips -- each drawn with a small compass mark that finds
 * north as its row arrives. Nothing on the screen is actionable: it is telling
 * the family what is worth doing before they move on to a first trip, and the
 * "take me to the trip builder" button is the same escape hatch the old flow
 * had straight after moments.
 *
 * Kept as a plain component that takes an `onContinue` callback so the same
 * markup can be reused from the practice hub, where "Continue" is replaced
 * with "Back to practice." The item copy is fixed here so the two surfaces
 * cannot drift out of sync.
 *
 * ---- Voice ---------------------------------------------------------------
 *
 * Aly says all of it, in the first person, the way she does two screens
 * earlier on Meet Aly. This screen used to talk about her -- "Aly warns you
 * about a passport expiry", "a chain Aly steers you around" -- which put a
 * narrator between the family and the assistant they had just been introduced
 * to, and turned four favors she is asking for into four features being
 * described. She is the one who needs these four things and the one they make
 * better, so she asks: I warn you, I steer you around, forward it to me.
 *
 * ---- Motion --------------------------------------------------------------
 *
 * The same system as Meet Aly, imported rather than reinvented: hidden only
 * once JavaScript is running, nothing moving until the boot veil has lifted,
 * and every block waiting until it is actually on screen. Each row is its own
 * block with its own observer, so a row that is below the fold moves when the
 * family scrolls to it instead of having finished moving without them.
 *
 * Within a row the order is the order it is read -- the mark's needle swings to
 * north, the title rises, then the line under it, then the points one after
 * another -- and the first rows carry a small extra offset so a screenful of
 * them still ticks in sequence rather than landing as one block.
 *
 * ---- Copy ----------------------------------------------------------------
 *
 * The forwarding row shows the family's actual address rather than describing
 * one. "Each family has a personal Alyeska email address" is a fact somebody
 * has to go and act on later, and by then they have left this screen and have
 * no idea where the address lives; the address itself, copyable, is the whole
 * instruction. It is passed in rather than read here because this component is
 * shared with the practice hub and has no session of its own.
 *
 * The first row is the only one that says where to go and what to tap. The
 * person who reaches this screen has just written their own paragraph and
 * picked their own favorite moments, and nothing so far has told them those two
 * questions exist for everybody else in the house -- so the row names the
 * screen, the tap and the two questions rather than describing a benefit and
 * leaving them to find it. The other three are places in the app somebody will
 * arrive at anyway.
 *
 * Each row is a title, one line saying what the thing is, and two or three
 * short points. It used to be a title over a five-line paragraph, and three of
 * those stacked was a wall of text on a screen nobody is obliged to read -- the
 * reasons a family would care were buried mid-sentence. Broken up, the reasons
 * are what the eye lands on, and a row can be skimmed in a second.
 */

// Offsets from the moment a row is revealed, in seconds -- not positions in one
// page-long timeline, because rows wait for the scroll rather than the clock.
const BEAT = {
  needle: 0.14,
  title: 0.04,
  lead: 0.14,
  chip: 0.22,
  point: 0.22,
  pointStep: 0.055,
  // Only the first rows stagger. Past that a row is below the fold anyway, and
  // a longer wait after scrolling to it would read as lag rather than rhythm.
  rowStep: 0.16,
  rowStepMax: 2,
};

const ITEMS = [
  {
    key: "others",
    title: "Tell me about everyone else",
    lead: "Open Family, tap a person, and fill in their About you and their favorite moments.",
    points: [
      "The same five questions you just answered, on each person's card",
      "Favorite moments sit on the same person: a trip they loved, and why",
      "Until they are answered I plan around you and guess at the rest",
    ],
  },
  {
    key: "wallet",
    title: "Fill in your Wallet",
    lead: "Passports, cards, loyalty numbers, insurance.",
    points: [
      "Booking forms stop being a hunt for numbers you cannot find",
      "I warn you about a passport expiry before it costs a trip",
      "I name the card to book on, and when points beat paying cash",
    ],
  },
  {
    key: "forwarding",
    title: "Forward your trip confirmations to me",
    lead: "This address is mine. Save it to your contacts now.",
    // Shown only if the address somehow is not ready. Every family gets one
    // from a trigger on insert, so this should not appear -- but "This address
    // is mine" with no address under it would be worse than the general
    // sentence, so the general sentence stays available.
    leadWithoutAddress:
      "Every family gets its own Alyeska address, on the Family screen.",
    points: [
      "Forward a hotel, flight, tour or car and I put it on the right trip",
      "When something changes I re-file it myself, with no dates or numbers for you to re-type",
      "It is the one thing that makes the rest of this automatic",
    ],
  },
  {
    key: "past",
    title: "Add trips you have already taken",
    lead: "A rough list is enough. Dates and places, nothing more.",
    points: [
      "A restaurant you loved becomes a real answer from me somewhere similar",
      "A hotel you did not becomes a chain I steer you around",
    ],
  },
];

function CompassMark({ delay }) {
  // Same Housing + Needle the loader and boot splash use, so the checklist
  // mark reads as the same instrument -- not a lookalike drawn from scratch.
  // The housing fades in with its row and the needle swings to north just
  // after, on the same ma- classes the first screen's mark uses.
  return (
    <span
      className="ma-fade inline-flex shrink-0 items-center justify-center text-teal"
      aria-hidden="true"
    >
      <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
        <Housing />
        <g className="ma-swing" style={{ animationDelay: `${delay}s` }}>
          <Needle spin={false} />
        </g>
      </svg>
    </span>
  );
}

/**
 * One thing worth doing, and its own arrival. Its observer is the row's, not
 * the list's, so the fourth row is still worth scrolling to.
 */
function NextStepRow({ item, inboxAddress, booted, index }) {
  const [ref, shown] = useRevealed();
  const base = Math.min(index, BEAT.rowStepMax) * BEAT.rowStep;
  return (
    <li
      ref={ref}
      {...(booted && shown ? { "data-ma-shown": "1" } : {})}
      className="flex items-start gap-4 rounded-2xl border border-sand-deep bg-sand-soft/60 p-4"
    >
      <CompassMark delay={base + BEAT.needle} />
      <div className="min-w-0">
        <p
          className="ma-in font-display text-lg font-semibold text-ink"
          style={{ animationDelay: `${base + BEAT.title}s` }}
        >
          {item.title}
        </p>
        <p
          className="ma-in mt-0.5 text-sm leading-relaxed text-ink"
          style={{ animationDelay: `${base + BEAT.lead}s` }}
        >
          {item.leadWithoutAddress && !inboxAddress
            ? item.leadWithoutAddress
            : item.lead}
        </p>
        {item.key === "forwarding" && inboxAddress && (
          <span
            className="ma-chip inline-flex"
            style={{ animationDelay: `${base + BEAT.chip}s` }}
          >
            <InboxAddressChip address={inboxAddress} note="Your address:" />
          </span>
        )}
        <ul className="mt-2 space-y-1">
          {item.points.map((point, j) => (
            <li
              key={point}
              className="ma-in flex gap-2 text-sm leading-relaxed text-ink-soft"
              style={{
                animationDelay: `${base + BEAT.point + j * BEAT.pointStep}s`,
              }}
            >
              <span aria-hidden="true" className="select-none text-teal">
                &bull;
              </span>
              <span className="min-w-0">{point}</span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}

export default function NextStepsChecklist({
  onContinue,
  inboxAddress = "",
  continueLabel = "Take me to the trip builder",
  headline = "Four things worth doing next",
  intro = "None of it is required to keep going. Each one makes my answers fit your family better.",
  eyebrow = "Welcome to Alyeska",
}) {
  const [armed, setArmed] = useState(false);
  // Only once JavaScript is running does the CSS get permission to hide
  // anything. Before this, and forever in a browser with scripting off, the
  // screen is plainly visible.
  useEffect(() => setArmed(true), []);
  const booted = useBooted();

  const [headRef, headShown] = useRevealed("0px");
  const [footRef, footShown] = useRevealed();

  return (
    <div className="space-y-6" {...(armed ? { "data-ma-armed": "1" } : {})}>
      <div
        ref={headRef}
        {...(booted && headShown ? { "data-ma-shown": "1" } : {})}
      >
        {eyebrow && (
          <p
            className="ma-fade section-label"
            style={{ animationDelay: "0.12s" }}
          >
            {eyebrow}
          </p>
        )}
        {/* One clipped line per word, so the heading rises out of the line the
            way the greeting on the first screen does. */}
        <h1 className="mt-1 font-display text-3xl font-semibold">
          {headline.split(" ").map((word, i, all) => (
            <span key={`${word}-${i}`} className="ma-line">
              <span
                className="ma-word"
                style={{ animationDelay: `${0.24 + i * 0.075}s` }}
              >
                {word}
              </span>
              {i < all.length - 1 ? "\u00a0" : ""}
            </span>
          ))}
        </h1>
        <p
          className="ma-in mt-3 text-sm leading-relaxed text-ink-soft"
          style={{ animationDelay: "0.62s" }}
        >
          {intro}
        </p>
      </div>

      <ol className="space-y-3">
        {ITEMS.map((item, index) => (
          <NextStepRow
            key={item.key}
            item={item}
            index={index}
            inboxAddress={inboxAddress}
            booted={booted}
          />
        ))}
      </ol>

      {onContinue && (
        <div
          ref={footRef}
          {...(booted && footShown ? { "data-ma-shown": "1" } : {})}
          className="flex flex-wrap gap-2 border-t border-sand-deep pt-4"
        >
          <button
            type="button"
            onClick={onContinue}
            className="ma-cta btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
          >
            {continueLabel}
          </button>
        </div>
      )}
    </div>
  );
}
