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

/**
 * The kinds that can get you something at a rental counter.
 *
 * Mark reported this one: asked to recommend a rental car, Aly never mentioned
 * that the family holds Hertz President's Circle, Avis President's Club and a
 * Sapphire Reserve, which between them are skip-the-counter, a free class up and
 * primary damage cover. Everything a program is worth on a car is decided at the
 * counter, so leaving it out is most of the answer missing.
 */
export const CAR_KINDS = new Set(["car", "credit_card"]);

/** Which of their programs could matter to a place of this kind. */
export function kindsFor(placeKind) {
  if (placeKind === "stay") return STAY_KINDS;
  if (placeKind === "car") return CAR_KINDS;
  // Somewhere to eat or something to do: no loyalty ladder of its own that the
  // Wallet knows about, but a card with a dining credit or a lounge still counts.
  return new Set(["credit_card", "dining"]);
}

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

// A card's own hotel channel, named the way the hotel industry names it and not
// the way the card is filed. "Fine Hotels + Resorts" is every word a stopword --
// fine, hotels, resorts -- so it used to reduce to nothing and the family's real
// Amex Platinum benefit was thrown away as an invented one. These are the phrases
// that stand for a card, matched against the whole claim before it is cut into
// words.
const CHANNELS = [
  [/fine hotels/i, ["american", "express"]],
  [/\bfhr\b/i, ["american", "express"]],
  [/hotel collection/i, ["american", "express"]],
  [/\bthe edit\b/i, ["chase", "sapphire"]],
  [/premier collection/i, ["capital", "one", "venture"]],
  [/lifestyle collection/i, ["capital", "one", "venture"]],
  [/luxury hotel/i, ["citi"]],
];

/** The words in a program name that actually name the program. */
export function brandTokens(name) {
  const whole = String(name || "");
  const words = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const out = new Set();
  for (const [pattern, tokens] of CHANNELS)
    if (pattern.test(whole)) for (const t of tokens) out.add(t);
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

/** The family's own programs that could matter to a place of this kind. */
export function programsOfKind(rewards = [], kinds = STAY_KINDS) {
  return (Array.isArray(rewards) ? rewards : [])
    .filter((r) => r && r.is_active !== false && kinds.has(r.kind))
    .map((r) => ({
      id: r.id || null,
      kind: r.kind,
      brand: String(r.brand || r.program_name || "").trim(),
      tier: r.status_tier ? String(r.status_tier).trim() : null,
      tokens: brandTokens(`${r.brand || ""} ${r.program_name || ""}`),
    }))
    .filter((p) => p.brand);
}

/** The family's own programs that could matter to a hotel, most useful first. */
export function stayPrograms(rewards = []) {
  return programsOfKind(rewards, STAY_KINDS);
}

/** The same, for a rental counter. */
export function carPrograms(rewards = []) {
  return programsOfKind(rewards, CAR_KINDS);
}

/**
 * The family's own program a claim is about, or null.
 *
 * One shared identifying word is enough, because the same program is written
 * five ways -- "Bonvoy", "Marriott Bonvoy Gold", "Marriott" -- and all five mean
 * the row that says Marriott Bonvoy. Being strict here would silently delete
 * real perks, which is the failure nobody would notice.
 */
export function ownedProgram(claim, rewards = [], kinds = STAY_KINDS) {
  const want = brandTokens(claim);
  if (!want.size) return null;
  for (const program of programsOfKind(rewards, kinds)) {
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
    if (!place || !place.program) {
      // A perk with no program named cannot be checked, so it does not run.
      return place?.perk ? { ...place, program: null, perk: null } : place;
    }
    // Any kind, not just a hotel. A card's dining credit is as real as a hotel
    // program's late checkout, and the check is the same check.
    const owned = ownedProgram(place.program, rewards, kindsFor(place.kind));
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
 * The sentence Aly is given about the family's car programs.
 *
 * Same job as the hotel one and the same reason: the answer has to be checked
 * against the rows rather than against her memory of them. A rental is where
 * status is worth the most and gets mentioned the least.
 */
export function carProgramsLine(rewards = []) {
  const programs = carPrograms(rewards);
  if (!programs.length) return "";
  const said = programs.map(programLabel).join("; ");
  return `Programs that could get them something on a rental car: ${said}. Asked about a rental car, driving, or how to get around somewhere they would drive, you must work through THIS list before you finish: which of these companies is at that airport or in that town, what the level they hold actually gets them there (skip the counter, a class up, a second driver free, a guaranteed car late at night), and which of their cards to put it on for damage cover and for the earning rate. Say when one of these is the reason to pick one company over another, and say plainly when none of them is any use where they are going -- a small island with two local agencies and no Hertz, say. Never name a company or a level that is not on this list.`;
}

/**
 * The sentence Aly is given about the family's hotel programs, so that a
 * shortlist is checked against the real list rather than her memory of it.
 */
export function stayProgramsLine(rewards = []) {
  const programs = stayPrograms(rewards);
  if (!programs.length) return "";
  const said = programs.map(programLabel).join("; ");
  return `Programs that could get them something at a hotel: ${said}. When you recommend somewhere to stay, name one of THESE in the place's program field if it genuinely applies, and say in perk what it gets them there. Never name a program that is not on this list -- a perk they cannot claim is worse than no perk. When NONE of them reaches a hotel you are recommending -- an independent resort with no chain behind it, which is most of the good ones -- say that in one line above the cards rather than saying nothing, because silence about the Wallet reads as never having looked. Check the cards before you conclude that: a card's own hotel channel (Fine Hotels + Resorts, The Edit, the Capital One Premier Collection) reaches plenty of independents that no hotel program does.`;
}
