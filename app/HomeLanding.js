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
 * So this one shows instead. It is one long scroll of scenes -- the draft, the
 * week before, the day itself, the day that changed, the money, the things that
 * have to be done by a date -- each one a photograph or a piece of the actual
 * product, arriving as you reach it. The argument underneath every scene is the
 * same argument, and it is the only one worth making to somebody who has
 * planned a trip: Alyeska has your back, before you go and while you are there.
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
          body="Say it in a sentence. You do not have to know where you are staying or which flight to take — that is the part Aly suggests, built around how your travelers actually travel: how early they start, how far they will walk, what they will not eat, against the figure you would like the trip to cost and the credits already in your wallet. And when something she finds does not match what you have told her, she says so before you book it rather than after — the cheaper fare that lands at six in the morning, the week that is spring break everywhere and puts the whole thing over your number."
          media={
            <div className="ma-in card p-5" style={{ animationDelay: "80ms" }}>
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-display text-[17px] font-semibold">
                  A new trip
                </p>
                <p className="text-[13px] text-ink-soft">Nothing saved yet</p>
              </div>

              {/* The box as the builder actually presents it: one sentence, in
                  the words somebody would say, and the line underneath that
                  tells them how much of a trip they just described. */}
              <p className="mt-4 rounded-xl border border-[var(--line)] bg-sand/50 p-3 text-[14px] leading-relaxed">
                Maui for a week in March for about $6,000.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                That already covers where, when and budget. Aly will ask about
                the other four.
              </p>

              <div className="mt-4 border-t border-[var(--line)] pt-3">
                <p className="text-[13px] font-semibold">
                  What she came back with
                </p>
                <div className="mt-2.5 space-y-3">
                  <Row
                    left="A two-bedroom condo in Kīhei"
                    right="$1,880 the week"
                    sub="You cook most nights, and it is a four-minute walk to the sand"
                  />
                  <Row
                    left="The 10:40 am flight, not the 6:10"
                    right="$240 more"
                    sub="Dani does not do overnights, and Mia is nine"
                  />
                  <Row
                    left="$300 of airline credit against it"
                    right="Expires in May"
                    sub="It covers most of a bag and a seat change"
                    last
                  />
                </div>
              </div>

              <p className="mt-4 border-t border-[var(--line)] pt-3 text-[13px] text-ink-soft">
                Suggested from how your travelers travel, the number you gave
                her, and what is already in your wallet.
              </p>
            </div>
          }
        />

        <Scene
          label="Before you go"
          flip
          title="From the day you book to the morning you leave."
          body="The work does not start the week before, and neither does Alyeska. Every task is dated against your actual departure and arrives when you can act on it — the car held before the prices climb, the boat booked while there are still seats, the mail stopped, the bag packed the night before, the drive timed on the morning itself. Nothing sits on a list you reread every Sunday. The packing list is built from who is going and what the place is like, and the things nobody remembers are already on it."
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
                  sub="Both climb over the new year"
                />
                <Stage
                  when="A month out"
                  on="Feb 12"
                  title="Book the morning snorkel boat"
                  sub="The early one goes first, and Mia is nine"
                />
                <Stage
                  when="Week before"
                  on="Mar 7"
                  title="Stop the mail, tell the neighbor"
                  sub="Seven days of post in the box otherwise"
                />
                <Stage
                  when="Day before"
                  on="Mar 13"
                  title="Pack from the list, chargers last"
                  sub="Built from who is going and what Maui is like"
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
          title="The whole day, and everything you booked for it, on one screen."
          body="It opens on the day you are living, not on day one. Underneath each thing is the booking itself — the confirmation number, the check-in time, the address to hand a driver — so nobody is hunting through an inbox on hotel wifi for a code they forwarded in March. Aly reads those confirmations in whatever language they arrive in and pulls out the part that would have caught you: cash only, thirty minutes early, ID at the desk. And everything you need for each day is kept on the day it is needed, so you are not standing at the door trying to remember what today takes."
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
                  sub="Conf. MKN4‑8821 &middot; check in 7:50 &middot; 12 min drive"
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

              {/* The day's own bag, which is the part people expect least: a
                  short list for today rather than the whole packing list. */}
              <div className="mt-4 rounded-xl border border-[var(--line)] bg-sand/40 p-3">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[13px] font-semibold">In the bag today</p>
                  <p className="text-[12px] text-ink-soft">3 of 4</p>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                  Reef-safe sunscreen &middot; Mia&rsquo;s shell &middot; the
                  printed voucher &middot; cash for the deposit
                </p>
              </div>

              <p className="mt-3 rounded-[10px] bg-sand p-3 text-[13px] leading-relaxed">
                <span className="font-semibold">Aly:</span> The boat&rsquo;s
                voucher wants the balance in cash and a photo ID at the desk, so
                both are in today&rsquo;s bag. Rain about two, gone by four.
              </p>
            </div>
          }
        />

        <Scene
          label="When it changes"
          flip
          title="The ones you can see coming, and the ones you cannot."
          body="Some of it you can see coming: rain forecast for the afternoon you booked the boat, a connection too tight to make, two things booked in towns an hour apart. Aly tells you while there is still time to move something. The rest lands on the day, and then it helps that every booking, price and plan for that afternoon is already in one place. Nothing changes until you say so."
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
          label="Pro tips"
          flip
          title="The things you would only know if you had been before."
          body="Short, specific things worth knowing about where you are going, dated to the day they matter: the permit that has to be bought before you fly, the stretch of road with no signal, the sunscreen that is against the law there. Every one of them says where it came from, so you can check it yourself instead of taking our word for it, and any one worth acting on becomes a dated reminder with one press."
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
                  when="Buy by February 11"
                  title="The sunrise permit goes on sale 60 days out"
                  source="recreation.gov"
                />
                <Tip
                  when="Day 4, before you leave"
                  title="No signal on the back road — download the map first"
                  source="Your own days, no model involved"
                />
                <Tip
                  when="Before you pack"
                  title="Sunscreen with oxybenzone cannot be sold in Hawaii"
                  source="Hawaii Revised Statutes 342D-21"
                />
              </div>
            </div>
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
            Alyeska is a household travel planner by CRM Elite Cohort. Written
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
