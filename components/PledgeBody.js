import {
  PLEDGE_COMPANY_HEADING,
  PLEDGE_COMPANY_PARTS,
  PLEDGE_INTRO,
  PLEDGE_PROMISES,
  PLEDGE_THIRD_PARTY,
} from "@/lib/pledge";

/**
 * The pledge, drawn the same way wherever it is read.
 *
 * Two blocks, five cards. The three promises come first, because they are about
 * the family reading the screen; the company's own two commitments follow past a
 * rule, under a heading that says what they are. All five are the same card,
 * because they are all promises and a promise set in a lighter frame than the one
 * above it reads as a lesser one. What separates the blocks is the rule and the
 * heading, not the weight of the container.
 *
 * The last two carry their terms as a list rather than a paragraph: the terms are
 * the part somebody comes back to check, and prose buries them. Nothing here is
 * pressable: a promise with a button beside it starts to look like an offer.
 *
 * The Our Pledge page puts them under its own heading; the panel on Meet Aly
 * puts them under the panel's title. Neither owns the words or the layout, so a
 * family who reads the pledge before signing up and reads it again a month later
 * is reading the same thing rather than two versions that drifted apart.
 */
export default function PledgeBody() {
  return (
    <>
      <p className="text-sm leading-relaxed text-ink-soft">{PLEDGE_INTRO}</p>

      <div className="mt-6 space-y-4">
        {PLEDGE_PROMISES.map((promise) => (
          <section key={promise.title} className="card rounded-2xl p-4 sm:p-5">
            <h3 className="font-display text-lg font-semibold text-ink">
              {promise.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {promise.body}
            </p>
          </section>
        ))}
      </div>

      <p className="mt-8 text-xs leading-relaxed text-ink-soft">
        {PLEDGE_THIRD_PARTY}
      </p>

      <section className="mt-8 border-t border-line pt-7">
        <h3 className="font-display text-xl font-semibold text-ink">
          {PLEDGE_COMPANY_HEADING}
        </h3>
        <div className="mt-5 space-y-4">
          {PLEDGE_COMPANY_PARTS.map((part) => (
            <div key={part.title} className="card rounded-2xl p-4 sm:p-5">
              <h4 className="font-display text-lg font-semibold text-ink">
                {part.title}
              </h4>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {part.lead}
              </p>
              {/* Discs outside the text so the lines stay flush with the
                  paragraph above them, and a hanging indent on the wrapped part of
                  a line, which is what makes a list of terms scannable rather than
                  a wall with dots in it. */}
              <ul className="mt-2 list-outside list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
                {part.points.map((point) => (
                  <li key={point.slice(0, 24)}>{point}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
