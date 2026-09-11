"use client";

// What the family looks at for the first half-second of a cold open.
//
// Opening the app used to show a white flash, then a frame of grey bars, then
// covers snapping in one at a time -- three separate arrivals, which is what
// read as frozen. This holds one thing over the whole page instead: the compass
// drawing itself on the page's own ground, with the wordmark under it. When the
// app underneath is ready the veil lifts away, so the first real thing anybody
// sees is a whole page rather than a half-built one.
//
// Three rules it has to keep:
//
//   It must be in the very first frame of HTML, before any JavaScript has run.
//   That is why the markup lives in the layout and is hidden by CSS rather than
//   unmounted by React -- a veil that waited for hydration would be behind the
//   blank moment it exists to cover.
//
//   It must never flicker. On a warm open the app can be ready in 80ms, and a
//   splash that appeared and vanished inside a tenth of a second is worse than
//   none, so it is held for HOLD_MS whatever happens.
//
//   It must never trap anybody. If this component never mounts -- a bundle that
//   failed, JavaScript switched off -- the stylesheet lifts the veil on its own
//   after five seconds. That fail-safe is in globals.css, not here, because the
//   whole point is that it works when this file does not.
//
// Under the wordmark it says "Travel" and turns one word: personalized,
// contextualized, simplified. Those are the three promises in the order they
// are earned -- who is travelling, what the trip actually is, and what that
// saves them -- and they turn on CSS alone, so they animate in the first frame
// rather than waiting for React.
//
// Moving between tabs never brings a veil back: the flag lives on <html>, and
// the layout is not re-rendered by a client-side navigation. But a document load
// does bring one back, and there are more of those than there look to be -- a
// sign-in, a server redirect, opening the app again from the home screen -- so
// the full opening above was playing several times an hour on a day of testing,
// and five and a half seconds of tagline is an arrival, not a wait.
//
// So there are two veils, and the script in the document head decides which one
// this load gets by looking for a session cookie. The first document load in a
// browser session gets the full opening. Every load after it gets the short one:
// the same compass, crossing a map, held only as long as the page actually needs
// and gone in about half a second. Both live inside the same veil element, so
// they share its ground, its skin colors and its fail-safe, and the stylesheet
// shows one and hides the other on the strength of html[data-boot].

import { useEffect } from "react";

// Shortest time the mark stays up: one full turn of the tagline, three words at
// 1.9s each. It was 620ms, chosen so a fast open stayed fast, which meant the
// rotation was a thing only a slow connection ever saw. Holding for the whole
// turn is a deliberate trade -- every open now costs the family five and a half
// seconds they did not previously spend -- and it is the reason the words get
// long enough on screen to be read as claims rather than as a spinner.
const HOLD_MS = 5700;

// The short opening's hold. Long enough that it cannot flicker -- a veil that
// appears and vanishes inside a tenth of a second is worse than none -- and
// short enough that it never reads as a wait. It has no rotation to finish and
// nothing to claim, so there is nothing to hold it for beyond the page arriving.
const QUICK_HOLD_MS = 480;

// Longest. Past this the page is shown whatever state it is in, because a veil
// held over a screen that is never going to finish is just a hidden error. It
// has to sit above HOLD_MS with room to spare, and below the stylesheet's
// fail-safe, or one of the three would be quietly overruling another.
const CAP_MS = 7200;

// And its cap, which has to sit above QUICK_HOLD_MS and below the stylesheet's
// own fail-safe for the short veil.
const QUICK_CAP_MS = 2600;

// The housing: the graduated bezel the menu dial wears, with the rim drawn in
// as well -- the splash has no button border to borrow one from. A hairline ring
// at radius 15, whose circumference is 94.25, and sixteen marks stepping inward
// from it, north long and dark, the other three cardinals half-long. Each mark
// is written inward-first so it draws from the rim toward the middle. Generated
// by logo/housing.py.
const RING_LEN = 94.25;
const BEZEL = [
  ["M16 1 16 3.7", 1.7, 0.72, 3],
  ["M21.74 2.14 21.32 3.16", 1, 0.34, 1.2],
  ["M26.61 5.39 25.83 6.17", 1, 0.34, 1.2],
  ["M29.86 10.26 28.84 10.68", 1, 0.34, 1.2],
  ["M31 16 29 16", 1.4, 0.44, 2.2],
  ["M29.86 21.74 28.84 21.32", 1, 0.34, 1.2],
  ["M26.61 26.61 25.83 25.83", 1, 0.34, 1.2],
  ["M21.74 29.86 21.32 28.84", 1, 0.34, 1.2],
  ["M16 31 16 29", 1.4, 0.44, 2.2],
  ["M10.26 29.86 10.68 28.84", 1, 0.34, 1.2],
  ["M5.39 26.61 6.17 25.83", 1, 0.34, 1.2],
  ["M2.14 21.74 3.16 21.32", 1, 0.34, 1.2],
  ["M1 16 3 16", 1.4, 0.44, 2.2],
  ["M2.14 10.26 3.16 10.68", 1, 0.34, 1.2],
  ["M5.39 5.39 6.17 6.17", 1, 0.34, 1.2],
  ["M10.26 2.14 10.68 3.16", 1, 0.34, 1.2],
];

// The shipped needle at 72 percent, which is the largest size whose tail points
// clear the innermost graduation. The tint on the west face turns with it -- it is one
// object, and a needle whose lit side stayed put while the blade swung would not
// be a needle at all.
//
// Two nested groups above the paths, because they carry two different rotations
// that have to compose rather than overwrite each other: the swing that settles
// on north, and the drift that keeps the settled needle alive. One element
// cannot run two transform animations -- the second silently wins.
function Needle({ swing }) {
  return (
    <g transform="translate(16 16) scale(0.72) translate(-16 -16)">
      <g className={swing ? "boot-swing" : undefined}>
        <g className={swing ? "boot-drift" : undefined}>
          <path
            fillRule="evenodd"
            fill="currentColor"
            d="M16 2.9 28.1 29 16 20.9 3.9 29Z M16 8.84 9.92 21.96 16 17.89 22.08 21.96Z"
          />
          <path
            d="M9.92 21.96 16 17.89 16 8.84Z"
            fill="currentColor"
            opacity="0.28"
          />
        </g>
      </g>
    </g>
  );
}

// The rim and its sixteen marks, shared by the ghost layer and the live one. The
// ghost passes no classes, so it renders whole and still.
function Housing({ live }) {
  return (
    <>
      <circle
        cx="16"
        cy="16"
        r="15"
        stroke="currentColor"
        strokeWidth="1"
        opacity={live ? 0.2 : 1}
        className={live ? "boot-stroke" : undefined}
        /* A circle path starts at the east point, so without this the rim would
           draw itself from three o'clock. Turned back a quarter so it opens from
           north, which is where the eye is. */
        transform={live ? "rotate(-90 16 16)" : undefined}
        style={live ? { "--len": RING_LEN } : undefined}
      />
      {BEZEL.map(([d, w, o, len], i) => (
        <path
          key={d}
          d={d}
          stroke="currentColor"
          strokeWidth={w}
          strokeLinecap="round"
          opacity={live ? o : 1}
          className={live ? "boot-tick" : undefined}
          /* Each mark drops in a beat after the one to its west, so the card
             fills clockwise from north while the rim is still closing -- the
             same direction the numbers run. */
          style={
            live
              ? { "--len": len, animationDelay: `${120 + i * 34}ms` }
              : undefined
          }
        />
      ))}
    </>
  );
}

// The map the compass crosses on the short opening.
//
// Nothing here is a real place, and it should not be: this is up for half a
// second, and a recognizable coastline that got a glance and a half would be a
// claim the veil cannot support. What it needs to say is one thing -- something
// is being fetched and the app knows where it is going -- so it is a graticule,
// a route between two points, and the mark travelling it.
//
// The travel is a CSS keyframe walking the mark through thirteen points sampled
// off that same route, not an SVG animateMotion and not an offset-path. The
// first stopped on an iPhone; the second is younger than some of the phones this
// has to run on. A transform on a group is the one thing every browser here
// agrees about, and it is also the one the reduced motion query can reach.
//
// It fills the screen, in either shape of screen. The graticule is a pair of
// repeating gradients, so it runs to all four edges whatever the window is doing,
// and there are two routes -- one that climbs a tall screen and one that crosses
// a wide one -- with a media query choosing between them.
//
// And it turns around at the far end and comes back, which is why the cycle is
// one long keyframe rather than an alternating one: on the way home the needle
// has to read a hundred and eighty degrees off the way out, and an alternating
// animation would have run the headings backwards too.
//
// The needle points the way the mark is going and turns through the bends, which
// is the second set of sampled numbers: the tangent of the curve at each of
// those thirteen points, applied to the needle inside a housing that stays put.
// It is a compass being carried, not one being read.
const TALL_ROUTE = "M40 348C40 296 152 300 152 248S48 196 48 140S150 92 150 36";
const WIDE_ROUTE = "M32 164C84 164 96 116 148 116S212 60 264 60S324 30 348 24";

// The mark itself, at a size in rems: it rides on the map but it is not stretched
// by it, because a compass drawn wider than it is tall is a broken compass.
function QuickMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none">
      <circle
        cx="16"
        cy="16"
        r="15"
        fill="var(--disc-face)"
        stroke="var(--disc-edge)"
        strokeWidth="1"
      />
      {/* Four cardinals, and they stay where they are while the needle turns --
          north is the one thing on this picture that does not move. Sixteen
          graduations at this size is a smudge, and the housing on the full
          opening already earns them on a screen where the mark is the point. */}
      <g stroke="currentColor" strokeLinecap="round">
        <path d="M16 1 16 4.4" strokeWidth="1.7" opacity="0.72" />
        <path
          d="M31 16 28.6 16M16 31 16 28.6M1 16 3.4 16"
          strokeWidth="1.4"
          opacity="0.44"
        />
      </g>
      <g className="quick-heading">
        <g className="quick-needle">
          <path
            fillRule="evenodd"
            fill="currentColor"
            transform="translate(16 16) scale(0.72) translate(-16 -16)"
            d="M16 2.9 28.1 29 16 20.9 3.9 29Z M16 8.84 9.92 21.96 16 17.89 22.08 21.96Z"
          />
        </g>
      </g>
    </svg>
  );
}

// One field per orientation. Both are always in the markup and a media query
// shows one, which is how the drawing can be right for the shape of the screen
// instead of merely fitted to it: the tall route climbs, the wide one crosses,
// and each has its own turns and therefore its own headings.
function QuickField({ kind, box, route }) {
  return (
    <div className={`quick-field quick-${kind}`}>
      {/* The route stretches with the window -- that is the whole point of
          preserveAspectRatio none -- and the stroke does not, which is what
          keeps the dashes even and round-ended at any shape of screen. */}
      <svg
        className="quick-plot"
        viewBox={box}
        preserveAspectRatio="none"
        fill="none"
      >
        <path
          className="quick-route"
          d={route}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.42"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* Where it started and where it is going, placed as a share of the field
          rather than drawn in the stretched picture, so they stay round. The far
          one is hollow, so the pair reads as a journey with a direction. */}
      <span className="quick-end quick-from" />
      <span className="quick-end quick-to" />
      <div className="quick-travel">
        <QuickMark />
      </div>
    </div>
  );
}

function QuickVeil() {
  return (
    <div className="boot-quick" aria-hidden="true">
      {/* Lines of latitude and longitude, edge to edge, faint enough to read as
          paper rather than as a grid to be counted. Gradients rather than lines
          in the drawings, because they have a whole window to cover. */}
      <div className="quick-grid" />
      <QuickField kind="tall" box="0 0 200 380" route={TALL_ROUTE} />
      <QuickField kind="wide" box="0 0 380 200" route={WIDE_ROUTE} />
    </div>
  );
}

export default function BootVeil() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.booted) return;

    // Set by the script in the head, from the session cookie. Absent means no
    // script ran at all, and the full opening is the safer thing to show then:
    // it is the one that does not depend on anything having worked.
    const quick = root.dataset.boot === "quick";
    const hold = quick ? QUICK_HOLD_MS : HOLD_MS;

    let done = false;
    const lift = () => {
      if (done) return;
      done = true;
      root.dataset.booted = "1";
    };

    const cap = setTimeout(lift, quick ? QUICK_CAP_MS : CAP_MS);

    // Two frames after mount is the earliest the browser has actually painted
    // what hydration produced, and the fonts matter because lifting onto text
    // that is about to reflow into Fraunces undoes the point of the hold.
    const ready = Promise.all([
      new Promise((go) =>
        requestAnimationFrame(() => requestAnimationFrame(go)),
      ),
      document.fonts?.ready ?? Promise.resolve(),
    ]);

    let wait = null;
    ready.then(() => {
      // performance.now() is milliseconds since the navigation started, which
      // is the moment the family pressed the icon -- the only anchor worth
      // measuring the hold from.
      const left = Math.max(0, hold - performance.now());
      wait = setTimeout(lift, left);
    });

    return () => {
      clearTimeout(cap);
      if (wait) clearTimeout(wait);
    };
  }, []);

  return (
    <div id="boot-veil" aria-hidden="true">
      <QuickVeil />
      <div className="boot-mark">
        <svg viewBox="0 0 32 32" fill="none">
          {/* The finished mark, faint and still, under the one that arrives. The
              first frame of a stroke animation is an empty box, and a splash
              whose first quarter-second is blank is the problem this is meant to
              solve -- so the shape is whole from the start and the animation
              lands on top of it. */}
          <g className="boot-ghost">
            <Housing />
            {/* The ghost needle steps aside once the real one is on screen.
                Left in, a faint arrow parked on north while a solid one swings
                past it reads as two needles rather than one arriving. */}
            <g className="boot-ghost-needle">
              <Needle />
            </g>
          </g>
          {/* The card arrives first and stays put: the rim drawn round from
              north, and the sixteen marks dropping in clockwise behind it. It is
              the fixed part of the instrument, and the needle needs something to
              be off-heading against. */}
          <Housing live />
          {/* And then the needle finds north: it comes in a long way off, swings
              past, overshoots twice on a shortening arc and settles, the way a
              real one does when the case stops moving. It takes two and a half
              seconds of the hold, which is the point -- the splash is up for
              five and a half either way, and this is the half of it that says
              the app is doing something rather than waiting.

              Once settled the needle keeps drifting a degree or so, on a slow
              loop that never stops. A compass at rest is not perfectly still,
              and a mark that freezes stops reading as an instrument. */}
          <Needle swing />
        </svg>
        <span className="boot-word font-display">Alyeska</span>
        {/* The tagline turns on CSS keyframes rather than a React interval, for
            the same reason the veil is markup in the layout: this has to be
            animating in the first frame of HTML, before any JavaScript has run.
            An interval would start its first swap after hydration -- which on
            the open this exists to cover is the moment the veil is already
            lifting.

            Three words at 1.9s each, and the veil is now held for the whole
            turn rather than the other way round -- a rotation nobody stays
            long enough to see is not worth having, and a word that leaves
            before it has been read is a spinner with letters on it. */}
        <p className="boot-tag" aria-hidden="true">
          <span className="boot-tag-fixed">Travel</span>
          <span className="boot-tag-slot">
            <span>personalized.</span>
            <span>contextualized.</span>
            <span>simplified.</span>
          </span>
        </p>
      </div>
    </div>
  );
}
