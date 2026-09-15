// The months a bucket-list place is worth going in, and how to say them.
//
// Kept out of the screen that first needed it because three other places now ask
// the same question: the tool Aly writes these rows with has to read months out
// of a sentence, the verdict on a fare has to know whether the travel dates fall
// inside them, and the summary line under a place has to say them the way the
// family would. One list of month names, one way of collapsing a run.

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const FULL = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/** The numbers 1 to 12, deduplicated and in order. */
export function cleanMonths(months = []) {
  const list = Array.isArray(months) ? months : [months];
  return [...new Set(list.map((m) => Number(m)))]
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12)
    .sort((a, b) => a - b);
}

/**
 * Months from whatever the model sent.
 *
 * A schema can ask for integers and still be handed "June" or "Jun", because a
 * model writing about a family's summer says the word. Both are read, and
 * anything that is neither is dropped rather than guessed at.
 */
export function parseMonths(months) {
  const list = Array.isArray(months) ? months : months ? [months] : [];
  const out = [];
  for (const raw of list) {
    if (typeof raw === "number") {
      out.push(raw);
      continue;
    }
    const said = String(raw || "")
      .trim()
      .toLowerCase();
    if (!said) continue;
    if (/^\d+$/.test(said)) {
      out.push(Number(said));
      continue;
    }
    const found = FULL.findIndex(
      (full) => full === said || full.slice(0, 3) === said.slice(0, 3),
    );
    if (found >= 0) out.push(found + 1);
  }
  return cleanMonths(out);
}

/**
 * The months, said the way a family would say them.
 *
 * An empty list means any month, which is a real answer and not a missing one:
 * plenty of places are worth going whenever the fare is right, and forcing a
 * choice there would put twelve ticks on most rows for no information.
 * Runs of three or more collapse -- "Jun-Aug" rather than "Jun, Jul, Aug" -- and
 * December through February wraps, because a family who can only go in winter
 * should not read their own answer as "Jan, Feb, Dec".
 */
export function monthsSaid(months = []) {
  const set = cleanMonths(months);
  if (!set.length || set.length === 12) return "any month";

  // Rotate so a wrapping winter run starts at its own beginning.
  let start = 0;
  for (let i = 0; i < set.length; i += 1) {
    const before = set[(i - 1 + set.length) % set.length];
    const gap = (set[i] - before + 12) % 12;
    if (gap !== 1) {
      start = i;
      break;
    }
  }
  const order = [...set.slice(start), ...set.slice(0, start)];

  const runs = [];
  for (const month of order) {
    const run = runs[runs.length - 1];
    if (run && (month - run[run.length - 1] + 12) % 12 === 1) run.push(month);
    else runs.push([month]);
  }
  return runs
    .map((run) =>
      run.length >= 3
        ? `${MONTHS[run[0] - 1]}\u2013${MONTHS[run[run.length - 1] - 1]}`
        : run.map((m) => MONTHS[m - 1]).join(", "),
    )
    .join(", ");
}

/** True when a date falls in one of the months the place is wanted in. */
export function monthWanted(months, isoDate) {
  const set = cleanMonths(months);
  if (!set.length) return true;
  const month = Number(String(isoDate || "").slice(5, 7));
  if (!month) return false;
  return set.includes(month);
}
