import Link from "next/link";
import AlyeskaMark from "@/components/AlyeskaMark";
import { ALY_ABILITIES } from "@/lib/welcome/alyAbilities";
import { PLEDGE_PROMISES, PLEDGE_COMPANY_PARTS } from "@/lib/pledge";

/**
 * The front door.
 *
 * Everything else in this app is behind a sign-in, and until September 16, 2026
 * so was the root: alyeska.app redirected to /trips, /trips demanded a session,
 * and a stranger arriving at the domain met a login form and nothing else. That
 * is a reasonable shape for a household tool and a bad one for a front door.
 * Google's brand verification rejected it in exactly those words -- the home page
 * is behind a login page, and the home page does not explain the purpose of the
 * app -- and app store review asks the same question later.
 *
 * So this page is the answer to one question, asked by somebody with no account,
 * possibly a reviewer, possibly a family a tester forwarded a link to: what is
 * this and what does it do for me.
 *
 * Three rules it keeps.
 *
 *   Every claim on it is already made somewhere the app has to keep. The eight
 *   things Aly looks after are the same lines the Meet Aly screen shows, read
 *   from lib/welcome/alyAbilities.js, and the promises are the pledge's own
 *   words from lib/pledge.js. A marketing page written separately from the
 *   product is a page that drifts, and the first place it drifts is into a
 *   promise nobody implemented.
 *
 *   It is plain server-rendered text. No reveal animations, no client
 *   components, nothing that appears only once JavaScript has run. The reader
 *   this page exists for may be a crawler that does not run any, and a headline
 *   held at opacity zero waiting for hydration is a headline that was not there.
 *
 *   It says the name out loud, as text, in the heading and in the title. The
 *   automated brand check compares the app name submitted to Google against the
 *   words on this page, and a name that lives only inside an SVG is a name that
 *   cannot be read.
 *
 * Nothing here is a form and nothing here is a decision. The one control is the
 * way in.
 */
export default function HomeLanding() {
  return (
    <main className="screen px-5 pb-20 pt-7">
      {/* The lockup the sign-in screen and the emails wear: the app's own dial,
          then a left-set column of name, hairline and caption. The way in sits
          on the same line, at the far end, because somebody who already has an
          account did not come here to read any of this. */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-[13px]">
          <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[var(--disc-edge)] bg-[var(--disc-face)] text-ink shadow-[var(--disc-shadow)]">
            <AlyeskaMark
              className="h-[52px] w-[52px]"
              bezel
              aurora
              bezelColor="var(--aurora-mid)"
            />
          </span>
          <div className="min-w-0 text-left">
            <p className="aly-word font-display text-[22px]">
              Alyeska
              <span className="aly-word-rule" />
            </p>
            <p className="mt-1.5 text-[13px] font-medium leading-[1.35] text-ink-soft">
              <span className="font-semibold">Travel</span>
              <span className="opacity-40">&nbsp;&middot;&nbsp;</span>
              Personalized. Contextualized. Simplified.
            </p>
          </div>
        </div>
        <Link href="/login" className="btn btn-ghost">
          Sign in
        </Link>
      </header>

      {/* The paragraph the whole page exists for. It has to be readable by
          somebody who has never heard of any of this, and it has to name what
          the app is before it names anything Aly does. */}
      <section className="mt-10">
        <p className="section-label">What Alyeska is</p>
        <h1 className="mt-1 font-display text-3xl font-semibold leading-tight">
          A family travel planner with an assistant who knows who is going.
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink">
          Alyeska keeps everything about a household&rsquo;s trips in one place:
          the days and what happens on them, the packing lists, what has to be
          done before you leave, the confirmations and documents, and the points
          and cards you would rather spend than forget. Beside all of it sits
          Aly, an assistant you can ask questions about your own trip.
        </p>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink">
          Tell her roughly where you want to go and when, and she hands back one
          ordered draft, built around the people actually going &mdash; how
          early they start, how far they walk, what they eat, who needs a nap.
          On the trip, she answers from the day you are living: what is next,
          what is near you, what the weather is about to do. She books nothing,
          sells nothing, and changes nothing without asking you first.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
          <p className="text-sm text-ink-soft">
            Alyeska is in a closed beta. New families join with an invite code.
          </p>
        </div>
      </section>

      {/* The eight jobs, in the order the Meet Aly screen argues them. Static
          here: on that screen each line is a button that asks Aly the question
          live, which needs a session and a model call. This page is read by
          people who have neither. */}
      <section className="mt-12">
        <p className="section-label">What Aly looks after</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">
          Eight things, all of them about your family in particular
        </h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {ALY_ABILITIES.map((ability) => (
            <div key={ability.key} className="card p-4">
              <h3 className="font-display text-lg font-semibold">
                {ability.heading}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {ability.points.map((point) => (
                  <li
                    key={point}
                    className="text-sm leading-relaxed text-ink-soft"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* The pledge's own three promises, verbatim from lib/pledge.js. They are
          the reason the app is built the way it is, and they are the part a
          stranger deciding whether to trust it with a passport number wants
          before they read a feature list. */}
      <section className="mt-12">
        <p className="section-label">What we promise</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">
          How this app makes its money, and how it does not
        </h2>
        <div className="mt-5 space-y-4">
          {PLEDGE_PROMISES.map((promise) => (
            <div key={promise.title} className="card p-4">
              <h3 className="font-display text-lg font-semibold">
                {promise.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {promise.body}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Two more promises, about how the company behind it runs, are on{" "}
          <Link href="/pledge" className="underline">
            Our Pledge
          </Link>
          .
        </p>
      </section>

      {/* Said plainly, on the page a stranger reads first, rather than left to
          be discovered inside the app: Aly is AI, and here is what that is
          allowed to mean. The lines are the pledge's own. */}
      <section className="mt-12">
        <p className="section-label">About the AI</p>
        <h2 className="mt-1 font-display text-2xl font-semibold">
          Aly is an AI assistant, and you stay in charge of her
        </h2>
        <ul className="mt-4 space-y-2">
          {PLEDGE_COMPANY_PARTS[0].points.map((point) => (
            <li key={point} className="text-sm leading-relaxed text-ink">
              {point}
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-14 border-t border-sand-deep pt-6">
        <p className="text-sm text-ink-soft">
          Alyeska is a household travel planner by Meyer Management. Written to
          be read without an account: the policy, the terms, the promises, the
          way to reach us, and where to report a security finding.
        </p>
        <nav className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/pledge" className="underline">
            Our Pledge
          </Link>
          <Link href="/privacy" className="underline">
            Privacy policy
          </Link>
          <Link href="/beta-terms" className="underline">
            Beta terms
          </Link>
          <Link href="/contact" className="underline">
            Contact us
          </Link>
          <Link href="/security" className="underline">
            Report a security issue
          </Link>
        </nav>
      </footer>
    </main>
  );
}
