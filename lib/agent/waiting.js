/**
 * What a screen can honestly say while it is waiting on Aly.
 *
 * Kept out of the component so the words and the clock can be read and tested on
 * their own, and so anything else that has to wait can say the same things.
 */

/**
 * Lines by how long it has been going. Each one is true of the clock rather than
 * of the model, which is the only honest thing this component can say.
 */
export const WAITING_LINES = [
  [0, "Thinking…"],
  [6, "Still thinking. Some questions take a few seconds."],
  [16, "Still going. Longer questions take longer answers."],
  [31, "Nearly a minute now. Still waiting on her."],
  [55, "This is longer than usual. It may come back as an error."],
];

/** The line for a given number of whole seconds. */
export function waitingLine(seconds) {
  const s = Number.isFinite(seconds) ? seconds : 0;
  let said = WAITING_LINES[0][1];
  for (const [at, text] of WAITING_LINES) if (s >= at) said = text;
  return said;
}

/** "8s", or "1m 04s" once it has been going long enough to need minutes. */
export function elapsedSaid(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}
