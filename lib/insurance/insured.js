/**
 * Printed names on a policy, matched against the family's people.
 *
 * A certificate names who it covers the way the insurer's system prints it --
 * "MEYER/MARK A", "Stephanie R Meyer", sometimes just "MARK" -- and the app
 * needs traveler ids, because a coverage gap is only findable when the policy
 * and the roster are talking about the same people.
 *
 * This lived twice: once on the server, in the route that files an emailed
 * policy, and once in the inbox screen that pre-ticks the review sheet. Now
 * three callers need it -- the uploaded-certificate reader is the third -- and
 * three copies of a fuzzy matcher is three different answers to "does this
 * policy name Veda". So it lives here, and matching a name is one behaviour
 * with one place to fix it.
 *
 * Deliberately conservative. Two passes: the whole name in any word order, then
 * the first name alone. It will match "MEYER/MARK A" to Mark and it will match
 * a certificate that prints only first names, and it will match nobody at all
 * rather than guess when the document lists no names -- which is not the same
 * claim as "this policy covers nobody", and is why an empty result is left for
 * the caller to interpret rather than being turned into an assertion here.
 *
 * Animals are skipped. A policy does not insure the dog, and a certificate that
 * happens to print a word matching a pet's name should not tick the pet.
 */

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function printedLines(insuredNames) {
  return (Array.isArray(insuredNames) ? insuredNames : [])
    .map(norm)
    .filter(Boolean);
}

function hits(personName, line) {
  const words = personName.split(" ");
  const lineWords = line.split(" ");
  return (
    line === personName ||
    // "meyer mark a" contains both words of "mark meyer", in either order,
    // which is how insurer and airline formatting differ.
    words.every((word) => lineWords.includes(word)) ||
    lineWords.includes(words[0])
  );
}

/**
 * The traveler ids a policy's printed names point at.
 */
export function matchInsured(insuredNames, people) {
  return describeInsured(insuredNames, people).ids;
}

/**
 * The same match, with its working shown.
 *
 * A form that is about to tick three people owes the person reading it the
 * chance to see which printed name produced which tick, and to see the name the
 * policy carries that belongs to nobody in the family -- a grandparent on the
 * same certificate, or a middle name the roster spells differently. Silence
 * about an unmatched name is how somebody ends up believing a traveler is
 * covered because a policy mentioned somebody.
 */
export function describeInsured(insuredNames, people) {
  const lines = printedLines(insuredNames);
  const roster = (Array.isArray(people) ? people : []).filter(
    (person) => person?.is_person !== false,
  );
  if (!lines.length) return { ids: [], matched: [], unmatched: [], read: [] };

  const read = (Array.isArray(insuredNames) ? insuredNames : [])
    .map((n) => String(n || "").trim())
    .filter(Boolean);

  const matched = [];
  const claimed = new Set();
  for (const person of roster) {
    const name = norm(person.name);
    if (!name) continue;
    const line = lines.find((l) => hits(name, l));
    if (!line) continue;
    claimed.add(line);
    matched.push({ id: person.id, name: person.name, printed: line });
  }

  const unmatched = read.filter((name) => {
    const line = norm(name);
    return line && !claimed.has(line);
  });

  return { ids: matched.map((m) => m.id), matched, unmatched, read };
}
