// One tip, two places, one press.
//
// A pro tip pressing enough to earn the band at the top of every screen is also
// still sitting on the screen it belongs to -- that is the point of the band, not
// a bug. But clearing it in one place left it in the other until the next
// navigation, and a tip you have just dealt with staring back at you from the top
// of the page reads as "that did not work."
//
// The two live in different trees. The band is rendered by the header, a server
// component, and the cards are rendered by the page; neither is a parent of the
// other, so there is no shared state to lift into and no context that could wrap
// both without making the header dynamic on every screen. A router.refresh would
// work and costs a full re-render of the page plus the header's three queries, to
// hide one paragraph that is already gone from the database.
//
// So they talk. A window event is the smallest thing that reaches across two
// trees, and it is honest about what it is: presentation only. The database write
// has already happened by the time anybody listens, and if it fails the same
// channel carries the tip back, because a tip hidden in both places while still
// active in the table is the one outcome worse than the original problem.

const EVENT = "alyeska:tip-resolved";

/**
 * Say that a tip has been dealt with, or -- with a null status -- that it has
 * come back because the write did not stick.
 *
 * @param {string} id      the pro tip
 * @param {string|null} status  "cleared", "done", or null to restore it
 */
export function announceTipResolved(id, status) {
  if (typeof window === "undefined" || !id) return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id, status } }));
}

/**
 * Listen for the above. Returns the cleanup function an effect wants back.
 *
 * @param {(id: string, status: string|null) => void} handler
 */
export function onTipResolved(handler) {
  if (typeof window === "undefined") return () => {};
  const listener = (event) =>
    handler(event.detail?.id, event.detail?.status ?? null);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
