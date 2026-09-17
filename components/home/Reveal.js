"use client";

import { useBooted, useRevealed } from "@/components/reveal";

/**
 * The two pieces of the ma- motion system, made usable from a server component.
 *
 * The front door has a problem the rest of the app does not: the reader it
 * exists for may be a crawler that runs no JavaScript at all, and its copy is
 * the only evidence Google's brand check has that this domain is Alyeska. So
 * the copy has to be server-rendered text, which means the page itself cannot
 * be a client component -- and the ma- system needs a mounted component to arm
 * the root and an observer per block.
 *
 * These two do only that, and take the markup as children. The words are still
 * rendered on the server and still sit in the HTML a crawler is handed; all
 * that crosses the boundary is one attribute on a wrapper. And because the
 * stylesheet hides ma- blocks only inside an armed root, a browser running no
 * JavaScript never arms anything and gets the whole page plainly visible, which
 * is the same guarantee the old static page made.
 */

/** Arms the ma- system, but not until the boot veil has actually lifted. */
export function MotionRoot({ children, className }) {
  const booted = useBooted();
  return (
    <div className={className} data-ma-armed={booted ? "" : undefined}>
      {children}
    </div>
  );
}

/** Marks its block shown the first time it comes on screen. */
export function Reveal({ children, className, rootMargin, as: Tag = "div" }) {
  const [ref, shown] = useRevealed(rootMargin);
  return (
    <Tag ref={ref} className={className} data-ma-shown={shown ? "" : undefined}>
      {children}
    </Tag>
  );
}
