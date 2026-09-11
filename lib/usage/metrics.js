import { ONBOARDING_STEPS, STEP_ORDER } from "@/lib/usage/steps";

/**
 * Turning a pile of rows into the four things worth knowing about a first run:
 * how many people reached each step, where they fell out, how long each step
 * held them, and which question of the interview is the one they sit on.
 *
 * Kept as pure functions over rows so the page does the reading and this does the
 * arithmetic, and so the definitions are in one place. "Reached a step" means at
 * least one recorded view of that screen — not "finished it", which nothing here
 * can honestly claim to know.
 *
 * Medians rather than means for dwell, reported side by side. One person who left
 * a tab open on the interview drags a mean far enough to invent a problem that is
 * not there, and the gap between the two numbers is itself the signal that
 * happened.
 */

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function mean(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, one) => sum + one, 0) / values.length);
}

/**
 * The funnel: one row per step, in order, with who got there and how long it
 * held them.
 *
 * @param {Array<{user_id: string, kind: string, step: string | null, ms: number | null}>} rows
 */
export function funnel(rows) {
  const perStep = new Map(
    ONBOARDING_STEPS.map((step) => [
      step.key,
      { ...step, people: new Set(), dwell: [], views: 0 },
    ]),
  );

  for (const row of rows) {
    if (row.kind !== "page" || !row.step) continue;
    const bucket = perStep.get(row.step);
    if (!bucket) continue;
    bucket.views += 1;
    if (row.user_id) bucket.people.add(row.user_id);
    if (Number.isFinite(row.ms) && row.ms > 1000) bucket.dwell.push(row.ms);
  }

  const ordered = STEP_ORDER.map((key) => perStep.get(key)).filter(Boolean);
  const widest = ordered.reduce(
    (most, one) => Math.max(most, one.people.size),
    0,
  );

  return ordered.map((one, position) => {
    const before = position > 0 ? ordered[position - 1].people.size : null;
    const reached = one.people.size;
    return {
      key: one.key,
      label: one.label,
      blurb: one.blurb,
      reached,
      views: one.views,
      // Share of the widest step rather than of the first: on a funnel this
      // short, one person who bookmarked a later screen and skipped the top
      // would otherwise push a bar past 100 percent.
      share: widest ? reached / widest : 0,
      lost: before === null ? null : Math.max(before - reached, 0),
      lostShare: before ? Math.max(before - reached, 0) / before : null,
      medianMs: median(one.dwell),
      meanMs: mean(one.dwell),
    };
  });
}

/**
 * How far each person got, and where they are now. One row per account.
 *
 * @param {Array<{user_id: string, kind: string, step: string | null, path: string | null, at: string}>} rows
 */
export function perPerson(rows) {
  const people = new Map();
  for (const row of rows) {
    if (!row.user_id) continue;
    let one = people.get(row.user_id);
    if (!one) {
      one = {
        userId: row.user_id,
        furthest: null,
        lastPath: null,
        lastAt: null,
        views: 0,
      };
      people.set(row.user_id, one);
    }
    if (row.kind === "page") {
      one.views += 1;
      if (!one.lastAt || row.at > one.lastAt) {
        one.lastAt = row.at;
        one.lastPath = row.path;
      }
      if (row.step) {
        const rank = STEP_ORDER.indexOf(row.step);
        const held = one.furthest ? STEP_ORDER.indexOf(one.furthest) : -1;
        if (rank > held) one.furthest = row.step;
      }
    }
  }
  return [...people.values()];
}

/**
 * The interview, question by question. Rows of kind `step` carry the question's
 * own slot name, which is the only way to tell which question somebody stalled
 * on: the path never changes while they answer ten of them.
 *
 * @param {Array<{user_id: string, kind: string, step: string | null, ms: number | null, meta: object | null}>} rows
 */
export function questionDwell(rows) {
  const perSlot = new Map();
  for (const row of rows) {
    if (row.kind !== "step" || !row.step) continue;
    if (!row.step.startsWith("interview:")) continue;
    const slot = row.step.slice("interview:".length);
    let one = perSlot.get(slot);
    if (!one) {
      one = { slot, people: new Set(), dwell: [], backs: 0 };
      perSlot.set(slot, one);
    }
    if (row.user_id) one.people.add(row.user_id);
    if (Number.isFinite(row.ms) && row.ms > 500) one.dwell.push(row.ms);
    if (row.meta?.went === "back") one.backs += 1;
  }

  return [...perSlot.values()]
    .map((one) => ({
      slot: one.slot,
      people: one.people.size,
      answers: one.dwell.length,
      backs: one.backs,
      medianMs: median(one.dwell),
      meanMs: mean(one.dwell),
    }))
    .sort((a, b) => (b.medianMs || 0) - (a.medianMs || 0));
}

/** Milliseconds as something a person reads at a glance. */
export function saidPlainly(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
