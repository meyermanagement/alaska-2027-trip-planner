// What happens to each animal when the family travels.
//
// The interview used to have no question about this at all: the slot existed in
// the ledger, and the only way it ever got answered was Aly asking in a
// conversation. When the question moved onto the interview screen it could have
// been one household answer -- "the animals come" -- and that would have been
// wrong for most families with more than one animal. A dog rides along, the cat
// stays with a neighbor, and the horse is not going anywhere; a single pick
// forces two of those three to be a lie, and each one changes something
// different about a trip. So the answer is one row per animal, and the three
// plans are the three things the app can actually act on:
//
//   comes    The stay has to take animals, the drive has to stop for them, and
//            a day cannot run past feeding time.
//   home     Somebody has to be booked -- a sitter, a kennel, a neighbor --
//            and that booking is a task with a date, not a note.
//   depends  Neither, until the trip is known. Aly raises it while planning
//            rather than assuming, which is the honest reading of a family
//            who has done it both ways.
//
// The plan is stored as words, per animal, the same way every other interview
// answer is stored: "Cricket comes with us; Moose stays home." A column of
// codes would be a row Aly cannot read out loud, and these rows are read out
// loud -- they land in household_facts, which the trip prompt quotes verbatim.

/** The three plans, in the order they are offered. */
export const PET_PLANS = [
  {
    value: "comes",
    label: "Comes with us",
    detail: "Travels with the family. The stay and the days have to suit them.",
    // The third person phrase used inside a sentence about one animal.
    says: "comes with us",
  },
  {
    value: "home",
    label: "Stays home",
    detail: "Stays behind with a sitter, a kennel, or somebody at the house.",
    says: "stays home",
  },
  {
    value: "depends",
    label: "Depends on the trip",
    detail: "Sometimes one, sometimes the other. Ask me while planning.",
    says: "depends on the trip",
  },
];

export const PET_PLAN_VALUES = PET_PLANS.map((p) => p.value);

/** The plan record for a value, or null when the value isn't one of the three. */
export function planFor(value) {
  return PET_PLANS.find((p) => p.value === value) || null;
}

/** The label a plan shows on its button -- "Stays home". */
export function planLabel(value) {
  return planFor(value)?.label || "";
}

/**
 * The rows an answer is made of, cleaned against the animals actually on file.
 *
 * Names the family does not have are dropped rather than trusted, duplicates
 * collapse to the first, and a row with no plan is dropped -- which is what
 * makes a half-answered question read as unanswered instead of as "the cat has
 * no plan". Order follows `names`, not whatever order the client posted.
 *
 * @param rows [{name, plan}]
 * @param names the animals on this family, in the order they should be asked
 * @returns [{name, plan}] or [] when nothing usable was given
 */
export function normalizePetPlans(rows, names) {
  const known = (Array.isArray(names) ? names : []).filter(
    (n) => typeof n === "string" && n.trim(),
  );
  const byName = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const name = String(row?.name || "").trim();
    const plan = String(row?.plan || "").trim();
    if (!name || !PET_PLAN_VALUES.includes(plan)) continue;
    if (!known.some((n) => n.trim() === name)) continue;
    if (byName.has(name)) continue;
    byName.set(name, plan);
  }
  return known
    .map((n) => n.trim())
    .filter((n) => byName.has(n))
    .map((n) => ({ name: n, plan: byName.get(n) }));
}

/** True when every animal on file has a plan. */
export function everyAnimalAnswered(rows, names) {
  const known = (Array.isArray(names) ? names : []).filter(
    (n) => typeof n === "string" && n.trim(),
  );
  if (!known.length) return false;
  return normalizePetPlans(rows, known).length === known.length;
}

/**
 * The sentence a set of rows is stored as -- "Cricket comes with us; Moose
 * stays home." Semicolons rather than commas because an animal's name can
 * carry a comma of its own and the reader has to be able to tell where one
 * animal ends.
 *
 * Returns null when nothing is answered, so callers can treat the question as
 * unanswered rather than filing an empty claim.
 */
export function petsSentence(rows) {
  const clauses = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const name = String(row?.name || "").trim();
      const says = planFor(row?.plan)?.says;
      return name && says ? `${name} ${says}` : null;
    })
    .filter(Boolean);
  if (!clauses.length) return null;
  return `${clauses.join("; ")}.`;
}

/** One animal's own sentence, for the fact row that animal gets. */
export function petClause(row) {
  const name = String(row?.name || "").trim();
  const says = planFor(row?.plan)?.says;
  return name && says ? `${name} ${says}.` : null;
}

/**
 * The rows a stored sentence came from.
 *
 * Read back when the primary returns to an answered question, so the animals
 * arrive with their plans already chosen rather than blank. Anything the
 * sentence says about an animal the family no longer has is dropped by
 * normalizePetPlans, which every caller runs on the result.
 */
export function parsePetsNote(note) {
  const text = String(note || "").trim();
  if (!text) return [];
  const out = [];
  for (const piece of text.replace(/\.$/, "").split(";")) {
    const clause = piece.trim();
    if (!clause) continue;
    const plan = PET_PLANS.find((p) =>
      clause.toLowerCase().endsWith(p.says.toLowerCase()),
    );
    if (!plan) continue;
    const name = clause.slice(0, clause.length - plan.says.length).trim();
    if (!name) continue;
    out.push({ name, plan: plan.value });
  }
  return out;
}

/**
 * How the household reads as a whole -- used by the running summary, which
 * promises something different depending on whether anything is coming along,
 * anything is being left, or the answer is "it depends".
 */
export function petsShape(rows) {
  const plans = (Array.isArray(rows) ? rows : []).map((r) => r?.plan);
  return {
    coming: plans.filter((p) => p === "comes").length,
    home: plans.filter((p) => p === "home").length,
    depends: plans.filter((p) => p === "depends").length,
  };
}

/** The names on the rows with a given plan, in order. */
export function namesWithPlan(rows, plan) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r?.plan === plan && String(r?.name || "").trim())
    .map((r) => String(r.name).trim());
}
