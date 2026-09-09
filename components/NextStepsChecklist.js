"use client";

import { Housing, Needle } from "@/components/CompassLoader";
import InboxAddressChip from "@/components/InboxAddressChip";

/**
 * The shown-once informational screen after the welcome walkthrough. Three
 * things worth doing next -- Wallet, forwarding, past trips -- each drawn with
 * a small compass mark that orients into place one after the other, as a
 * checklist would tick itself off. Nothing on the screen is actionable: it is
 * telling the family what is worth doing before they move on to a first trip,
 * and the "take me to the trip builder" button is the same escape hatch the
 * old flow had straight after moments.
 *
 * The animation is decorative. It runs once on mount, respects
 * prefers-reduced-motion via app/globals.css, and does not gate anything.
 *
 * Kept as a plain component that takes an `onContinue` callback so the same
 * markup can be reused from the practice hub, where "Continue" is replaced
 * with "Back to practice." The item copy is fixed here so the two surfaces
 * cannot drift out of sync.
 *
 * The forwarding row shows the family's actual address rather than describing
 * one. "Each family has a personal Alyeska email address" is a fact somebody
 * has to go and act on later, and by then they have left this screen and have
 * no idea where the address lives; the address itself, copyable, is the whole
 * instruction. It is passed in rather than read here because this component is
 * shared with the practice hub and has no session of its own.
 *
 * Each row is a title, one line saying what the thing is, and two or three
 * short points. It used to be a title over a five-line paragraph, and three of
 * those stacked was a wall of text on a screen nobody is obliged to read -- the
 * reasons a family would care were buried mid-sentence. Broken up, the reasons
 * are what the eye lands on, and a row can be skimmed in a second.
 */

const ITEMS = [
  {
    key: "wallet",
    title: "Fill in your Wallet",
    lead: "Passports, cards, loyalty numbers, insurance.",
    points: [
      "Booking forms stop being a hunt for numbers you cannot find",
      "Aly warns you about a passport expiry before it costs a trip",
      "She names the card to book on, and when points beat paying cash",
    ],
  },
  {
    key: "forwarding",
    title: "Forward trip confirmations",
    lead: "This address is yours. Save it to your contacts now.",
    // Shown only if the address somehow is not ready. Every family gets one
    // from a trigger on insert, so this should not appear -- but "This address
    // is yours" with no address under it would be worse than the general
    // sentence, so the general sentence stays available.
    leadWithoutAddress:
      "Every family gets its own Alyeska address, on the Family screen.",
    points: [
      "Forward a hotel, flight, tour or car and it lands on the right trip",
      "Changes update themselves, with no dates or numbers to re-type",
      "It is the one thing that makes the rest of this automatic",
    ],
  },
  {
    key: "past",
    title: "Add trips you have already taken",
    lead: "A rough list is enough. Dates and places, nothing more.",
    points: [
      "A restaurant you loved becomes a real answer somewhere similar",
      "A hotel you did not becomes a chain Aly steers you around",
    ],
  },
];

function CompassMark({ index }) {
  // Same Housing + Needle the loader and boot splash use, so the checklist
  // mark reads as the same instrument -- not a lookalike drawn from scratch.
  // The row's per-row delay is passed in so the housing fades in with its
  // row; the needle swings to north after a small extra offset.
  return (
    <span
      className="next-steps-compass inline-flex shrink-0 items-center justify-center text-teal"
      style={{ animationDelay: `${index * 0.55}s` }}
      aria-hidden="true"
    >
      <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
        <Housing />
        <g
          className="next-steps-needle"
          style={{ animationDelay: `${index * 0.55 + 0.2}s` }}
        >
          <Needle spin={false} />
        </g>
      </svg>
    </span>
  );
}

export default function NextStepsChecklist({
  onContinue,
  inboxAddress = "",
  continueLabel = "Take me to the trip builder",
  headline = "Three things worth doing next",
  intro = "None of it is required to keep going. Each one makes Aly's answers fit your family better.",
  eyebrow = "Welcome to Alyeska",
}) {
  return (
    <div className="space-y-6">
      <div>
        {eyebrow && <p className="section-label">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-3xl font-semibold">{headline}</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">{intro}</p>
      </div>

      <ol className="space-y-3">
        {ITEMS.map((item, index) => (
          <li
            key={item.key}
            className="next-steps-row flex items-start gap-4 rounded-2xl border border-sand-deep bg-sand-soft/60 p-4"
            style={{ animationDelay: `${index * 0.55}s` }}
          >
            <CompassMark index={index} />
            <div className="min-w-0">
              <p className="font-display text-lg font-semibold text-ink">
                {item.title}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink">
                {item.leadWithoutAddress && !inboxAddress
                  ? item.leadWithoutAddress
                  : item.lead}
              </p>
              {item.key === "forwarding" && inboxAddress && (
                <InboxAddressChip address={inboxAddress} note="Your address:" />
              )}
              <ul className="mt-2 space-y-1">
                {item.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-2 text-sm leading-relaxed text-ink-soft"
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
        ))}
      </ol>

      {onContinue && (
        <div className="flex flex-wrap gap-2 border-t border-sand-deep pt-4">
          <button
            type="button"
            onClick={onContinue}
            className="btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
          >
            {continueLabel}
          </button>
        </div>
      )}
    </div>
  );
}
