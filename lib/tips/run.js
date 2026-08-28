// Driving a look from the browser, one request at a time.
//
// The refresh route deliberately does one model call per request: it is killed at
// sixty seconds and a single grounded answer is allowed forty-six of them, so a
// route that tried to walk a whole trip would time out on the trip that most
// needed walking. The loop therefore lives on this side, where it can run for as
// long as it takes, report progress, and leave behind whatever it found if the
// person closes the drawer halfway through.
//
// Both the "Look for tips" button and Aly's own find_tips call end up here, so
// there is one loop rather than two that drift apart.

const MAX_STEPS = 6;
// One more go when the connection itself failed rather than the server answering.
// A grounded look-up is the longest thing this app does, and a phone that changes
// network mid-call, or a function cut off before it could reply, produces a fetch
// that rejects with nothing useful in it — "Load failed" in Safari, "Failed to
// fetch" in Chrome. Neither is worth showing anybody, and both are worth trying
// once more before giving up.
const NETWORK_RETRIES = 1;
// Twice per step at most: once to research the place, once to ask for tips. The
// third is slack for a fact sheet that had to be written first.
const MAX_ROUNDS = 3;

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
  fetchImpl = typeof fetch === "function" ? fetch : null,
}) {
  const plan = (Array.isArray(steps) ? steps : []).slice(0, MAX_STEPS);
  if (!tripId || !plan.length) {
    return { found: 0, error: "There is nothing to look at.", ran: 0 };
  }
  if (!fetchImpl) return { found: 0, error: "Cannot look right now.", ran: 0 };

  let found = 0;
  let ran = 0;

  for (const step of plan) {
    let pending = { ...step };
    for (let round = 0; round < MAX_ROUNDS && pending; round++) {
      onNote(
        plan.length > 1 ? `Looking… ${ran + 1} of ${plan.length}` : "Looking…",
      );
      let json;
      let failure = null;
      for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt++) {
        failure = null;
        try {
          const res = await fetchImpl("/api/tips/refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tripId,
              scope: pending.scope,
              itemId: pending.itemId || null,
            }),
          });
          json = await res.json().catch(() => ({}));
          // The server answered, even if the answer was no. Its own words are
          // better than anything this side could invent, and trying again would
          // only ask it to refuse twice.
          if (!res.ok) {
            return {
              found,
              error: json?.error || "That did not work. Try again in a minute.",
              ran,
            };
          }
          break;
        } catch (error) {
          failure = error;
          if (attempt < NETWORK_RETRIES) {
            onNote("The connection dropped. Trying once more…");
            continue;
          }
        }
      }
      if (failure) {
        // Whatever was found before this point is already saved, so a failure
        // halfway is reported with the count rather than as a total loss.
        return {
          found,
          error:
            "The connection dropped before the server answered, which usually means the look-up ran long. Whatever was found is saved — press Look for tips again to carry on.",
          ran,
        };
      }
      if (json.step === "facts") {
        onNote("Checking the place itself…");
        // The rules run in the same call that researched the fact sheet, so this
        // step can arrive with tips already filed.
        found += json.found || 0;
        pending = json.next;
        continue;
      }
      found += json.added || 0;
      pending = null;
    }
    ran++;
  }

  return { found, error: null, ran };
}
