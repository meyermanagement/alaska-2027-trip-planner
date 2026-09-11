// The limits question, and whose limit each one is.
//
// "Anything anybody can't do" used to be one paragraph filed against the whole
// household, which is how the assistant ended up reading "the household is
// allergic to peanuts" out of a sentence about one child. A limit almost always
// belongs to one person -- an allergy, a knee, a fear of heights -- and the
// difference matters at the point of use: a restaurant that has to be safe for
// Veda is a different search from one the whole family has to avoid, and a
// glass-floor observation deck is only ruled out for the person afraid of it.
//
// So the answer is a list of rows rather than a paragraph, and each row carries
// whose it is. household_facts holds one nullable traveler_id per row, which is
// exactly this shape: a person's id for one person's limit, null for something
// that holds for everybody. The rows go in one per limit so the constraint
// layer the assistant reads on every turn names the person out loud.
//
// Everything here is shared by the screen and the route on purpose. The client
// cleans rows so the panel and the ledger note agree; the route cleans them
// again against the family's own people, because a client can post any id it
// likes and a rule filed against a stranger is worse than no rule at all.

/** Longest a single limit may be. Long enough for a sentence with a caveat. */
export const MAX_LIMIT_LENGTH = 500;

/** Most limits one answer may carry, so a loop cannot fill the table. */
export const MAX_LIMITS = 12;

/**
 * Clean `rows` into the shape both the screen and the route store:
 * [{body, travelerId}] with the body trimmed and non-empty, and travelerId
 * either one of `people`'s ids or null for "everybody".
 *
 * `people` is a list of {id, name}. An id that is not on it is dropped to null
 * rather than kept: a limit that says it belongs to somebody who is not on this
 * family reads as a rule about a stranger, and filing it against the household
 * at least keeps it true.
 */
export function normalizeLimits(rows, people = []) {
  const known = new Set(
    (Array.isArray(people) ? people : []).map((p) => p?.id).filter(Boolean),
  );
  const cleaned = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const body = String(row?.body ?? "")
      .trim()
      .slice(0, MAX_LIMIT_LENGTH);
    if (!body) continue;
    const raw = String(row?.travelerId ?? "").trim();
    cleaned.push({ body, travelerId: known.has(raw) ? raw : null });
    if (cleaned.length >= MAX_LIMITS) break;
  }
  return cleaned;
}

/** The word for whose limit a row is, given the family's people. */
export function limitWho(row, people = []) {
  if (!row?.travelerId) return "Everyone";
  const person = (Array.isArray(people) ? people : []).find(
    (p) => p?.id === row.travelerId,
  );
  return person?.name || "Everyone";
}

/** One row as a phrase: "Veda: peanut allergy". */
export function limitClause(row, people = []) {
  return `${limitWho(row, people)}: ${row?.body || ""}`.trim();
}

/**
 * The whole answer as one sentence, for the ledger row and the running summary.
 * Semicolons rather than commas because the limits have commas of their own.
 */
export function limitsSentence(rows, people = []) {
  const clauses = (Array.isArray(rows) ? rows : [])
    .map((row) => limitClause(row, people))
    .filter(Boolean);
  return clauses.join("; ");
}
