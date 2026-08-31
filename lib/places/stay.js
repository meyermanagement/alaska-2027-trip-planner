// What a hotel recommendation has to say before it is worth reading.
//
// Two things are missing from a shortlist of hotels that nobody would leave out
// if they were doing it by hand. The first is what it costs on the family's own
// dates: "Vila Vita Parc, the good one on the Algarve coast" and "Vila Vita
// Parc, about €640 a night in early June" are different recommendations, and the
// second one can be turned down. A price band of $$$$ does not do it either --
// every hotel worth suggesting is $$$$, so the band separates nothing.
//
// The second is whether the family already gets something there. They hold World
// of Hyatt, IHG One Rewards at Platinum Elite and Marriott Bonvoy at Gold Elite,
// plus an Amex Platinum, a Venture X and a Sapphire Reserve, each with its own
// hotel booking channel. A suggestion that ignores all of that is advice for a
// stranger.
//
// The rule this module enforces is that a perk may only be claimed for a program
// the family is actually in. A model asked about hotels will happily offer Hilton
// Honors breakfast to somebody with no Hilton account, and a perk that turns out
// not to exist is worse than no perk line at all, because it was a reason to
// book. So every claimed program is checked against their own rows and dropped
// when it does not match one.

/** The kinds of program that can get you something at a hotel. */
export const STAY_KINDS = new Set(["hotel", "credit_card"]);

// Words that appear in program names without identifying the program. Without
// these, "IHG One Rewards" and "Wyndham Rewards" look like the same program, and
// "Fine Hotels + Resorts" matches any hotel program at all.
const NOT_THE_BRAND = new Set([
  "advantage",
  "and",
  "card",
  "cards",
  "club",
  "collection",
  "credit",
  "diamond",
  "elite",
  "fine",
  "gold",
  "hotel",
  "hotels",
  "member",
  "membership",
  "miles",
  "of",
  "one",
  "platinum",
  "plus",
  "points",
  "preferred",
  "premier",
  "program",
  "resorts",
  "reserve",
  "rewards",
  "silver",
  "status",
  "the",
  "tier",
  "titanium",
  "world",
]);

// The names people actually use, against the names on the rows. Somebody's card
// is filed as "American Express Platinum Card" and every sentence ever written
// about its hotel benefits says Amex, so without this the family's own Platinum
// perk is the one thing that gets thrown away.
const ALIASES = new Map([
  ["amex", ["american", "express"]],
  ["bonvoy", ["marriott"]],
  ["hyatt", ["hyatt"]],
  ["ihg", ["ihg"]],
  ["intercontinental", ["ihg"]],
  ["sapphire", ["chase", "sapphire"]],
  ["ultimate", ["chase"]],
  ["venture", ["capital", "one", "venture"]],
  ["capitalone", ["capital", "one", "venture"]],
]);

/** The words in a program name that actually name the program. */
export function brandTokens(name) {
  const words = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const out = new Set();
  for (const word of words) {
    const alias = ALIASES.get(word);
    if (alias) for (const a of alias) out.add(a);
    // "one" is generic on its own -- IHG One Rewards -- but it is half of
    // Capital One, which the alias above has already put in. So the stopword
    // check comes after the aliases rather than before them.
    if (!NOT_THE_BRAND.has(word)) out.add(word);
  }
  return out;
}

/** The family's own programs that could matter to a hotel, most useful first. */
export function stayPrograms(rewards = []) {
  return (Array.isArray(rewards) ? rewards : [])
    .filter((r) => r && r.is_active !== false && STAY_KINDS.has(r.kind))
    .map((r) => ({
      id: r.id || null,
      kind: r.kind,
      brand: String(r.brand || r.program_name || "").trim(),
      tier: r.status_tier ? String(r.status_tier).trim() : null,
      tokens: brandTokens(`${r.brand || ""} ${r.program_name || ""}`),
    }))
    .filter((p) => p.brand);
}

/**
 * The family's own program a claim is about, or null.
 *
 * One shared identifying word is enough, because the same program is written
 * five ways -- "Bonvoy", "Marriott Bonvoy Gold", "Marriott" -- and all five mean
 * the row that says Marriott Bonvoy. Being strict here would silently delete
 * real perks, which is the failure nobody would notice.
 */
export function ownedProgram(claim, rewards = []) {
  const want = brandTokens(claim);
  if (!want.size) return null;
  for (const program of stayPrograms(rewards)) {
    for (const word of want) if (program.tokens.has(word)) return program;
  }
  return null;
}

/**
 * How to say a program and its tier in front of somebody: "Marriott Bonvoy Gold
 * Elite" rather than a brand and a tier in two separate places.
 */
export function programLabel(program) {
  if (!program) return "";
  return [program.brand, program.tier].filter(Boolean).join(" ");
}

/**
 * The nightly average, as a line rather than a number.
 *
 * The dates are the whole point -- an average with no season attached is a
 * number somebody made up -- so a rate with no basis says that it is only a
 * guide rather than pretending to be an average of anything.
 */
export function nightlyLine(place) {
  const rate = String(place?.nightly || "").trim();
  if (!rate) return null;
  const basis = String(place?.nightlyBasis || "").trim();
  return basis ? `${rate} a night · ${basis}` : `${rate} a night · rough guide`;
}

/**
 * Whether a card is missing the one number the family asked for.
 *
 * Said out loud on the card rather than left blank. A hotel with no price is the
 * shape of the bug Mark reported, and a silent omission is how it comes back:
 * the requirement holds only if a card that fails it looks wrong.
 */
export function missingNightly(place) {
  return place?.kind === "stay" && !String(place?.nightly || "").trim();
}

/**
 * Every place, with any perk it claims either verified against the family's own
 * programs or removed.
 *
 * Keeps `perk` only when the program matches a row, and rewrites the program to
 * the family's own wording plus their tier, so the card says "Marriott Bonvoy
 * Gold Elite" using the tier they hold rather than whichever tier the model
 * happened to name.
 */
export function withPrograms(places = [], rewards = []) {
  return (Array.isArray(places) ? places : []).map((place) => {
    if (!place || place.kind !== "stay" || !place.program) {
      // A perk with no program named cannot be checked, so it does not run.
      return place?.perk ? { ...place, program: null, perk: null } : place;
    }
    const owned = ownedProgram(place.program, rewards);
    if (!owned) return { ...place, program: null, perk: null };
    return {
      ...place,
      program: programLabel(owned),
      programKind: owned.kind,
      perk: place.perk || null,
    };
  });
}

/**
 * The sentence Aly is given about the family's hotel programs, so that a
 * shortlist is checked against the real list rather than her memory of it.
 */
export function stayProgramsLine(rewards = []) {
  const programs = stayPrograms(rewards);
  if (!programs.length) return "";
  const said = programs.map(programLabel).join("; ");
  return `Programs that could get them something at a hotel: ${said}. When you recommend somewhere to stay, name one of THESE in the place's program field if it genuinely applies, and say in perk what it gets them there. Never name a program that is not on this list -- a perk they cannot claim is worse than no perk.`;
}
