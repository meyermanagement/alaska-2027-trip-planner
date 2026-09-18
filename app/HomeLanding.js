import Link from "next/link";
import AlyeskaMark from "@/components/AlyeskaMark";
import { MotionRoot, Reveal } from "@/components/home/Reveal";
import AskDemo from "@/components/home/AskDemo";
import HeroFilm from "@/components/home/HeroFilm";
import RotatingWord from "@/components/home/RotatingWord";
import { ALY_INDEX } from "@/lib/home/alyIndex";
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
 * So this one shows instead. It is one long scroll of scenes -- the draft, the
 * week before, the day itself, the day that changed, the money, the things that
 * have to be done by a date -- each one a photograph or a piece of the actual
 * product, arriving as you reach it. The argument underneath every scene is the
 * same argument, and it is the only one worth making to somebody who has
 * planned a trip: Alyeska has your back, before you go and while you are there.
 *
 * Four rules it keeps.
 *
 *   The claims still come from the product. The index of what Aly looks after is
 *   read from lib/home/alyIndex.js, where every line is annotated with the code
 *   that implements it, and the promises are the pledge's own words from
 *   lib/pledge.js. A marketing page written separately from the product is a
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
 * One scene: a label, a headline, a single line, and the thing itself. The
 * photograph leads on even scenes and follows on odd ones, so the eye crosses
 * the page rather than running down one gutter.
 *
 * The line under the headline used to be a paragraph of eighty to a hundred
 * words, and six of those on one page is more reading than anybody does
 * standing at a front door. Worse, each paragraph argued the case that the
 * card beside it was already making -- the credit expiring in May is named in
 * the prose and shown in the panel a hand's width away -- so the reader was
 * told a thing and then shown it, and the showing read as a repeat. One line
 * now, set a size up from body copy and in full ink rather than soft, because
 * a single sentence carrying a whole section should not look like a caption.
 */
function Scene({ label, title, body, note, media, flip }) {
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
            className="ma-in mt-3.5 max-w-[30rem] text-[16px] leading-relaxed sm:text-[17px]"
            style={{ animationDelay: "120ms" }}
          >
            {body}
          </p>
          {/* A second line, only where cutting the paragraph took a specific
              with it that the card beside it cannot show. Soft ink and back
              down at body size, so it reads as the footnote to the line above
              rather than as a second claim of equal weight. */}
          {note ? (
            <p
              className="ma-in mt-2.5 max-w-[30rem] text-[14px] leading-relaxed text-ink-soft sm:text-[15px]"
              style={{ animationDelay: "170ms" }}
            >
              {note}
            </p>
          ) : null}
        </div>
        <div>{media}</div>
      </div>
    </Reveal>
  );
}

/**
 * One tip: when to act, the thing itself, and where it came from. The source
 * line is not decoration -- a tip nobody can check is a rumor, and the product
 * carries a real link on every one of these.
 */
function Tip({ when, title, source }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-sand/40 p-3">
      <p className="section-label text-[11px]">{when}</p>
      <p className="mt-1 text-[14px] font-semibold leading-snug">{title}</p>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-ink-soft">Source: {source}</p>
        {/* The tip's own answer, drawn exactly as ProTips draws it: a ghost pill
            reading Remind me, which turns the sentence into a dated task. It is
            not a control here -- nothing on this page is -- but a picture of a
            screen that shows a button the app does not have is the kind of claim
            this page is supposed to stop making. */}
        <span
          aria-hidden="true"
          className="ml-auto rounded-full border border-[var(--line)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft"
        >
          Remind me
        </span>
      </div>
    </div>
  );
}

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
              {/* A step up from the 21px the wordmark wears inside the app.
                  This is the only place a stranger meets the name, and the
                  headline under it is 48px, so at 21px the lockup read as
                  furniture above the real thing. The rule grows with it:
                  it is meant to sit under the word, not under part of it. */}
              <p className="aly-word font-display text-[24px] sm:text-[26px]">
                Alyeska
                <span
                  className="aly-word-rule"
                  style={{ width: "3rem", marginTop: "0.45rem" }}
                />
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
                Alyeska has your back.
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
                Finally, one place to plan your trip, keep it all together, and
                get help along the way. From “where should we go?” to “what do
                we need tomorrow?”, Aly brings your itinerary, bookings,
                packing, and budget together with advice that fits you. Less to
                juggle. More to enjoy.
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

      {/* The film has to stop somewhere, and a hard horizontal edge between two
          darks that are close but not identical reads as a mistake rather than
          an ending. So the hero fades into the page ink over its last stretch,
          and then this band says out loud that the film is over and the
          explanation has started. It is also where See how it works lands, so
          the button arrives at a heading instead of the middle of a scene. */}
      <div className="home-seam" id="how">
        <p>How it works</p>
      </div>

      {/* --------------------------------------------------------------- scenes
          Six of them, in the order a trip happens. Each one is the stress it
          takes off you, said once, with the thing itself beside it. */}
      <div className="mx-auto w-full max-w-[74rem] px-5 pt-2 sm:px-8">
        <Scene
          label="Building the trip"
          title="Suggestions that already know how you travel."
          body="Start with an idea, not a dozen open tabs. Aly helps turn it into places to stay and days you’ll look forward to, all shaped around you."
          media={
            <div
              className="ma-in card home-trip-example p-5"
              style={{ animationDelay: "80ms" }}
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-display text-[17px] font-semibold">
                  A new trip
                </p>
                <p className="home-trip-example-badge">Example trip</p>
              </div>

              {/* Show a starting idea and explain the follow-up without
                  exposing the builder's internal completeness checklist. */}
              <p className="home-trip-example-prompt mt-4 rounded-xl p-3 text-[14px] leading-relaxed">
                Maui for a week in March for about $6,000.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                Aly uses what she knows about you to suggest the details.
              </p>

              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <p className="text-[13px] font-semibold">
                  A few ideas that fit you
                </p>
                <div className="mt-2.5 space-y-3">
                  <div className="home-trip-example-idea" data-kind="stay">
                    <p className="home-trip-example-kind">Stay your way</p>
                    <Row
                      left="A two-bedroom condo in Kīhei"
                      right="$1,880 for the week"
                      sub="Room to cook, with the beach a short walk away."
                      last
                    />
                  </div>
                  <div className="home-trip-example-idea" data-kind="flight">
                    <p className="home-trip-example-kind">
                      Keep the morning easy
                    </p>
                    <Row
                      left="The 10:40 am flight, not the 6:10 am"
                      right="$240 more"
                      sub="A gentler start for Dani and Mia, with the extra cost clear."
                      last
                    />
                  </div>
                  <div className="home-trip-example-idea" data-kind="credit">
                    <p className="home-trip-example-kind">
                      Use what you already have
                    </p>
                    <Row
                      left="$300 in airline credit"
                      right="Expiry in May"
                      sub="Put your existing credit toward the flight."
                      last
                    />
                  </div>
                </div>
              </div>

              <p className="mt-4 border-t border-[var(--line)] pt-3 text-[13px] text-ink-soft">
                You choose what makes it into the plan.
              </p>
            </div>
          }
        />

        <Scene
          label="Before you go"
          flip
          title="From the day you book to the morning you leave."
          body="Aly turns your trip details into timely reminders, so you can get ready a little at a time."
          note="Your packing list brings together your saved essentials and suggestions for the trip you’ve planned."
          media={
            <div className="ma-in card p-5" style={{ animationDelay: "80ms" }}>
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
                <p className="font-display text-[17px] font-semibold">
                  Maui, in March
                </p>
                <p className="text-[13px] text-ink-soft">You leave March 14</p>
              </div>

              <div className="mt-4">
                <Stage
                  when="Book now"
                  on="Jan 6"
                  title="Hold the condo and the car"
                  sub="Choose your stay and transport before planning the days"
                />
                <Stage
                  when="A month out"
                  on="Feb 12"
                  title="Book the morning snorkel boat"
                  sub="Choose a departure that fits your morning"
                />
                <Stage
                  when="Week before"
                  on="Mar 7"
                  title="Stop the mail, tell the neighbor"
                  sub="A few things at home to take care of before you go"
                />
                <Stage
                  when="Day before"
                  on="Mar 13"
                  title="Pack from the list, chargers last"
                  sub="Keep the last-minute essentials easy to find"
                />
                <Stage
                  when="Travel day"
                  on="Mar 14"
                  title="Leave by 8:05 for the 10:40 flight"
                  sub="Timed from your door, not from the city"
                  last
                />
              </div>
            </div>
          }
        />

        <Scene
          label="While you are there"
          title="Today’s plans, without the inbox hunt."
          body="Bookings, check-in details, and your day pack stay with the day they belong to. Ask Aly for help with what’s next."
          media={
            <div className="ma-in card p-5" style={{ animationDelay: "80ms" }}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-display text-[17px] font-semibold">
                  A day in Maui
                </p>
                <p className="text-[13px] text-ink-soft">
                  Kīhei &middot; 84&deg;, rain at 2
                </p>
              </div>
              <div className="mt-4 space-y-3">
                <Row
                  left="Snorkel, Mākena"
                  right="8:20 am"
                  sub="Conf. MKN4‑8821 &middot; check in 7:50 &middot; 12 min drive"
                />
                <Row
                  left="Lunch, back at the condo"
                  right="12:30 pm"
                  sub="Back before the afternoon rain"
                />
                <Row
                  left="Sunset, walk from the door"
                  right="6:40 pm"
                  sub="Nothing to book"
                  last
                />
              </div>

              {/* The day's own bag, which is the part people expect least: a
                  short list for today rather than the whole packing list. */}
              <div className="mt-4 rounded-xl border border-[var(--line)] bg-sand/40 p-3">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[13px] font-semibold">Today’s day pack</p>
                  <p className="text-[12px] text-ink-soft">To bring</p>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                  Sunscreen &middot; Mia&rsquo;s light jacket &middot; photo ID
                  &middot; cash for the balance
                </p>
              </div>

              <p className="mt-3 rounded-[10px] bg-sand p-3 text-[13px] leading-relaxed">
                <span className="font-semibold">Aly:</span> The boat&rsquo;s
                confirmation asks for cash and photo ID. Check that both are
                packed before you head out.
              </p>
            </div>
          }
        />

        <Scene
          label="When it changes"
          flip
          title="A change of plans, not a fresh start."
          body="Aly flags conflicts and helps you work around surprises, using the trip you already planned. You decide what changes."
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
          title="Keep the budget in view. Put your benefits to use."
          body="Aly brings trip costs, saved credits, and card benefits together, helping you see what’s left to spend and which card to use."
          note="She helps you understand your insurance and card or reward-program benefits, so you can check existing coverage before buying more."
          media={
            <div className="ma-in card p-5" style={{ animationDelay: "80ms" }}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-display text-[17px] font-semibold">
                  Trip budget
                </p>
                <p className="text-[13px] text-ink-soft">7 days</p>
              </div>
              <div className="mt-4 space-y-3">
                <Row left="Flights" right="Booked" sub="Tickets paid for" />
                <Row left="Where you stay" right="Booked" sub="Deposit paid" />
                <Row
                  left="Food and days out"
                  right="Estimated"
                  sub="Planning estimates, separate from confirmed costs"
                  last
                />
              </div>
              <p className="mt-4 border-t border-[var(--line)] pt-3 text-[13px] text-ink-soft">
                A clearer picture before you spend more.
              </p>
            </div>
          }
        />

        <Scene
          label="Pro tips"
          flip
          title="A little local knowledge goes a long way."
          body="Tips tailored to your plans, with sources you can check. Turn the useful ones into reminders so they’re there when you need them."
          media={
            <div className="ma-in card p-5" style={{ animationDelay: "80ms" }}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-display text-[17px] font-semibold">
                  Worth knowing &middot; Maui
                </p>
                <p className="text-[13px] text-ink-soft">3 new</p>
              </div>
              {/* Deliberately not the ledger shape the money and day panels
                  use: a tip is a sentence with a date and a source under it,
                  and two Row lists in a row would read as the same screen
                  twice. */}
              <div className="mt-4 space-y-2.5">
                <Tip
                  when="Before you book"
                  title="Check sunrise entry requirements before choosing your day"
                  source="recreation.gov"
                />
                <Tip
                  when="Day 4, before you leave"
                  title="Download an offline map for your day 4 drive"
                  source="Your itinerary"
                />
                <Tip
                  when="Before you pack"
                  title="Check local sunscreen rules before you pack"
                  source="Hawaii Revised Statutes 342D-21"
                />
              </div>
            </div>
          }
        />
      </div>

      {/* Supporting capabilities, without repeating the six scenes above.
          Plain lists rather than chips: these describe features, not actions. */}
      <Reveal
        as="section"
        className="mx-auto w-full max-w-[74rem] px-5 sm:px-8"
      >
        <div className="border-t border-[var(--line)] py-14">
          <h2 id="aly-details-heading" className="section-label ma-in">
            More of the details, taken care of
          </h2>
          <div className="mt-7 grid gap-8 md:grid-cols-3 md:gap-10">
            {ALY_INDEX.map((group, gi) => (
              <div
                key={group.key}
                className="ma-in"
                style={{ animationDelay: `${gi * 80}ms` }}
              >
                <h3 className="border-b border-[var(--line)] pb-3 font-display text-[20px] font-semibold">
                  {group.heading}
                </h3>
                <ul className="mt-4 space-y-5">
                  {group.items.map((item) => (
                    <li key={item.title}>
                      <h4 className="text-[16px] font-semibold">
                        {item.title}
                      </h4>
                      <p className="mt-1 text-[16px] leading-relaxed text-ink-soft">
                        {item.body}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
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
            Aly answers for the traveler in front of her, and for nobody else
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
            No ads. No commissions. Just the memories that matter.
          </h2>
          <div
            className="ma-in mt-6 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "80ms" }}
          >
            <Link href="/login" className="btn btn-primary ma-cta">
              Meet Aly
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
