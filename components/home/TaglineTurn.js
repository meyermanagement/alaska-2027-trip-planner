"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { useBooted } from "@/components/reveal";

/**
 * The line above the headline: Travel · Personalized. Contextualized. Simplified.
 *
 * The same three words the boot screen turns under the wordmark, in the same
 * order, and the same way the front door once turned its four roles for Aly:
 * all three stay on the line and the light moves along them. Nothing swaps in
 * or out, so the line never reflows and is whole for anybody who looks up
 * halfway through. The lit word takes the app's teal, as the turning word does
 * in the lockup everywhere else.
 *
 * With nothing running -- the server render, no JavaScript, or a reader who
 * asked for less motion -- every word is lit and the line is simply the list.
 */

const WORDS = ["Personalized.", "Contextualized.", "Simplified."];
const HOLD_MS = 2100;

export default function TaglineTurn() {
  const [turning, setTurning] = useState(false);
  const [at, setAt] = useState(0);
  // Held on the first word until the loading screen lifts, which is also the
  // word the loading screen itself opens on.
  const booted = useBooted();

  useLayoutEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    setTurning(true);
  }, []);

  useEffect(() => {
    if (!turning || !booted) return undefined;
    const t = setTimeout(() => setAt((n) => (n + 1) % WORDS.length), HOLD_MS);
    return () => clearTimeout(t);
  }, [turning, booted, at]);

  return (
    <span className="home-rotor-line">
      Travel ·
      {WORDS.map((word, i) => (
        // The space sits between the spans, not in a margin, so a narrow phone
        // still has somewhere to break the line.
        <span key={word}>
          {" "}
          <span
            className="home-rotor-word"
            data-on={!turning || i === at ? "true" : "false"}
            data-lit={turning && i === at ? "true" : undefined}
          >
            {word}
          </span>
        </span>
      ))}
    </span>
  );
}
