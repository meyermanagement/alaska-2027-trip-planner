"use client";

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
 */

const ITEMS = [
  {
    key: "wallet",
    title: "Fill in your Wallet and travel documents",
    body: "Passports, loyalty numbers, TSA PreCheck, insurance -- the things a booking form always asks for and you can never find. Once they are in your Wallet, Aly can quote them back to you when a form needs them, and knows a passport is close to expiring before it costs a trip.",
  },
  {
    key: "forwarding",
    title: "Forward trip confirmations to your Aly address",
    body: "Each family has a personal Alyeska email address. Forward a hotel, flight, tour or car confirmation to it and Aly reads it, adds it to the right trip and updates it if anything changes -- no re-typing dates, times or confirmation numbers.",
  },
  {
    key: "past",
    title: "Add trips you have already taken",
    body: "Even a rough list of past trips gives Aly something to compare a next one to. A restaurant you loved in Copenhagen is a real answer when we go somewhere similar, and a hotel you did not is a real reason to steer around a chain.",
  },
];

function CompassMark({ index }) {
  // Same housing and needle as the CompassLoader, drawn statically. Each row
  // uses the same instrument so the moment reads as one screen doing three
  // things, not three unrelated icons.
  return (
    <span
      className="next-steps-compass inline-flex shrink-0 items-center justify-center rounded-full border border-teal/30 bg-teal/10 p-2 text-teal"
      style={{ animationDelay: `${index * 0.55}s` }}
      aria-hidden="true"
    >
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle
          cx="16"
          cy="16"
          r="14.5"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.55"
        />
        <g
          className="next-steps-needle"
          style={{ animationDelay: `${index * 0.55 + 0.2}s` }}
        >
          <path
            fillRule="evenodd"
            fill="currentColor"
            d="M16 5 25 25 16 20 7 25Z M16 9.5 12 20 16 18 20 20Z"
          />
        </g>
      </svg>
    </span>
  );
}

export default function NextStepsChecklist({
  onContinue,
  continueLabel = "Take me to the trip builder",
  headline = "Three things worth doing next",
  intro = "You have set the shape of your family and told Aly a little about yourself. Before your first trip, these three things make every answer Aly gives you fit better -- add what you can when you can. Nothing here is required to keep going.",
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
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                {item.body}
              </p>
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
