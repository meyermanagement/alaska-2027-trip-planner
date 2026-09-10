import {
  PLEDGE_INTRO,
  PLEDGE_PROMISES,
  PLEDGE_THIRD_PARTY,
} from "@/lib/pledge";

/**
 * The three promises, drawn the same way wherever they are read.
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
    </>
  );
}
