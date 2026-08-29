// Driving a look from the browser, several places at once.
//
// The refresh route deliberately does one model call per request: it is allowed
// two minutes and a grounded answer takes twenty seconds of thinking and
// searching, so a route that tried to walk a whole trip in one request would time
// out on the trip that most needed walking. The loop therefore lives on this side,
// where it can report progress and leave behind whatever it found if the person
// closes the drawer halfway through.
//
// It used to walk the places strictly one at a time, and a trip look covers five
// of them — the trip, the packing list, the next three bookings — which is a
// two-minute wait for something that feels like it should take seconds. The places
// do not depend on each other, so they are asked for together now. The first one
// still goes alone: it is the one that may have to research the destination, and
// the four behind it read the fact sheet it leaves behind rather than each
// researching the same country in parallel.
//
// Both the "Look for tips" button and Aly's own find_tips call end up here, so
// there is one loop rather than two that drift apart.
//
// The Wallet uses the same loop with no trip at all. Its two questions -- the
// programs they hold, and the welcome offers on cards they do not -- go to their
// own route, because a wallet tip belongs to the family rather than to a trip.
// Everything the loop actually provides is still wanted there: two grounded calls
// run side by side, progress that moves, and whatever was found left behind if
// somebody closes the screen halfway.

import { WALLET_SCOPES } from "./tip";

const MAX_STEPS = 6;
// One more go when the connection itself failed rather than the server answering.
// A grounded look-up is the longest thing this app does, and a phone that changes
// network mid-call, or a function cut off before it could reply, produces a fetch
// that rejects with nothing useful in it — "Load failed" in Safari, "Failed to
// fetch" in Chrome. Neither is worth showing anybody, and both are worth trying
// once more before giving up.
const NETWORK_RETRIES = 1;

// How long this side waits before deciding the answer is not coming. The route is
// allowed longer than this by the platform, but it aims to answer inside it, and
// waiting is better done on a clock we control than on the browser's own, which
// gives up silently and says only that the load failed. Long, because researching
// a destination is measured in tens of seconds and the platform allows the route
// two minutes; there is no sense in this side quitting before the server has.
const PATIENCE_MS = 110000;
// Twice per step at most: once to research the place, once to ask for tips. The
// third is slack for a fact sheet that had to be written first.
const MAX_ROUNDS = 3;
// How many places are asked about at the same time. Every one of them is a
// grounded model call, and asking for all five at once is how a free-tier key
// spends its whole minute's allowance in one second and gets turned away.
const AT_ONCE = 3;

/**
 * Run one look to the end.
 *
 * @param {object} input
 * @param {string} input.tripId
 * @param {Array<{scope: string, itemId: string|null}>} input.steps
 * @param {(note: string) => void} [input.onNote]  progress, for a live region
 * @param {typeof fetch} [input.fetchImpl]
 * @returns {Promise<{found: number, error: string|null, ran: number}>}
 */
export async function runLook({
  tripId,
  steps,
  onNote = () => {},
  // How far along, for a bar that moves. Separate from the words because a
  // sentence cannot show that the third of five checks is underway, and a
  // frozen-looking screen is the thing people press twice.
  onProgress = () => {},
  fetchImpl = typeof fetch === "function" ? fetch : null,
}) {
  const plan = (Array.isArray(steps) ? steps : []).slice(0, MAX_STEPS);
  if (!plan.length) {
    return { found: 0, error: "There is nothing to look at.", ran: 0 };
  }
  // A trip is required for a look at a trip and meaningless for a look at the
  // Wallet, so the check is per step rather than up front.
  if (!tripId && plan.some((step) => !WALLET_SCOPES.includes(step?.scope))) {
    return { found: 0, error: "There is nothing to look at.", ran: 0 };
  }
  if (!fetchImpl) return { found: 0, error: "Cannot look right now.", ran: 0 };

  let found = 0;
  let ran = 0;
  let failure = null;
  // Something the server wants said in place of "nothing worth telling you" --
  // an empty Wallet has nothing to look at, which is a different answer from
  // having looked and found nothing.
  let told = null;
  const startedAt = Date.now();

  const say = () => {
    const done = Math.min(ran, plan.length);
    onProgress({ done, total: plan.length });
    if (plan.length < 2) return onNote("Looking…");
    // "Checks", because "0 of 5 done" reads as five things that were asked for
    // and none delivered, when what it means is that the app is working through
    // five places to look.
    onNote(
      done >= plan.length
        ? "Nearly there…"
        : `Looking… ${done} of ${plan.length} checks done`,
    );
  };
  say();

  /** One place, to the end: research the destination if it must, then ask. */
  const walk = async (step) => {
    let pending = { ...step };
    for (let round = 0; round < MAX_ROUNDS && pending; round++) {
      const answer = await ask({
        tripId,
        step: pending,
        fetchImpl,
        onNote: (note) => onNote(note),
      });
      if (answer.error) return answer;
      const json = answer.json;
      if (json.step === "facts") {
        onNote("Checking the place itself…");
        // The rules run in the same call that researched the destination, so this
        // round can arrive with tips already filed.
        found += json.found || 0;
        pending = json.next;
        continue;
      }
      found += json.added || 0;
      if (json.note && !told) told = String(json.note);
      pending = null;
    }
    return { error: null };
  };

  const runOne = async (step) => {
    const answer = await walk(step);
    ran++;
    if (answer.error && !failure) failure = answer.error;
    say();
  };

  // The first place alone, then the rest together. A failure on the first is
  // usually a failure on all of them — no key, no quota, not signed in — so there
  // is no sense in firing four more requests at it.
  await runOne(plan[0]);
  const rest = plan.slice(1);
  if (!failure && rest.length) {
    const queue = [...rest];
    const workers = Array.from(
      { length: Math.min(AT_ONCE, queue.length) },
      async () => {
        while (queue.length) {
          const step = queue.shift();
          if (step) await runOne(step);
        }
      },
    );
    await Promise.all(workers);
  }

  return {
    found,
    error: failure,
    ran,
    // How long the whole look took, so the screen can say so. A number people can
    // see is the difference between "it is slow" and "it took 24 seconds".
    tookMs: Date.now() - startedAt,
    note: told,
  };
}

/**
 * One request, retried once if the connection itself failed.
 *
 * @returns {Promise<{json?: object, error: string|null}>}
 */
async function ask({ tripId, step, fetchImpl, onNote }) {
  const wallet = WALLET_SCOPES.includes(step?.scope);
  for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt++) {
    try {
      const res = await fetchImpl(
        wallet ? "/api/tips/wallet" : "/api/tips/refresh",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            wallet
              ? { scope: step.scope }
              : {
                  tripId,
                  scope: step.scope,
                  itemId: step.itemId || null,
                },
          ),
          ...(typeof AbortSignal !== "undefined" &&
          typeof AbortSignal.timeout === "function"
            ? { signal: AbortSignal.timeout(PATIENCE_MS) }
            : {}),
        },
      );
      const json = await res.json().catch(() => ({}));
      // The server answered, even if the answer was no. Its own words are better
      // than anything this side could invent, and asking again would only ask it
      // to refuse twice.
      if (!res.ok) {
        return {
          error: json?.error || "That did not work. Try again in a minute.",
        };
      }
      return { json, error: null };
    } catch {
      if (attempt < NETWORK_RETRIES) {
        onNote("The connection dropped. Trying once more…");
        continue;
      }
    }
  }
  return {
    error:
      "The connection dropped before the server answered, which usually means the look-up ran long. Whatever was found is saved — press Look for tips again to carry on.",
  };
}
