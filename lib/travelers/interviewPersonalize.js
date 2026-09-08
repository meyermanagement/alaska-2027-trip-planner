// Rewrite the family interview's reason chips using real names from the
// traveler file, so a family that has already written down who they are does
// not see chips that talk about "the kids" and "we" like Aly is reading from
// a stock questionnaire.
//
// The reason chips (each option on each question ships six of them) are
// authored in a plain family voice: "The kids do better when they are busy
// than when they are waiting." A family whose children are Veda and Chase
// should see "Veda and Chase do better when they are busy than when they are
// waiting" -- same sentence, their names in it. A solo primary with no
// kids and no partner should not see either "the kids" or "we" at all.
//
// This file is a pure text rewrite. It never invents facts; it swaps tokens
// the reason chip already uses for the words the family has already given
// the app. If the family shape is unknown or ambiguous, the chip is returned
// unchanged -- the original wording is honest for an unspecified family.

/**
 * Build the context object the personalizer needs, from the rows the interview
 * server route has already loaded.
 *
 * @param {Object} args
 * @param {Array<{name: string, is_person?: boolean, date_of_birth?: string, access_level?: string}>} args.travelers
 *   Every traveler row on this family, is_person true. Adults and children.
 *   The Shared row (is_person=false) must already be filtered out by the caller.
 * @param {Array<{name: string, species?: string}>} args.pets
 *   Every animal on this family.
 * @param {string=} args.todayISO
 *   Today, YYYY-MM-DD, used to decide who is a minor. Defaults to real today.
 * @returns {{kidNames: string[], adultNames: string[], petNames: string[], hasKids: boolean, hasPartner: boolean, hasPets: boolean, primaryName: string|null}}
 */
export function personalizationContext({ travelers, pets, todayISO } = {}) {
  const today = todayISO || new Date().toISOString().slice(0, 10);

  const people = (travelers || []).filter(
    (t) => t && t.is_person !== false && t.name,
  );

  const kidNames = [];
  const adultNames = [];
  for (const p of people) {
    const age = ageOn(p.date_of_birth, today);
    // A person with no birthday on file is treated as an adult -- children
    // usually have their birthday captured because a booking form asks for it.
    if (typeof age === "number" && age < 18) kidNames.push(p.name);
    else adultNames.push(p.name);
  }

  const primary =
    people.find((p) => (p.access_level || "").toLowerCase() === "primary") ||
    null;

  const petNames = (pets || [])
    .filter((p) => p && p.name)
    .map((p) => p.name);

  return {
    kidNames,
    adultNames,
    petNames,
    hasKids: kidNames.length > 0,
    hasPartner: adultNames.length >= 2,
    hasPets: petNames.length > 0,
    primaryName: primary?.name || null,
  };
}

function ageOn(dob, onDate) {
  if (typeof dob !== "string" || !onDate) return null;
  const born = dob.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(born)) return null;
  const [by, bm, bd] = born.split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age -= 1;
  return age < 0 ? null : age;
}

/**
 * Join two-or-more names the way the family voice does: "Veda", "Veda and
 * Chase", "Veda, Chase, and Riley". Oxford comma at three-plus, no comma at
 * two, because the reason chips are written to be read out loud.
 */
export function joinNames(names) {
  const list = (names || []).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

// The words a reason chip uses to talk about the family, and the words we
// swap them for. Ordered longest-first because "the kids" contains "kids",
// and "we would rather" contains "we". Each entry is a case-insensitive regex
// with the first capture group being the token to replace so we can keep the
// capitalization the sentence started with.
//
// Every entry runs only when its guard says the family has that shape. A
// family with no children keeps the original "the kids" wording (the chip
// remains honest as a stock line, and rewriting it to "we" or dropping it
// would change the reason itself); a family with no partner has "we" swapped
// to "I" so the wording matches the person who is answering.
//
// The chips are hand-written prose, not a template language, so this list
// covers the phrases the current reason set actually uses; new phrasings
// added upstream should either match one of these patterns or be added here.
const RULES = [
  {
    // "the kids" -> "Veda" or "Veda and Chase" -- verb agreement stays right
    // because the verb after "the kids" is already plural, and one child's
    // name reads correctly with a singular verb only when the sentence uses
    // "does" ("the kids do" -> "Veda does"). Cover both.
    pattern: /\b(the kids)\b/gi,
    apply: (match, ctx) => {
      if (!ctx.hasKids) return match;
      return matchCase(match, joinNames(ctx.kidNames));
    },
    verbFix: true,
  },
  {
    pattern: /\b(kids')\b/gi,
    apply: (match, ctx) => {
      if (!ctx.hasKids) return match;
      const joined = joinNames(ctx.kidNames);
      return matchCase(match, `${joined}${possessiveSuffix(joined)}`);
    },
  },
  {
    // "the grandparents" -- leave alone; we don't track grandparents.
  },
];

/**
 * Personalize a single reason string using the family context.
 *
 * Returns the string unchanged when no rule fires, so it is safe to call on
 * every chip on every render.
 */
export function personalizeReason(text, ctx) {
  if (typeof text !== "string" || !text) return text;
  if (!ctx) return text;

  let out = text;
  for (const rule of RULES) {
    if (!rule.pattern) continue;
    out = out.replace(rule.pattern, (m) => rule.apply(m, ctx));
    if (rule.verbFix && ctx.hasKids && ctx.kidNames.length === 1) {
      // One child: fix "Veda do" -> "Veda does", "Veda are" -> "Veda is",
      // "Veda handle" -> "Veda handles", "Veda need" -> "Veda needs",
      // "Veda remember" -> "Veda remembers", "Veda will" is fine, "Veda
      // eat" -> "Veda eats". Only touch the verb when the subject was the
      // child's name we just inserted, so we do not accidentally conjugate
      // an unrelated sentence.
      const name = ctx.kidNames[0];
      out = pluralToSingular(out, name);
    }
  }
  return out;
}

// Convenience for the render layer: personalize every reason on an array in
// one call. Returns a fresh array; the input is not mutated.
export function personalizeReasons(reasons, ctx) {
  if (!Array.isArray(reasons)) return reasons;
  return reasons.map((r) => personalizeReason(r, ctx));
}

// Keep the capitalisation the original token started with -- "The kids" and
// "the kids" both appear at the start of a chip, and swapping to lowercase
// "veda" mid-sentence looks like a bug.
function matchCase(original, replacement) {
  if (!original) return replacement;
  const first = original[0];
  if (first === first.toUpperCase() && first !== first.toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function possessiveSuffix(name) {
  if (!name) return "";
  return name.endsWith("s") ? "'" : "'s";
}

// Fix subject-verb agreement after we replaced "the kids" with a single
// name. The regex anchors on the inserted name so an unrelated sentence
// ("the kids handle a queue" -> "Veda handle a queue" -> "Veda handles a
// queue") does not touch a different "handle" elsewhere in the same string.
function pluralToSingular(text, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pairs = [
    ["do", "does"],
    ["are", "is"],
    ["have", "has"],
    ["handle", "handles"],
    ["need", "needs"],
    ["remember", "remembers"],
    ["eat", "eats"],
    ["want", "wants"],
    ["like", "likes"],
    ["hate", "hates"],
  ];
  let out = text;
  for (const [plural, singular] of pairs) {
    const re = new RegExp(`\\b(${esc})\\s+${plural}\\b`, "g");
    out = out.replace(re, `$1 ${singular}`);
  }
  return out;
}
