import Link from "next/link";
import AlyeskaMark from "@/components/AlyeskaMark";
import { MotionRoot, Reveal } from "@/components/home/Reveal";
import AskDemo from "@/components/home/AskDemo";
import HeroFilm from "@/components/home/HeroFilm";
import RotatingWord from "@/components/home/RotatingWord";
import { ALY_ABILITIES } from "@/lib/welcome/alyAbilities";
import { PLEDGE_PROMISES, PLEDGE_COMPANY_PARTS } from "@/lib/pledge";

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
 * So this one shows instead. It is one long scroll of scenes -- the week before,
 * the draft, the day itself, the day that changed, the money, the morning email
 * -- each one a photograph or a piece of the actual product, arriving as you
 * reach it. The argument underneath every scene is the same argument, and it is
 * the only one worth making to somebody who has planned a trip: someone
 * has your back, before you go and while you are there.
 *
 * Four rules it keeps.
 *
 *   The claims still come from the product. The eight things Aly looks after are
 *   read from lib/welcome/alyAbilities.js and the promises are the pledge's own
 *   words from lib/pledge.js, exactly as before. A marketing page written
 *   separately from the product is a page that drifts, and the first place it
 *   drifts is into a promise nobody implemented.
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
 *   in the hero is labeled an example, because it is one: a real answer is built
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

/** A photograph, cropped by its frame, that fades up when its scene arrives. */
function Shot({ src, alt, className = "" }) {
  return (
    <div
      className={`ma-fade overflow-hidden rounded-[var(--radius-card)] border border-[var(--line)] ${className}`}
    >
      {/* Plain img rather than next/image: these are four fixed files served
          from public/, sized for the page before they were committed, and the
          root has to render identically for a crawler with no layout pass. */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="block h-full w-full object-cover"
      />
    </div>
  );
}

/**
 * One scene: a label, a headline, a paragraph, and something to look at. The
 * photograph leads on even scenes and follows on odd ones, so the eye crosses
 * the page rather than running down one gutter.
 */
function Scene({ label, title, body, media, flip }) {
  return (
    <Reveal
      as="section"
      className="home-scene border-t border-[var(--line)] py-14 first:border-t-0 sm:py-20"
    >
      <div
        className={`grid items-center gap-8 lg:grid-cols-2 lg:gap-14 ${
          flip ? "lg:[&>*:first-child]:order-2" : ""
        }`}
      >
        <div>
          <p className="section-label ma-in">{label}</p>
          <h2
            className="ma-in mt-2 font-display text-[26px] font-semibold leading-[1.15] sm:text-[32px]"
            style={{ animationDelay: "60ms" }}
          >
            {title}
          </h2>
          <p
            className="ma-in mt-4 max-w-[34rem] text-[15px] leading-relaxed text-ink-soft sm:text-base"
            style={{ animationDelay: "120ms" }}
          >
            {body}
          </p>
        </div>
        <div>{media}</div>
      </div>
    </Reveal>
  );
}

/** A row inside one of the product panels below. */
function Row({ left, right, sub, last }) {
  return (
    <div className={last ? "" : "border-b border-[var(--line)] pb-3"}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[15px] font-semibold">{left}</p>
        <p className="shrink-0 text-[13px] text-ink-soft">{right}</p>
      </div>
      {sub ? <p className="mt-0.5 text-[13px] text-ink-soft">{sub}</p> : null}
    </div>
  );
}

export default function HomeLanding() {
  return (
    <MotionRoot>
      {/* ---------------------------------------------------------------- hero
          A photograph you could stand in, and beside it the one thing no
          photograph can show: an answer that could only have been written for
          this family. Option one and option two of the mockups, in one screen,
          because the place is what makes somebody want the trip and the answer
          is what makes them want the app. */}
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
              <p className="aly-word font-display text-[21px]">
                Alyeska
                <span className="aly-word-rule" />
              </p>
            </div>
            <Link
              href="/login"
              className="rounded-full px-4 py-2 text-[14px] font-semibold"
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
                className="ma-in text-[12px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: "#f6f3ec" }}
              >
                <RotatingWord />
              </p>
              <h1
                className="ma-in mt-3 max-w-[36rem] font-display text-[34px] font-semibold leading-[1.06] sm:text-[44px] lg:text-[48px]"
                style={{ animationDelay: "80ms" }}
              >
                Someone has your back.
                <br />
                Before you go, and while you are there.
              </h1>
              <p
                className="ma-in mt-5 max-w-[33rem] text-[16px] leading-relaxed sm:text-[17px]"
                style={{
                  animationDelay: "180ms",
                  color: "rgba(246,243,236,0.92)",
                }}
              >
                Alyeska plans your trips and stays with you on them. Tell Aly
                roughly where and when, and she builds the days around whoever
                is actually going. Then on the trip she answers from the day you
                are living. She books nothing, sells nothing, and changes
                nothing without asking.
              </p>
              <div
                className="ma-in mt-7 flex flex-wrap items-center gap-3"
                style={{ animationDelay: "260ms" }}
              >
                <a
                  href="#how"
                  className="rounded-full px-5 py-2.5 text-[15px] font-semibold"
                  style={{ background: "#f6f3ec", color: "#171d22" }}
                >
                  See how it works
                </a>
                <Link
                  href="/login"
                  className="rounded-full px-5 py-2.5 text-[15px] font-semibold"
                  style={{
                    border: "1px solid rgba(246,243,236,0.34)",
                    color: "#f6f3ec",
                  }}
                >
                  Sign in
                </Link>
              </div>
              <p
                className="ma-fade mt-5 text-[13px]"
                style={{
                  animationDelay: "420ms",
                  color: "rgba(246,243,236,0.62)",
                }}
              >
                In closed beta. New families join with an invite code.
              </p>
            </div>

            {/* The conversation, played. What it has to prove is not that
                Aly replies, but that the reply could only have been written
                for the person reading it: their evening, their allergy, their
                card, and then tomorrow's boat with what to carry onto it. */}
            <AskDemo />
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- scenes
          Six of them, in the order a trip happens. Each one is the stress it
          takes off you, said once, with the thing itself beside it. */}
      <div
        id="how"
        className="mx-auto w-full max-w-[74rem] scroll-mt-6 px-5 sm:px-8"
      >
        <Scene
          label="Before you go"
          title="The week before stops being a scramble."
          body="Every task is dated against your actual departure, not left on a list to be remembered: the passport that expires too soon, the hold on the mail, the bag that has to be packed the night before. The packing list is built from who is going and what the place is like, and the things nobody remembers are already on it."
          media={
            <Shot
              src="/landing/before.jpg"
              alt="Packed bags and a rain shell by a front door before dawn"
              className="aspect-[4/3] lg:aspect-[5/4]"
            />
          }
        />

        <Scene
          label="Building the trip"
          flip
          title="One draft, instead of forty tabs."
          body="Say roughly where and when. Aly hands back ordered days built around how early your family starts, how far they will walk, what they eat and who needs an afternoon off. Nothing is booked and nothing is final: you argue with the draft, and she rewrites it."
          media={
            <div className="ma-in card p-5" style={{ animationDelay: "80ms" }}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-display text-[17px] font-semibold">
                  Maui &middot; seven days
                </p>
                <p className="text-[13px] text-ink-soft">Draft</p>
              </div>
              <div className="mt-4 space-y-3">
                <Row
                  left="Day 1 &middot; Land, and stop moving"
                  right="Kahului 1:15 pm"
                  sub="Groceries on the way, nothing booked after five"
                />
                <Row
                  left="Day 2 &middot; The road, early"
                  right="Out by 7:00"
                  sub="Ahead of the traffic, back before the afternoon rain"
                />
                <Row
                  left="Day 3 &middot; Nothing planned"
                  right="Beach"
                  sub="Because day two is long and Mia is nine"
                  last
                />
              </div>
              <p className="mt-4 border-t border-[var(--line)] pt-3 text-[13px] text-ink-soft">
                Built from your travelers, your dates and what you already
                booked.
              </p>
            </div>
          }
        />

        <Scene
          label="While you are there"
          title="It opens on the day you are living, not on day one."
          body="What is next, how far away it is, what the weather does tonight, and what is still in the bag. No scrolling back through a plan you wrote four months ago to work out where you are supposed to be."
          media={
            <div className="ma-in card p-5" style={{ animationDelay: "80ms" }}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-display text-[17px] font-semibold">
                  Thursday, August 12
                </p>
                <p className="text-[13px] text-ink-soft">
                  Kīhei &middot; 84&deg;, rain at 2
                </p>
              </div>
              <div className="mt-4 space-y-3">
                <Row
                  left="Snorkel, Mākena"
                  right="8:20 am"
                  sub="Booked &middot; 12 min drive"
                />
                <Row
                  left="Lunch, back at the condo"
                  right="12:30 pm"
                  sub="Ahead of the shower"
                />
                <Row
                  left="Sunset, walk from the door"
                  right="6:40 pm"
                  sub="Nothing to book"
                  last
                />
              </div>
              <p className="mt-4 rounded-[10px] bg-sand p-3 text-[13px] leading-relaxed">
                <span className="font-semibold">Aly:</span> Rain about two, gone
                by four. Mia&rsquo;s shell is in the day bag.
              </p>
            </div>
          }
        />

        <Scene
          label="When it changes"
          flip
          title="When the day changes, you are not the one who has to fix it."
          body="Rain at two, a boat that cancelled, a road that closed. Aly moves what has to move, tells you what she wants to change and why, and waits for you to say yes. The rest of the family sees the same trip you do, so nobody is working from a screenshot."
          media={
            <Shot
              src="/landing/rain.jpg"
              alt="A tropical coast road in an afternoon rain shower, clearing sky ahead"
              className="aspect-[4/3]"
            />
          }
        />

        <Scene
          label="The money"
          title="What it has cost, and which card to hand over."
          body="Every price on the trip in one place, against the number you meant to spend. Your cards and points are in there too, so the answer to who pays for dinner is the card that earns the most on it and the credit you have not used yet."
          media={
            <div className="ma-in card p-5" style={{ animationDelay: "80ms" }}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-display text-[17px] font-semibold">
                  Trip budget
                </p>
                <p className="text-[13px] text-ink-soft">7 days</p>
              </div>
              <div className="mt-4 space-y-3">
                <Row left="Flights" right="Booked" sub="Four seats, paid" />
                <Row left="Where you stay" right="Booked" sub="Deposit taken" />
                <Row
                  left="Food and days out"
                  right="Estimated"
                  sub="Aly filled in only the blank prices"
                  last
                />
              </div>
              <p className="mt-4 border-t border-[var(--line)] pt-3 text-[13px] text-ink-soft">
                No affiliate links, no commission, no paid placements. The
                numbers are yours.
              </p>
            </div>
          }
        />

        <Scene
          label="The morning email"
          flip
          title="One short email, every morning."
          body="What is happening today, what you need on you for it, and anything that has to be done before tomorrow. Before the trip it is the countdown; on the trip it is the day. It is the only thing this app sends you unasked."
          media={
            <Shot
              src="/landing/morning.jpg"
              alt="Snorkel masks, a hat and a towel on dark sand at sunrise"
              className="aspect-[4/3]"
            />
          }
        />
      </div>

      {/* ------------------------------------------------------------ abilities
          Eight headings and nothing else. The full argument for each one is the
          Meet Aly screen, which needs a session; this is the index, read from
          the same file so it cannot promise something the product dropped. */}
      <Reveal
        as="section"
        className="mx-auto w-full max-w-[74rem] px-5 sm:px-8"
      >
        <div className="border-t border-[var(--line)] py-14">
          <p className="section-label ma-in">Everything Aly looks after</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {ALY_ABILITIES.map((ability, i) => (
              <span
                key={ability.key}
                className="ma-chip rounded-full border border-[var(--line)] px-3.5 py-1.5 text-[14px] font-medium"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                {ability.heading}
              </span>
            ))}
          </div>
        </div>
      </Reveal>

      {/* -------------------------------------------------------------- pledge
          The pledge's own three promises, verbatim from lib/pledge.js. They are
          the reason the app is built the way it is, and they are the part a
          stranger deciding whether to trust it with a passport number wants
          before they read anything else. */}
      <Reveal
        as="section"
        className="mx-auto w-full max-w-[74rem] px-5 sm:px-8"
      >
        <div className="border-t border-[var(--line)] py-14">
          <p className="section-label ma-in">What we promise</p>
          <h2
            className="ma-in mt-2 font-display text-[26px] font-semibold sm:text-[30px]"
            style={{ animationDelay: "60ms" }}
          >
            How this app makes its money, and how it does not
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {PLEDGE_PROMISES.map((promise, i) => (
              <div
                key={promise.title}
                className="ma-in card p-4"
                style={{ animationDelay: `${120 + i * 80}ms` }}
              >
                <h3 className="font-display text-[17px] font-semibold">
                  {promise.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                  {promise.body}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-8 max-w-[38rem]">
            <h3 className="ma-in font-display text-[19px] font-semibold">
              Aly is an AI assistant, and you stay in charge of her
            </h3>
            <ul className="mt-3 space-y-2 pl-4">
              {PLEDGE_COMPANY_PARTS[0].points.map((point, i) => (
                <li
                  key={point}
                  className="ma-in list-disc text-[14px] leading-relaxed text-ink-soft"
                  style={{ animationDelay: `${60 + i * 50}ms` }}
                >
                  {point}
                </li>
              ))}
            </ul>
            <p className="ma-in mt-4 text-[14px] text-ink-soft">
              The two remaining promises, about how the company behind it runs,
              are on{" "}
              <Link href="/pledge" className="underline">
                Our Pledge
              </Link>
              .
            </p>
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
            Plan it once. Then just be there.
          </h2>
          <div
            className="ma-in mt-6 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "80ms" }}
          >
            <Link href="/login" className="btn btn-primary ma-cta">
              Sign in
            </Link>
          </div>
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
            Alyeska is a household travel planner by Meyer Management. Written
            to be read without an account: the policy, the terms, the promises,
            the way to reach us, and where to report a security finding.
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
