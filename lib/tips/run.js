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
        if (!res.ok) throw new Error(json?.error || "");
      } catch (error) {
        // Whatever was found before this point is already saved, so a failure
        // halfway is reported with the count rather than as a total loss.
        return {
          found,
          error: error?.message || "That did not work. Try again in a minute.",
          ran,
        };
      }
      if (json.step === "facts") {
        onNote("Checking the place itself…");
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
