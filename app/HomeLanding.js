import Link from "next/link";
import AlyWordmark from "@/components/AlyWordmark";
import AlyeskaMark from "@/components/AlyeskaMark";
import BudgetDemo from "@/components/home/BudgetDemo";
import DayDemo from "@/components/home/DayDemo";
import { MotionRoot, Reveal } from "@/components/home/Reveal";
import HeroFilm from "@/components/home/HeroFilm";
import HowTabs from "@/components/home/HowTabs";
import NudgeCard from "@/components/home/NudgeCard";
import RainNotice from "@/components/home/RainNotice";
import TaglineTurn from "@/components/home/TaglineTurn";
import WaitlistForm from "@/components/home/WaitlistForm";
import { ALY_INDEX } from "@/lib/home/alyIndex";

/**
 * The front door.
 *
 * Everything else in this app is behind a sign-in, and until September 16, 2026
 * so was the root: alyeska.app redirected to /trips, /trips demanded a session,
 * and a stranger arriving at the domain met a login form and nothing else.
 * Google's brand verification rejected it in exactly those words -- the home
 * page is behind a login page, and the home page does not explain the purpose of
 * the app -- and app store review asks the same question later.
 *
 * The first answer to that was a page of true sentences and nothing else: eight
 * cards of abilities, three promises, five bullets about the model, all of it
 * accurate and none of it convincing. A family travel product whose front door
 * is a specification is a front door that argues you should feel better about
 * travel in the format of a terms page.
 *
 * So this one shows instead. The first version of that was one long scroll of
 * scenes, nine of them, each a photograph or a piece of the product arriving as
 * you reached it. Testers said it was too much: they gave up inside the first
 * couple of sections, so most of the argument was never read. This version puts
 * the four demonstrations that carry the argument behind one tab strip, in the
 * order a trip happens -- before you go, while you are there, when it changes,
 * the money -- and says everything else in a line each. The argument is the
 * same, and it is the only one worth making to somebody who has planned a
 * trip: Alyeska has your back, before you go and while you are there.
 *
 * Four rules it keeps.
 *
 *   The claims still come from the product. The index of what Aly looks after is
 *   read from lib/home/alyIndex.js, where every line is annotated with the code
 *   that implements it, and the promises live at /pledge in the pledge's own
 *   words from lib/pledge.js. A marketing page written separately from the product is a
 *   page that drifts, and the first place it drifts is into a promise nobody
 *   implemented.
 *
 *   The copy is server-rendered text. The motion is added by two thin client
 *   wrappers in components/home/Reveal.js that arm the ma- system and observe
 *   each block; the words themselves never cross that boundary. A browser
 *   running no JavaScript arms nothing, and the stylesheet hides ma- blocks only
 *   inside an armed root, so a crawler is handed the whole page plainly visible.
 *
 *   It says the name out loud, as text, high on the page. The automated brand
 *   check compares the app name submitted to Google against the words here, and
 *   a name that lives only inside an SVG is a name that cannot be read.
 *
 *   Nothing shown as an answer is presented as a fact about the world. The card
 *   in the hero is labeled an example, because it is one: a real nudge is built
 *   from a real trip, and inventing a restaurant's opening hours to decorate a
 *   landing page is exactly the habit this app is supposed to be the cure for.
 *
 * Maui is the example destination throughout, and deliberately not Alaska. The
 * senior user of this name is Alyeska Resort in Girdwood, whose registrations
 * cover resort hotel services and a website featuring information about hotels;
 * pairing an identical word with Alaskan trip planning is the one variable in
 * that comparison we control, and it costs nothing to hand a stranger a
 * different ocean.
 */

/**
 * One stage of the run-up: when it is due, what it is, and why it is dated
 * there. The rail down the left is what makes five rows read as one stretch of
 * time rather than five unrelated errands.
 */
function Stage({ when, on, title, sub, last }) {
  return (
    <div className="relative pl-5">
      <span
        aria-hidden="true"
        className="absolute left-[3px] top-[7px] h-[7px] w-[7px] rounded-full bg-[var(--color-teal)]"
      />
      {last ? null : (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-[6px] top-[16px] w-px bg-[var(--line)]"
        />
      )}
      <div className={last ? "" : "pb-3.5"}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="section-label text-[11px]">{when}</p>
          <p className="shrink-0 text-[12px] text-ink-soft">{on}</p>
        </div>
        <p className="mt-0.5 text-[14px] font-semibold leading-snug">{title}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{sub}</p>
      </div>
    </div>
  );
}

export default function HomeLanding({ waitlist } = {}) {
  return (
    <MotionRoot>
      {/* ---------------------------------------------------------------- hero
          A photograph you could stand in, and beside it the one thing no
          photograph can show: a note Aly sent this family before they asked,
          about their own afternoon, with the decision left to them. */}
      <section className="home-hero" data-ma-shown="">
        <div className="home-hero-shot" aria-hidden="true" />
        <HeroFilm />
        <div className="home-hero-scrim" aria-hidden="true" />

        <div
          className="relative z-10 mx-auto flex min-h-[100svh] w-full max-w-[74rem] flex-col px-5 pb-12 pt-6 sm:px-8"
          style={{ color: "#f6f3ec" }}
        >
          <header className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
                style={{
                  border: "1px solid rgba(246,243,236,0.28)",
                  background: "rgba(12,20,26,0.35)",
                  color: "#f6f3ec",
                }}
              >
                <AlyeskaMark
                  className="h-11 w-11"
                  bezel
                  aurora
                  bezelColor="rgba(246,243,236,0.5)"
                />
              </span>
              {/* A step up from the 21px the wordmark wears inside the app.
                  This is the only place a stranger meets the name, and the
                  headline under it is 48px, so at 21px the lockup read as
                  furniture above the real thing. The rule grows with it:
                  it is meant to sit under the word, not under part of it. */}
              <AlyWordmark as="p" className="text-[20px] min-[360px]:text-[24px] sm:text-[26px]" />
            </div>
            <Link
              href="/login"
              className="shrink-0 whitespace-nowrap rounded-full px-3 py-2 min-[360px]:px-4 text-[14px] font-semibold"
              style={{
                border: "1px solid rgba(246,243,236,0.34)",
                color: "#f6f3ec",
              }}
            >
              Sign in
            </Link>
          </header>

          <div className="mt-auto grid gap-10 pt-16 lg:grid-cols-[1fr_368px] lg:items-end lg:gap-14">
            <div>
              <p
                className="text-[15px] font-semibold tracking-[0.01em] sm:text-[16px]"
                style={{ color: "#f6f3ec" }}
              >
                <TaglineTurn />
              </p>
              <h1
                className="mt-3 max-w-[36rem] font-display text-[34px] font-semibold leading-[1.06] sm:text-[44px] lg:text-[48px]"
              >
                Alyeska has your back.
                <br />
                Before you go, and while you are there.
              </h1>
              <p
                className="mt-5 max-w-[33rem] text-[16px] leading-relaxed sm:text-[17px]"
                style={{
                  color: "rgba(246,243,236,0.92)",
                }}
              >
                Finally, one place to plan your trip, keep it all together, and
                hear about what matters before it matters. From “where should we go?” to “what do
                we need tomorrow?”, Aly brings your itinerary, bookings,
                packing, and budget together with advice that fits you. Less to
                juggle. More to enjoy.
              </p>
              <div
                className="mt-7 flex flex-wrap items-center gap-3"
              >
                <a
                  href="#how"
                  className="rounded-full px-5 py-2.5 text-[15px] font-semibold"
                  style={{ background: "#f6f3ec", color: "#171d22" }}
                >
                  See how it works
                </a>
              </div>
              <p
                className="mt-5 text-[13px]"
                style={{
                  color: "rgba(246,243,236,0.62)",
                }}
              >
                In closed beta. New families join with an invite code, or{" "}
                <a href="#waitlist" className="underline underline-offset-4">
                  join the waitlist below
                </a>
                .
              </p>
            </div>

            {/* Something Aly sends unasked, about this family's own day, with
                the choice left to them. See components/home/NudgeCard.js. */}
            <NudgeCard />
          </div>
        </div>
      </section>

      {/* The film has to stop somewhere, and a hard horizontal edge between two
          darks that are close but not identical reads as a mistake rather than
          an ending. So the hero fades into the page ink over its last stretch,
          and then this band says out loud that the film is over and the
          explanation has started. It is also where See how it works lands, so
          the button arrives at a heading instead of the middle of a scene. */}
      <div className="home-seam" id="how">
        <p>How it works</p>
      </div>

      {/* ------------------------------------------------------------- how
          Four demonstrations behind one tab strip. See components/home/HowTabs.js. */}
      <Reveal as="section" className="mx-auto w-full max-w-[74rem] px-5 pt-12 sm:px-8 sm:pt-16">
        <h2 className="ma-in font-display text-[26px] font-semibold leading-[1.15] sm:text-[32px]">
          Pick a moment. See what Aly does with it.
        </h2>
        <div className="ma-in mt-6" style={{ animationDelay: "80ms" }}>
          <HowTabs
            tabs={[
              {
                label: "Before you go",
                title: "From the day you book to the morning you leave.",
                body: "Aly turns your trip into dated reminders, so you get ready a little at a time.",
                media: (
                  <div className="card p-5">
                    <div className="mb-4 overflow-hidden rounded-xl border border-[var(--line)]">
                      <img
                        src="/landing/packing.jpg"
                        alt="An open case half packed on a bed in morning light, a sun hat on the lid and a child's backpack beside it"
                        loading="lazy"
                        decoding="async"
                        className="block h-[132px] w-full object-cover"
                      />
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="font-display text-[17px] font-semibold">Maui, in March</p>
                      <p className="text-[13px] text-ink-soft">You leave March 14</p>
                    </div>
                    <div className="mt-4">
                      <Stage when="Book now" on="Jan 6" title="Hold the condo and the car" sub="Choose your stay and transport before planning the days" />
                      <Stage when="A month out" on="Feb 12" title="Book the morning snorkel boat" sub="Choose a departure that fits your morning" />
                      <Stage when="Week before" on="Mar 7" title="Stop the mail, tell the neighbor" sub="A few things at home to take care of before you go" />
                      <Stage when="Day before" on="Mar 13" title="Pack from the list, chargers last" sub="Keep the last-minute essentials easy to find" />
                      <Stage when="Travel day" on="Mar 14" title="Leave by 8:05 for the 10:40 flight" sub="Timed from your door, not from the city" last />
                    </div>
                  </div>
                ),
              },
              {
                label: "While you are there",
                title: "Today’s plans, without the inbox hunt.",
                body: "Bookings, check-in details, and the day pack stay with the day they belong to.",
                media: <DayDemo />,
              },
              {
                label: "When it changes",
                title: "A change of plans, not a fresh start.",
                body: "Aly works around the surprise with the trip you already planned. You decide what changes.",
                media: <RainNotice />,
              },
              {
                label: "The money",
                title: "Keep the budget in view. Put your benefits to use.",
                body: "Trip costs, saved credits, and card benefits in one place, so you know what is left and which card to use.",
                media: <BudgetDemo />,
              },
            ]}
          />
        </div>
      </Reveal>

      {/* ------------------------------------------------------------ also
          Everything else, one line each. The three scenes that used to have
          a panel of their own -- building the trip, asking, pro tips -- sit
          here with the six from lib/home/alyIndex.js. */}
      <Reveal as="section" className="mx-auto w-full max-w-[74rem] px-5 sm:px-8">
        <div className="mt-14 border-t border-[var(--line)] py-14 sm:mt-20">
          <p className="section-label ma-in">Also looked after</p>
          <ul className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Building the trip", "Say roughly where, when, and how much. Aly suggests stays and days shaped around your family."],
              ["When you ask", "Answers come from your trip: who is going, what you booked, your budget, and your cards."],
              ["Pro tips", "Local knowledge for your plans, with a source on every one, and a reminder if you want it."],
              ...ALY_INDEX.flatMap((g) => g.items.map((i) => [i.title, i.body])),
            ].map(([title, body], i) => (
              <li key={title} className="ma-in" style={{ animationDelay: `${i * 40}ms` }}>
                <h3 className="text-[16px] font-semibold">{title}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </Reveal>

      {/* ------------------------------------------------ together and ahead
          Two short columns: the rest of the household, and what is coming.
          The pledge has its own page and is linked from the footer. */}
      <Reveal as="section" className="mx-auto w-full max-w-[74rem] px-5 sm:px-8">
        <div className="grid gap-10 border-t border-[var(--line)] py-14 md:grid-cols-2 md:gap-14">
          <div>
            <p className="section-label ma-in">Better together</p>
            <h2 className="ma-in mt-2 font-display text-[22px] font-semibold leading-tight" style={{ animationDelay: "60ms" }}>
              Everyone on the trip sees their part of it.
            </h2>
            <p className="ma-in mt-3 text-[15px] leading-relaxed text-ink-soft" style={{ animationDelay: "120ms" }}>
              Adults share the plan and the packing. Kids get their own days and their own list, and nothing else.
            </p>
          </div>
          <div>
            <p className="section-label ma-in">On the roadmap, as of September 2026.</p>
            <ul className="mt-3 space-y-2.5 text-[15px] leading-relaxed text-ink-soft">
              <li className="ma-in" style={{ animationDelay: "60ms" }}>
                <strong className="font-semibold text-ink">Alyeska Groups, 2027.</strong> Several households, one trip.
              </li>
              <li className="ma-in" style={{ animationDelay: "120ms" }}>
                <strong className="font-semibold text-ink">Ask Aly from Claude, ChatGPT, Alexa+, Siri, and Muse.</strong> Read first; changes later.
              </li>
              <li className="ma-in" style={{ animationDelay: "180ms" }}>
                <strong className="font-semibold text-ink">iPhone and Android, fall 2027.</strong>
              </li>
            </ul>
          </div>
        </div>
      </Reveal>

      {/* ----------------------------------------------------------------- out
          The way in, said once more, for somebody who has read the whole thing
          and should not have to scroll back to the top to act on it. */}
      <Reveal
        as="section"
        className="mx-auto w-full max-w-[74rem] px-5 sm:px-8"
      >
        <div className="border-t border-[var(--line)] py-16 text-center">
          <h2 className="ma-in font-display text-[28px] font-semibold leading-tight sm:text-[36px]">
            No ads. No commissions. Just the memories that matter.
          </h2>
          {/* For everybody without an invite code, which is most people who
              read this far, so the waitlist is the only action here. Testers
              who already have an account use Sign in at the top of the page.
              See components/home/WaitlistForm.js. */}
          <WaitlistForm initial={waitlist} />
          <p
            className="ma-fade mt-4 text-[13px] text-ink-soft"
            style={{ animationDelay: "200ms" }}
          >
            Alyeska is in a closed beta. New families join with an invite code.
          </p>
        </div>
      </Reveal>

      <footer className="mx-auto w-full max-w-[74rem] px-5 sm:px-8">
        <div className="border-t border-[var(--line)] py-8">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            {/* No pitch and no operator credit in the footer, on purpose.

                The operator is named where it is enforceable: the controller on
                /privacy and the counterparty on /beta-terms, both linked
                directly below and both versioned, so renaming it forces every
                tester to consent again. A credit here would add no obligation
                those pages do not already carry.

                The descriptor went too. By the time somebody has scrolled this
                far the page has said what this is in the eyebrow, the headline
                and the hero paragraph, so a one-line pitch above the legal
                shelf was repeating an argument that already landed. It also
                avoided having to settle whether Alyeska and Aly are two things
                or one name at two lengths -- a sentence naming both as actor and
                instrument reads as her working with herself, and that question
                is not the footer's to answer. */}
            Written to be read without an account: the policy, the terms, the
            promises, the way to reach us, and where to report a security
            finding.
          </p>
          <nav className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
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
        </div>
      </footer>
    </MotionRoot>
  );
}
