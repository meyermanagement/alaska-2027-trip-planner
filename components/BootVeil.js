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

import { useEffect, useState } from "react";

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

// The gradient ids the opening screens use for the needle -- one per drawing,
// because a reference cannot reach out of its own svg on every browser this has
// to run on, and because the short opening keeps two fields in the markup with
// only one of them displayed. A paint server sitting inside the hidden one is
// not reliably usable by the visible one: Chrome drops it, and the needle
// disappears rather than falling back to a color. So each field carries its own.
// All of them resolve to the same four skin accents; see AlyeskaMark for why the
// aurora needle exists at all.
const AURORA_FULL = "alyeska-aurora-boot";
const AURORA_QUICK = "alyeska-aurora-quick";

// Teal at north, falling through glacier to plum at the tails, down the needle's
// own axis rather than the box. Written once and rendered into whichever svg
// wants it, so the two openings cannot drift apart.
function AuroraNeedleFill({ id }) {
  return (
    <defs>
      <linearGradient
        id={id}
        x1="16"
        y1="2.9"
        x2="16"
        y2="29"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stopColor="var(--aurora-north)" />
        <stop offset="0.55" stopColor="var(--aurora-mid)" />
        <stop offset="1" stopColor="var(--aurora-tail)" />
      </linearGradient>
    </defs>
  );
}

// The shipped needle at 72 percent, which is the largest size whose tail points
// clear the innermost graduation. The tint on the west face turns with it -- it is one
// object, and a needle whose lit side stayed put while the blade swung would not
// be a needle at all.
//
// Two nested groups above the paths, because they carry two different rotations
// that have to compose rather than overwrite each other: the swing that settles
// on north, and the drift that keeps the settled needle alive. One element
// cannot run two transform animations -- the second silently wins.
function Needle({ swing, aurora }) {
  return (
    <g transform="translate(16 16) scale(0.72) translate(-16 -16)">
      <g className={swing ? "boot-swing" : undefined}>
        <g className={swing ? "boot-drift" : undefined}>
          <path
            fillRule="evenodd"
            fill={aurora ? `url(#${AURORA_FULL})` : "currentColor"}
            d="M16 2.9 28.1 29 16 20.9 3.9 29Z M16 8.84 9.92 21.96 16 17.89 22.08 21.96Z"
          />
          <path
            d="M9.92 21.96 16 17.89 16 8.84Z"
            fill={aurora ? "var(--aurora-tail)" : "currentColor"}
            opacity={aurora ? 0.3 : 0.28}
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
          /* North in amber, the way the shipped mark does it, so the graduation
             the needle comes to rest on is the one warm thing on the card. */
          stroke={i === 0 ? "var(--aurora-north-tick)" : "currentColor"}
          strokeWidth={w}
          strokeLinecap="round"
          opacity={live && i > 0 ? o : 1}
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
// Two tiles, one per shape of screen, measured in rems at the same scale the
// graticule repeats at. Each one begins and ends at the same offset across the
// tile and leaves at the same angle it arrived, so copies laid end to end draw a
// single line with no joint in it, and each one spans a whole number of the
// graticule's 4.75rem cells -- twelve of them climbing, twenty-four crossing --
// so the moment the map has travelled one tile it is exactly where it started.
// That is what makes the crossing endless rather than eight seconds long.
//
// The keyframes that move the map along these come from
// scripts/opening-route.mjs, which walks these very paths at a constant speed.
// Change a path here and run that script again.
const TALL_TILE = {
  kind: "tall",
  box: "0 0 40 57",
  span: 57,
  axis: "y",
  route: "M20 57C20 47 6 45 6 36S34 30 34 21S20 10 20 0",
  stop: [20, 57],
  waypoint: [34, 21],
};

const WIDE_TILE = {
  kind: "wide",
  box: "0 0 114 40",
  span: 114,
  axis: "x",
  route: "M0 20C10 20 14 8 24 8S44 32 54 32S78 6 88 6S106 20 114 20",
  stop: [0, 20],
  waypoint: [54, 32],
};

const TILE_COPIES = [-1, 0, 1];

// The mark itself, at a size in rems: it rides on the map but it is not stretched
// by it, because a compass drawn wider than it is tall is a broken compass.
function QuickMark({ gradientId }) {
  return (
    <svg viewBox="0 0 32 32" fill="none">
      <AuroraNeedleFill id={gradientId} />
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
        <path
          d="M16 1 16 4.4"
          strokeWidth="1.7"
          stroke="var(--aurora-north-tick)"
        />
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
            fill={`url(#${gradientId})`}
            transform="translate(16 16) scale(0.72) translate(-16 -16)"
            d="M16 2.9 28.1 29 16 20.9 3.9 29Z M16 8.84 9.92 21.96 16 17.89 22.08 21.96Z"
          />
        </g>
      </g>
    </svg>
  );
}

// One field per orientation, and each field is the same tile laid down three
// times: the one you are on, the one ahead of you and the one behind. Three is
// enough because a tile is longer than the window it is drawn in, so there is
// always route above the top edge and below the bottom one. The drawing is not
// stretched to the screen -- it is sized in rems -- which is what keeps the
// waypoints round and lets the needle read a true heading instead of one
// corrected for a squashed picture.
function QuickField({ tile }) {
  return (
    <div className={`quick-field quick-${tile.kind}`}>
      <svg className="quick-plot" viewBox={tile.box} fill="none">
        {TILE_COPIES.map((copy) => (
          <g
            key={copy}
            transform={
              tile.axis === "x"
                ? `translate(${copy * tile.span} 0)`
                : `translate(0 ${copy * tile.span})`
            }
          >
            <path
              className="quick-route"
              d={tile.route}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              opacity="0.42"
              vectorEffect="non-scaling-stroke"
            />
            {/* The places the route is going. The ring is where one tile hands
                over to the next, so one of these arrives from off the edge of
                the screen every time the map has travelled a tile -- that is
                the next location, and it is the reason the journey reads as
                going somewhere rather than as a line being dragged. The dot is
                a lesser stop halfway between. */}
            <circle
              className="quick-stop"
              cx={tile.stop[0]}
              cy={tile.stop[1]}
              r="0.62"
              stroke="currentColor"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              opacity="0.55"
            />
            <circle
              className="quick-waypoint"
              cx={tile.waypoint[0]}
              cy={tile.waypoint[1]}
              r="0.4"
              fill="currentColor"
              opacity="0.45"
            />
          </g>
        ))}
      </svg>
    </div>
  );
}

function QuickVeil() {
  return (
    <div className="boot-quick" aria-hidden="true">
      {/* The name, set the way a chart is titled rather than the way a splash is
          branded: top left, letterspaced, over a hairline, quiet enough that the
          route stays the thing you look at. The full opening already introduces
          the app with a lockup in the middle of the screen; this one is a map,
          and a map carries its title in a corner. */}
      <p className="quick-title font-display">
        Alyeska
        <span className="quick-rule" />
      </p>
      {/* The map, and the camera looking at it. The world turns and breathes;
          inside it the camera slides the ground and the route together by
          exactly the amount that keeps the compass on the line, and because the
          slide happens inside the turn rather than outside it, the point the
          compass sits on stays put however far the ground has tilted or zoomed.
          The graticule is a sibling rather than a child of the camera: it is
          moved by its own background instead of by a transform, which keeps it
          the size of the window rather than the size of the journey. */}
      <div className="quick-world">
        {/* Lines of latitude and longitude, edge to edge, faint enough to read
            as paper rather than as a grid to be counted. Gradients rather than
            lines in the drawings, because they have a whole window to cover. */}
        <div className="quick-grid" />
        <div className="quick-cam">
          <QuickField tile={TALL_TILE} />
          <QuickField tile={WIDE_TILE} />
        </div>
      </div>
      {/* The compass does not travel across the screen any more -- it is held in
          the middle of it and the country comes to it, which is what a map on a
          phone does. Only the needle moves, and only to the heading. */}
      <div className="quick-pin quick-tall">
        <QuickMark gradientId={`${AURORA_QUICK}-tall`} />
      </div>
      <div className="quick-pin quick-wide">
        <QuickMark gradientId={`${AURORA_QUICK}-wide`} />
      </div>
    </div>
  );
}

// How long after the veil lifts the markup is taken out of the document. Longer
// than the 420ms fade in globals.css, with room for a slow frame, and short
// enough that it is gone before anybody could navigate back into it.
//
// It has to leave, not merely hide. Everything that hides it hangs off
// data-booted on <html>, and that flag is a thing another party can take away:
// a re-render that reconciles the element, a browser restoring a page from its
// back-forward cache, anything that hands React a fresh <html> to own. The
// moment the flag goes the stylesheet has no reason to keep the veil down, its
// fail-safe animation starts again from the top, and a compass fades up over an
// app the family was already using. An element that is not there cannot come
// back, which is the only version of this that cannot happen twice.
const REMOVE_MS = 900;

export default function BootVeil() {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    // Already lifted before this mounted -- a remount, or a second copy in a
    // tree that re-rendered. There is nothing to hold and nothing to fade, so
    // the only useful thing left to do is get out of the document.
    if (root.dataset.booted) {
      setGone(true);
      return;
    }

    // Set by the script in the head, from the session cookie. Absent means no
    // script ran at all, and the full opening is the safer thing to show then:
    // it is the one that does not depend on anything having worked.
    const quick = root.dataset.boot === "quick";
    const hold = quick ? QUICK_HOLD_MS : HOLD_MS;

    let done = false;
    let leave = null;
    // Watches the one attribute the whole mechanism rests on, for as long as the
    // veil is still in the document. If something clears data-booted in the
    // window between the lift and the removal, it is put straight back -- a
    // frame of compass is still a compass.
    const guard = new MutationObserver(() => {
      if (done && !root.dataset.booted) root.dataset.booted = "1";
    });

    const lift = () => {
      if (done) return;
      done = true;
      root.dataset.booted = "1";
      guard.observe(root, {
        attributes: true,
        attributeFilter: ["data-booted"],
      });
      leave = setTimeout(() => setGone(true), REMOVE_MS);
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
      if (leave) clearTimeout(leave);
      guard.disconnect();
    };
  }, []);

  // Hidden by the stylesheet from the moment data-booted is set; this is what
  // takes the markup out afterwards. Returning null before the first paint would
  // defeat the entire point of the file, so it can only happen after a lift.
  if (gone) return null;

  return (
    <div id="boot-veil" aria-hidden="true">
      <BootStage />
    </div>
  );
}

// Both openings, with none of the machinery that decides between them or takes
// them away. The veil above wraps this in the element the stylesheet hides once
// the app has arrived; the page at /login/opening wraps the same markup in one
// that is never hidden, so an opening can be watched for as long as it takes to
// judge rather than for the second it is normally up. Which of the two shows is
// the stylesheet's business either way: it reads data-boot on the document.
export function BootStage() {
  return (
    <>
      <QuickVeil />
      <div className="boot-mark">
        <svg viewBox="0 0 32 32" fill="none">
          <AuroraNeedleFill id={AURORA_FULL} />
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
              <Needle aurora />
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
          <Needle swing aurora />
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
    </>
  );
}
