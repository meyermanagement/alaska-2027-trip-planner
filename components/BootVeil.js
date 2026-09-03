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
// Under the wordmark it says "Travel," and turns one word: personalized,
// contextualized, simplified. Those are the three promises in the order they
// are earned -- who is travelling, what the trip actually is, and what that
// saves them -- and they turn on CSS alone, so they animate in the first frame
// rather than waiting for React.
//
// It is shown once per document load. Moving between tabs afterwards never
// brings it back: the flag lives on <html>, and the layout is not re-rendered
// by a client-side navigation.

import { useEffect } from "react";

// Shortest time the mark stays up. The draw itself takes 1.15s, but being cut
// off part-drawn looks intentional -- the veil fades, it does not snap -- and
// waiting out the full draw on a fast connection would make the app slower for
// no reason anybody can see.
const HOLD_MS = 620;

// Longest. Past this the page is shown whatever state it is in, because a veil
// held over a screen that is never going to finish is just a hidden error.
const CAP_MS = 2600;

export default function BootVeil() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.booted) return;

    let done = false;
    const lift = () => {
      if (done) return;
      done = true;
      root.dataset.booted = "1";
    };

    const cap = setTimeout(lift, CAP_MS);

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
      const left = Math.max(0, HOLD_MS - performance.now());
      wait = setTimeout(lift, left);
    });

    return () => {
      clearTimeout(cap);
      if (wait) clearTimeout(wait);
    };
  }, []);

  return (
    <div id="boot-veil" aria-hidden="true">
      <div className="boot-mark">
        <svg viewBox="0 0 32 32" fill="none">
          {/* The finished mark, faint and still, under the one that draws. The
              first frame of a stroke animation is an empty box, and a splash
              whose first quarter-second is blank is the problem this is meant to
              solve -- so the shape is whole from the start and the draw lands on
              top of it. */}
          <g className="boot-ghost">
            <circle
              cx="16"
              cy="16"
              r="14"
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="M16 4.6 24.3 26.9 16 21.5 7.7 26.9Z"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          <circle
            cx="16"
            cy="16"
            r="14"
            stroke="currentColor"
            strokeWidth="1.4"
            opacity="0.3"
            style={{ "--len": 88 }}
          />
          <path
            className="boot-fill"
            d="M16 4.6 16 21.5 7.7 26.9Z"
            fill="currentColor"
            opacity="0.3"
          />
          <path
            className="boot-stroke"
            d="M16 4.6 24.3 26.9 16 21.5 7.7 26.9Z"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ "--len": 72 }}
          />
        </svg>
        <span className="boot-word font-display">Alyeska</span>
        {/* The tagline turns on CSS keyframes rather than a React interval, for
            the same reason the veil is markup in the layout: this has to be
            animating in the first frame of HTML, before any JavaScript has run.
            An interval would start its first swap after hydration -- which on
            the open this exists to cover is the moment the veil is already
            lifting.

            Three words at 900ms each. The cadence in the design was 1.8-2.2s,
            written for a splash that sits there; this one is held for 620ms and
            capped at 2600ms, so at two seconds a word the family would only
            ever see "personalized." and the rotation would be decoration
            nobody witnessed. Faster is the honest reading of the same idea: a
            warm open shows one word, a cold open shows two or three. */}
        <p className="boot-tag" aria-hidden="true">
          <span className="boot-tag-fixed">Travel,</span>
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
