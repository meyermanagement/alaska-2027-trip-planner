// Rewrite the family interview's reason chips using real names from the
// traveler file, so a family that has already written down who they are does
// not see chips that talk about "the kids" and "we" like Aly is reading from
// a stock questionnaire, and so a household of one is not asked to agree with
// a sentence about "we".
//
// The reason chips (each option on each question ships six of them) are
// authored in a plain family voice: "The kids do better when they are busy
// than when they are waiting." A family whose children are Veda and Chase
// should see "Veda and Chase do better when they are busy than when they are
// waiting" -- same sentence, their names in it. A solo primary with no
// kids and no partner should not see either "the kids" or "we" at all.
//
// Ages come from the shared helper rather than a second copy of the arithmetic,
// so a birthday this file cannot read is a birthday no screen in the app can
// read either, and the two can never drift into disagreeing about who is a
// child.
import { ageOn } from "./ages";

// This file is a pure text rewrite. It never invents facts; it swaps tokens
// the reason chip already uses for the words the family has already given
// the app. If the family shape is unknown or ambiguous, the chip is returned
// unchanged -- the original wording is honest for an unspecified family.
//
// Which is why hasKids and hasPartner below are three states and not two. False
// is a claim: it deletes child-only options off the question and strikes out
// every chip that mentions children. It has to be earned from birthdays that
// are actually on file, not inferred from their absence.

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
 * @returns {{kidNames: string[], adultNames: string[], unknownNames: string[], petNames: string[], hasKids: boolean|null, hasPartner: boolean|null, hasPets: boolean, solo: boolean, primaryName: string|null}}
 */
export function personalizationContext({ travelers, pets, todayISO } = {}) {
  const today = todayISO || new Date().toISOString().slice(0, 10);

  const people = (travelers || []).filter(
    (t) => t && t.is_person !== false && t.name,
  );

  // Three buckets, not two. A birthday is optional everywhere it is collected
  // -- the welcome form, the Family tab, and the practice family all accept a
  // person without one -- so "no birthday on file" is a common state and not an
  // edge case.
  //
  // This used to file those people under adults, on the reasoning that a child's
  // birthday usually gets captured because a booking form asks for it. It does
  // not hold. A household that has entered one parent and one child and skipped
  // the birthdays was read as two adults: no name ever appeared in a chip, the
  // plural voice was kept for a household that might be one person, and every
  // option marked needsKids was left standing for a family whose children the
  // app had decided did not exist. Worse, a household of one adult who never
  // entered their own birthday was read as one adult and so still counted as
  // solo, which is right by accident rather than by reasoning.
  //
  // An unknown age is now unknown. It is the same call ages.js already makes,
  // where a missing birthday produces null and the model is told not to guess.
  const kidNames = [];
  const adultNames = [];
  const unknownNames = [];
  for (const p of people) {
    const age = ageOn(p.date_of_birth, today);
    if (typeof age !== "number") unknownNames.push(p.name);
    else if (age < 18) kidNames.push(p.name);
    else adultNames.push(p.name);
  }

  const primary =
    people.find((p) => (p.access_level || "").toLowerCase() === "primary") ||
    null;

  const petNames = (pets || []).filter((p) => p && p.name).map((p) => p.name);

  // Not every missing birthday is ambiguous. The primary is the person filling
  // the interview in, so their own missing birthday says nothing about whether
  // this household has children -- it is the other rows that could turn out to
  // be a nine-year-old. And a file holding one person cannot be hiding a child
  // in it at all, whoever's birthday is absent.
  //
  // Narrowing it this way is what keeps the fix from overcorrecting: a household
  // of one who never entered a birthday still gets the child wording dropped and
  // the child-only options removed, which is the whole reason those rules exist.
  const unknownOthers = unknownNames.filter((name) => name !== primary?.name);
  const ambiguous = unknownOthers.length > 0 && people.length >= 2;

  return {
    kidNames,
    adultNames,
    unknownNames,
    petNames,
    // Tri-state, and the two readers of it already test `=== false` rather than
    // falsiness, so null means "leave the child wording and the needsKids
    // options alone". Claiming a family has no children is the damaging guess:
    // it deletes options and rewrites sentences. Claiming we do not know costs
    // nothing but a chip in a stock voice.
    hasKids: kidNames.length > 0 ? true : ambiguous ? null : false,
    // Same three states, for the same reason. Two known adults is a partner;
    // one known adult beside somebody whose age nobody entered could be a
    // partner or could be a child, and neither answer is worth guessing.
    hasPartner: adultNames.length >= 2 ? true : ambiguous ? null : false,
    hasPets: petNames.length > 0,
    // One person on the file, whatever age they are or are not known to be. The
    // chips are written in a family voice, and a household of one reading "We
    // can rest when we get home" is being handed somebody else's sentence to
    // agree with. Mark reported it after entering a single person with no
    // children.
    //
    // Counting people rather than adults is what makes this survive a missing
    // birthday in both directions: a lone person with no birthday is still one
    // person, and a parent and child with no birthdays between them are still
    // two and no longer get "I" put in their mouth. An empty file is nobody,
    // which is not a household of one either.
    solo: people.length === 1,
    primaryName: primary?.name || null,
  };
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
    // First-person plural, for a household of one. "We cook at least half our
    // dinners" becomes "I cook at least half my dinners": the same preference,
    // said by the person who is actually answering. Contractions and the
    // irregular verb are listed because "we are" cannot become "I are".
    //
    // Only for a household of one adult and no children. Two adults keep the
    // plural, because it is true.
    pattern:
      /\b(we're|we've|we'd|we'll|we are|we were|we|ourselves|ours|our|us)\b/gi,
    apply: (match, ctx) => {
      if (!ctx.solo) return match;
      const swap = SOLO_WORDS[match.toLowerCase()];
      return swap ? matchCase(match, swap) : match;
    },
  },
  {
    // "the grandparents" -- leave alone; we don't track grandparents.
  },
];

// Longest-first above, so "we are" is consumed before "we".
const SOLO_WORDS = {
  "we're": "I'm",
  "we've": "I've",
  "we'd": "I'd",
  "we'll": "I'll",
  "we are": "I am",
  "we were": "I was",
  we: "I",
  ourselves: "myself",
  ours: "mine",
  our: "my",
  us: "me",
};

// A chip that talks about children, for a household that has none. There is no
// honest rewrite of "A kids' club the kids like" for a household without
// children, so the chip is dropped rather than reworded: a reason nobody can
// agree with is a tap that teaches the app nothing.
const CHILD_WORDS = /\b(kids?|kids'|children|child|toddler|baby|babies)\b/i;

export function mentionsChildren(text) {
  return typeof text === "string" && CHILD_WORDS.test(text);
}

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
// one call, and drop the ones a household without children cannot answer.
// Returns a fresh array; the input is not mutated.
export function personalizeReasons(reasons, ctx) {
  if (!Array.isArray(reasons)) return reasons;
  const kept =
    ctx && ctx.hasKids === false
      ? reasons.filter((r) => !mentionsChildren(r))
      : reasons;
  return kept.map((r) => personalizeReason(r, ctx));
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
