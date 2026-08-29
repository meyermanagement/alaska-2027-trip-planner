/**
 * The household's name, worked out from the name of the person starting it.
 *
 * The name exists for one reason: the invite email. That message arrives
 * unsolicited, from a stranger's address, carrying a sign-in link — the exact
 * shape of a phishing attempt. "Mark added you to the Meyer Family trip planner"
 * reads as real in a way that "the family trip planner" does not, and it is
 * worth a column to buy that.
 *
 * What it is not worth is a question. Asking somebody what their household is
 * called before they have seen a single screen is a form standing between a
 * person and the thing they came for, in exchange for one line of one email.
 * So it is derived here and editable later.
 *
 * Deliberately dumb: last word plus "Family". A surname is the last word for
 * most of the people who will type one, and the ones it gets wrong can fix it on
 * the Family tab in about four seconds. A cleverer guess would be wrong in more
 * interesting ways and no easier to correct.
 */

/** Names that are a role rather than a person, so "The Family Family" cannot happen. */
const ALREADY_A_HOUSEHOLD =
  /\b(family|household|home|clan|crew|tribe|party)\b/i;

/**
 * @param {string} personName the founder's own name, however they typed it
 * @returns {string} a household name, never empty
 */
export function householdName(personName) {
  const clean = String(personName || "")
    // A pasted name can arrive with a title, a suffix, or doubled spaces.
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/\s*[,(].*$/, "")
    .trim();

  if (!clean) return "Family";

  // Somebody who typed "The Meyers" or "Meyer Household" has already named the
  // household. Taking their word for it beats appending to it.
  if (ALREADY_A_HOUSEHOLD.test(clean)) return clean;

  const words = clean.split(" ").filter(Boolean);
  const last = words[words.length - 1] || "";

  // A trailing suffix is not a surname. "Mark Meyer Jr." is the Meyer family.
  const SUFFIX = /^(jr|sr|ii|iii|iv|v|phd|md|esq)\.?$/i;
  const surname =
    SUFFIX.test(last) && words.length > 1 ? words[words.length - 2] : last;

  // A single initial is not a name to build on: "Mark M." is just the Mark
  // family, which is friendlier than "the M. family".
  const initial = /^[A-Za-z]\.?$/.test(surname);
  const base = initial && words.length > 1 ? words[0] : surname;

  const stripped = base.replace(/\.$/, "");
  if (!stripped) return "Family";

  return `${stripped} Family`;
}
