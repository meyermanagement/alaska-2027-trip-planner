"use client";

import { useEffect, useState } from "react";

/**
 * True while the phone's on-screen keyboard is covering the bottom of the
 * screen.
 *
 * Why this is needed: on iOS the keyboard does not shrink the page. The page
 * keeps its full height and the keyboard is drawn on top of it, so anything
 * pinned to the bottom of the screen with `position: fixed` is pinned to a
 * bottom you can no longer see. Safari then tries to be helpful and, as soon as
 * you scroll, lifts those fixed elements up so they sit on the keyboard — which
 * is exactly the menu bar riding up over the page that this fixes. Android
 * browsers usually resize the page instead, in which case there is nothing to
 * correct and this stays false.
 *
 * The measurement is the gap between the page's height and the part of it you
 * can actually see. A focused text field is required as well, so that Safari
 * merely collapsing its own address bar while you scroll never counts.
 */
export default function useSoftKeyboard() {
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    // Without the visual viewport there is no way to tell, so leave the menu
    // where it is rather than guessing.
    if (!viewport) return undefined;

    let frame = 0;

    const read = () => {
      frame = 0;
      setCovered(
        keyboardCovers(
          window.innerHeight,
          viewport.height,
          document.activeElement,
        ),
      );
    };

    // Focus moves in two steps, and the keyboard animates open over a few
    // hundred milliseconds, so measure on the next frame rather than now.
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(read);
    };

    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    schedule();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
    };
  }, []);

  return covered;
}

/**
 * Kept separate from the hook so the rule can be read and tested on its own.
 * The threshold is well below any real keyboard and well above the address bar
 * and toolbars, which come to about 60 to 110 points on a phone.
 */
export function keyboardCovers(pageHeight, visibleHeight, active) {
  if (!Number.isFinite(pageHeight) || !Number.isFinite(visibleHeight)) {
    return false;
  }
  if (pageHeight - visibleHeight < 160) return false;
  return isTyping(active);
}

/** Something you can type into, as opposed to a link or a button. */
export function isTyping(active) {
  if (!active) return false;
  const tag = (active.tagName || "").toLowerCase();
  if (tag === "textarea") return true;
  if (tag === "select") return true;
  if (active.isContentEditable) return true;
  if (tag !== "input") return false;
  const type = (active.getAttribute("type") || "text").toLowerCase();
  // Checkboxes, radios and buttons are inputs too, and none of them open a
  // keyboard.
  return !["checkbox", "radio", "button", "submit", "reset", "file"].includes(
    type,
  );
}
