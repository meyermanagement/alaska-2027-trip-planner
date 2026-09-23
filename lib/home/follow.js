/**
 * How the example answer on the home page follows its own newest line.
 *
 * The window is about 22rem tall and the answer is written into it word by
 * word, so something has to keep the newest line in view. That something used
 * to close 5.5% of the remaining gap every frame with no ceiling, which made it
 * fastest exactly when a card arrived and the gap jumped -- the moment a reader
 * is most likely to still be reading the line above. It now eases more gently
 * and, more importantly, cannot move more than a pixel or so in a frame, so the
 * page reads at a walking pace whatever arrives.
 */

/** Fraction of the remaining distance closed each frame. */
export const FOLLOW_EASE = 0.028;
/** The smallest nudge worth making, so it does not creep for ever. */
export const FOLLOW_MIN = 0.2;
/** The most it will move in one frame: about 66px a second at 60fps. */
export const FOLLOW_MAX = 1.1;

/**
 * How far to move this frame, given how far there is left to go. Never past the
 * target, so it settles rather than overshooting and bouncing.
 */
export function followStep(gap) {
  if (!(gap > 0)) return 0;
  return Math.min(gap, Math.min(FOLLOW_MAX, Math.max(FOLLOW_MIN, gap * FOLLOW_EASE)));
}
