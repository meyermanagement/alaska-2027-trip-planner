"use client";

/**
 * The one way the browser reports what somebody just did.
 *
 * Two rules, both learned the hard way by everybody who has written one of
 * these. It must never make the person wait: nothing here is awaited by the UI
 * and every failure is swallowed, because a screen that stalls or shouts because
 * a measurement did not land is worse than not measuring. And it must survive
 * the navigation that caused it, which is what `sendBeacon` is for — a normal
 * fetch fired while the page is being torn down is cancelled with it, which is
 * exactly the moment the most interesting event happens.
 *
 * `keepalive` on the fetch is the fallback for browsers that will not take a
 * beacon body, and it means the same thing: finish this after the document is
 * gone.
 */

const ENDPOINT = "/api/usage";

/**
 * @param {Array<{kind: string, path?: string, step?: string, ms?: number, meta?: object}>} events
 * @param {{beacon?: boolean}} [options] beacon when the page is going away
 */
export function sendUsage(events, options = {}) {
  if (typeof window === "undefined") return;
  const list = (events || []).filter(Boolean);
  if (!list.length) return;
  const body = JSON.stringify({ events: list });

  try {
    if (options.beacon && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Measurement is never worth an error in front of somebody.
  }
}

/**
 * One named step of a flow, with how long they sat on it.
 *
 * Used by the interview, where the path never changes but the question does, so
 * page views alone cannot say which question somebody stalled on.
 *
 * @param {string} step
 * @param {number} ms
 * @param {object} [meta]
 */
export function recordStep(step, ms, meta) {
  if (!step) return;
  sendUsage([
    {
      kind: "step",
      step,
      ms: Number.isFinite(ms) ? Math.round(ms) : undefined,
      meta,
    },
  ]);
}
