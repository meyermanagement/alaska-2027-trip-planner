"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The two hooks behind the ma- motion system in app/globals.css.
 *
 * They started inside components/MeetAly.js, which is the screen the whole app
 * is judged on and the reason the system exists at all. They live here now
 * because the after-welcome checklist has to move the same way: two screens
 * of the same walkthrough, one built out of blocks that wait for the scroll
 * and one built out of rows that ticked in on a clock, read as two different
 * products. Copying the mechanism into a second file would have been the same
 * bug in two places, so the mechanism is one file and both screens import it.
 *
 * Nothing here renders. A component using these sets data-ma-armed on its own
 * root once mounted and data-ma-shown on each block as it arrives; the
 * stylesheet does the rest.
 */

/**
 * True once the boot veil has lifted off the page.
 *
 * The veil in the layout covers everything for the first five and a half
 * seconds of a cold open, and it sits at z-index 90 over a page that is
 * already mounted and already on screen -- so without this a hero's observer
 * fires immediately, the compass draws itself and the greeting finishes
 * speaking, all of it behind a splash, and the veil lifts onto a settled
 * screen. An introduction nobody can see is not an introduction.
 *
 * The veil announces itself by setting data-booted on <html>, so that is what
 * this watches. Three ways out, because a screen must never be stuck waiting:
 * the flag may already be set by the time this mounts on a warm navigation,
 * there may be no veil in the document at all, and the stylesheet lifts the
 * veil on its own at eight seconds if the veil's own component never ran.
 */
export function useBooted() {
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.booted || !document.getElementById("boot-veil")) {
      setBooted(true);
      return;
    }
    // A beat after the flag, not on it: the veil takes 420ms to fade, and the
    // compass drawing itself through a dissolving splash is the one part of the
    // sequence worth waiting a fifth of a second for a clear page to show.
    let settle = null;
    const done = () => {
      mo.disconnect();
      clearTimeout(failsafe);
      settle = setTimeout(() => setBooted(true), 240);
    };
    const mo = new MutationObserver(() => {
      if (root.dataset.booted) done();
    });
    mo.observe(root, { attributes: true, attributeFilter: ["data-booted"] });
    const failsafe = setTimeout(done, 8200);
    return () => {
      mo.disconnect();
      clearTimeout(failsafe);
      if (settle) clearTimeout(settle);
    };
  }, []);

  return booted;
}

/**
 * True once the returned ref's element has been on screen. Fires once and
 * forgets: a block that has arrived does not arrive again on the way back up.
 *
 * A browser with no observer to ask is treated as already revealed on its first
 * effect, so an old browser gets the screen rather than a blank one -- but never
 * on the first render, because the server has to agree with it.
 */
export function useRevealed(rootMargin = "-12% 0px -8% 0px") {
  const ref = useRef(null);
  // Always false on the first render, on the server and in the browser alike.
  // Reading IntersectionObserver here instead made the server send the markup
  // with the block already revealed and the browser hydrate it as not revealed,
  // which React reports as a hydration mismatch and does not patch up. The
  // no-observer case is handled in the effect below, where it is a browser fact
  // rather than a rendering one.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin, threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown, rootMargin]);

  return [ref, shown];
}
