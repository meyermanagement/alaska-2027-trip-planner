import {
  PLEDGE_COMPANY_HEADING,
  PLEDGE_COMPANY_INTRO,
  PLEDGE_COMPANY_PARAGRAPHS,
  PLEDGE_INTRO,
  PLEDGE_PROMISES,
  PLEDGE_THIRD_PARTY,
} from "@/lib/pledge";

/**
 * The pledge, drawn the same way wherever it is read.
 *
 * Two blocks. The three promises come first, as cards, because they are about the
 * family reading the screen. The company's own commitments follow, past a rule
 * and set as plain paragraphs rather than cards, so that the order of the screen
 * says which of the two matters more. Nothing here is pressable: a promise with a
 * button beside it starts to look like an offer.
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
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          {PLEDGE_COMPANY_INTRO}
        </p>
        <div className="mt-4 space-y-4">
          {PLEDGE_COMPANY_PARAGRAPHS.map((paragraph) => (
            <p
              key={paragraph.slice(0, 24)}
              className="text-sm leading-relaxed text-ink-soft"
            >
              {paragraph}
            </p>
          ))}
        </div>
      </section>
    </>
  );
}
