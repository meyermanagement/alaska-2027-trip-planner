// Who a thing belongs to.
//
// One person, or the whole family. Nothing in between. A packing item marked
// "Steph & Veda" reads fine on a screen and behaves badly everywhere else: it is
// invisible when you filter to Steph, invisible when you filter to Veda, counted
// under a person who does not exist, and — because a base template copies its rows
// to every new trip verbatim — it propagates to every trip the family ever takes.
// One of those was on the base list and on all three trips before anybody noticed.
//
// So a name that reaches the database is either exactly one traveler this family
// has, or "Shared". Two names is a shared thing.

/** How the whole family is spelled, everywhere. */
export const SHARED = "Shared";

// The ways a person writes "both of them": an ampersand, the word and, a comma, a
// slash, a plus. Bounded so "Alexander" is not read as "Alex and er".
const MORE_THAN_ONE = /(&|\+|,|\/|\band\b)/i;

/**
 * Settle a written assignee on one traveler, or on the whole family.
 *
 * @param {unknown} value            what was typed, generated, or copied
 * @param {string[]} travelerNames   the names this family actually has
 * @returns {string} one of travelerNames, or "Shared"
 */
export function oneOrShared(value, travelerNames = []) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return SHARED;

  const names = (travelerNames || [])
    .map((n) => String(n || "").trim())
    .filter(Boolean);

  // An exact name wins outright, whatever else it may look like: a traveler
  // genuinely called "Mark & Sons" is theirs, not the family's.
  const exact = names.find((n) => n.toLowerCase() === text.toLowerCase());
  if (exact) return exact;

  if (text.toLowerCase() === SHARED.toLowerCase()) return SHARED;

  // Two people named is a shared thing. Picking the first of them, which is what
  // the old prefix match did, quietly dropped the second person.
  if (MORE_THAN_ONE.test(text)) return SHARED;

  // A shortened or lengthened single name — "Steph" for "Stephanie", or the other
  // way about — is still one person, and worth honoring.
  const near = names.find(
    (n) =>
      n.toLowerCase().startsWith(text.toLowerCase()) ||
      text.toLowerCase().startsWith(n.toLowerCase()),
  );
  return near || SHARED;
}
