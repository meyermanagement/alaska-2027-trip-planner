"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { ALY_DESCRIPTORS } from "@/lib/aly/descriptors";

/**
 * The eyebrow above the headline, refusing to pick a word.
 *
 * The invitation already makes this argument in Aly's voice -- assistant,
 * advisor, concierge, planner, none of them right on their own -- and the front
 * door was making a weaker version of it by choosing one and calling her a
 * personal travel assistant. Choosing is the thing to avoid. Every one of those
 * words is either too small for the work or carries a promise the product does
 * not make, and a reader who has met any of the four already has an idea in
 * their head that we would then have to argue them out of. Cycling them puts
 * all four in front of somebody in eight seconds and lets the headline
 * underneath do the resolving.
 *
 * Nothing is swapped in or out. All four words stay on the line and the light
 * moves along them, which is deliberate: a single word appearing on its own in
 * an eyebrow reads as a label, and a label is exactly what this refuses to be.
 * Seeing all four with one of them lit says "any of these, none of them quite"
 * in a way that a rotating slot cannot. It also means the line never reflows,
 * never announces itself again to a screen reader, and is complete for somebody
 * who looks up halfway through.
 *
 * With nothing running -- the server render, a reader with no JavaScript, or
 * anybody who asked their system for less motion -- every word is lit and the
 * line is just the list, which is how the invitation prints it.
 *
 * One word in front of the four does not move and never dims: travel. The first
 * screen had stopped saying what any of this was about. The header is a mark and
 * a name, the headline promises that Alyeska has your back without saying at
 * what, and the subject did not turn up until the word "trips" in the fourth
 * block of text -- by which point somebody who arrived cold has already decided
 * whether to keep reading. This line is the first text on the page and its whole
 * job is saying what Aly is, so it is the right place to say what she is for.
 *
 * It is a fixed word rather than a fifth rotating one on purpose. The point of
 * the sweep is refusing to choose among the four; travel is not a fifth candidate
 * competing with them, it qualifies all four at once, so it has to stay lit while
 * the light moves behind it. Being outside the rotation also means it survives
 * the fallback above: a reader with reduced motion or no JavaScript still gets
 * the subject, not just the list of roles.
 */

const HOLD_MS = 2100;

export default function RotatingWord() {
  // False on the server and on the first client paint, which is what makes the
  // static list the fallback rather than a flash.
  const [rotating, setRotating] = useState(false);
  const [at, setAt] = useState(0);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches)
      return;
    setRotating(true);
  }, []);

  useEffect(() => {
    if (!rotating) return undefined;
    const t = setTimeout(
      () => setAt((n) => (n + 1) % ALY_DESCRIPTORS.length),
      HOLD_MS,
    );
    return () => clearTimeout(t);
  }, [rotating, at]);

  // With nothing running, and for anybody who asked for less motion, the line
  // is simply the list. That is already the whole argument in text; the sweep
  // below only decides which word is lit.
  const lit = rotating ? at : -1;

  return (
    <span className="home-rotor-line">
      {/* Outside the map, and lit unconditionally: this word is the subject, not
          a candidate for the role the four below are arguing about. */}
      <span className="home-rotor-word" data-on="true">
        Travel
      </span>
      {ALY_DESCRIPTORS.map((word, i) => (
        // The space is rendered between the spans rather than added as a
        // margin, because two inline elements with no whitespace between them
        // give the browser nowhere to break the line, and on a narrow phone the
        // last word then runs off the edge of the screen.
        <span key={word}>
          {" "}
          <span
            className="home-rotor-word"
            data-on={i === lit || !rotating ? "true" : "false"}
          >
            {word}
            {i < ALY_DESCRIPTORS.length - 1 ? "," : "\u2026"}
          </span>
        </span>
      ))}
    </span>
  );
}
