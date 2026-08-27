// What the family's loyalty standing means for advice, and — the harder half —
// which trip it means anything on.
//
// A booking window is not one date. Disney Cruise Line opens shore excursions to
// Castaway Club members in waves by level before it opens them to everybody; a
// Walt Disney World resort guest gets a different Lightning Lane morning from a
// day guest; hotel and airline levels move check-in, upgrade and seat selection.
// So a tip that quotes the public number to somebody with status is not merely
// vague — it is late, in the direction that loses the excursion.
//
// The trap is the other way round. Castaway Club is a Disney program and nothing
// else, and this family also sails Holland America. Handing every standing to
// every trip invites exactly one mistake: a Silver Castaway Club wave date printed
// against a Holland America sailing, which is a confidently wrong date on a screen
// they trust.
//
// So each standing is matched to a trip before the model sees it, and the matching
// has to be as intuitive as a person reading the itinerary would be. Nobody writes
// "Holland America Line" on every line: they write "Board ms Nieuw Amsterdam", and
// "Flight WN 2813", and "Animal Kingdom Lodge", and sometimes "Springhill Suites
// by Marriot" with one t. So the match looks at:
//
//   - the operator's own words, anywhere in the lines it could apply to
//   - the properties, ships, sub-brands and airline codes that belong to it, from
//     the table below, because "Nieuw Amsterdam" only means Holland America if you
//     happen to know that
//   - one typo, on words long enough for that to be safe
//
// and it looks only at the lines of the matching kind: a hotel program is judged
// on the lodging lines, an airline program on the flights. That is what stops the
// Avis pickup address at a Holiday Inn from handing a Disney trip an IHG window.
//
// The four answers:
//
//   applies      — this operator is on this trip. Levels here may change dates.
//   anywhere     — credit cards, whose protections travel with the traveler
//                  rather than with the operator.
//   opportunity  — a level with a company this trip has not booked that sort of
//                  thing with yet. Worth weighing when choosing, never a date.
//   conflict     — a level in a kind this trip HAS booked, with somebody else.
//                  Never shown as a level, and named only to forbid it.
//
// Pure: rows in, strings out. No clock, no database, no model.

const clip = (value, max) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
};

const KINDS = {
  cruise: "cruise line",
  airline: "airline",
  hotel: "hotel",
  car: "car rental",
  credit_card: "credit card",
  rail: "rail",
  park: "parks",
  other: "",
};

// Which itinerary lines a program of each kind is judged on, and which lines count
// as having booked that sort of thing.
const KIND_CATEGORIES = {
  cruise: ["cruise"],
  airline: ["flight"],
  hotel: ["lodging"],
  car: ["transport"],
  rail: ["transport"],
  park: ["activity", "excursion", "dining"],
  other: ["activity", "excursion", "dining", "lodging", "transport", "cruise"],
};

// Words that appear in half the loyalty programs on earth and so identify none of
// them. "Silver" must be in here: matching a program to a trip because both
// contain the word "silver" is how Castaway Club would end up on a Holland America
// sailing, which is the whole thing this file exists to prevent. Guest categories
// live here too, so that "resort guest" reads as a category rather than a company.
const GENERIC = new Set([
  "club",
  "clubs",
  "rewards",
  "reward",
  "program",
  "programme",
  "member",
  "members",
  "membership",
  "elite",
  "plus",
  "gold",
  "silver",
  "bronze",
  "platinum",
  "pearl",
  "diamond",
  "titanium",
  "ambassador",
  "world",
  "worldwide",
  "card",
  "cards",
  "line",
  "lines",
  "cruise",
  "cruises",
  "cruising",
  "hotel",
  "hotels",
  "resort",
  "resorts",
  "inn",
  "inns",
  "suites",
  "lodge",
  "airline",
  "airlines",
  "airways",
  "flight",
  "flights",
  "rent",
  "rental",
  "rentals",
  "express",
  "society",
  "mileage",
  "miles",
  "points",
  "point",
  "circle",
  "presidents",
  "president",
  "preferred",
  "priority",
  "advantage",
  "honors",
  "voyager",
  "traveler",
  "travel",
  "group",
  "international",
  "national",
  "premier",
  "signature",
  "reserve",
  "business",
  "first",
  "class",
  "guest",
  "guests",
  "holder",
  "holders",
  "passholder",
  "annual",
  "resident",
  "senior",
  "military",
  "veteran",
  "star",
  "stars",
  "tier",
  "level",
  "status",
  "one",
  "two",
  "three",
  "and",
  "the",
  "for",
  "with",
]);

// The part of this file that cannot be worked out from first principles: which
// ships, properties, sub-brands and flight codes belong to which program. A person
// reading "Board ms Nieuw Amsterdam" knows it is Holland America. Nothing in the
// record says so, so it is written down here.
//
// `of` is matched against the program's own distinctive words, `names` against the
// itinerary lines of the matching kind, and `codes` against airline flight numbers
// like "WN 2813" or "American 131".
const FAMILIES = [
  {
    of: ["disney"],
    names: [
      "magic kingdom",
      "epcot",
      "animal kingdom",
      "hollywood studios",
      "disney springs",
      "castaway cay",
      "lookout cay",
      "riviera",
      "contemporary",
      "bay lake tower",
      "polynesian",
      "grand floridian",
      "wilderness lodge",
      "boardwalk",
      "caribbean beach",
      "art of animation",
      "pop century",
      "all-star",
      "saratoga springs",
      "old key west",
      "yacht club",
      "beach club",
      "coronado springs",
      "port orleans",
      "fort wilderness",
      "aulani",
      "vero beach",
      "hilton head island resort",
      "disney dream",
      "disney wish",
      "disney fantasy",
      "disney magic",
      "disney wonder",
      "disney treasure",
      "disney destiny",
      "disney adventure",
      "lightning lane",
      "genie+",
    ],
  },
  {
    of: ["holland", "mariner"],
    names: [
      "holland america",
      "nieuw amsterdam",
      "nieuw statendam",
      "koningsdam",
      "rotterdam",
      "zuiderdam",
      "oosterdam",
      "westerdam",
      "eurodam",
      "noordam",
      "volendam",
      "zaandam",
      "veendam",
    ],
  },
  {
    of: ["marriott", "bonvoy"],
    names: [
      "marriott",
      "springhill",
      "courtyard",
      "residence inn",
      "fairfield",
      "ac hotel",
      "aloft",
      "element",
      "westin",
      "sheraton",
      "ritz-carlton",
      "ritz carlton",
      "st. regis",
      "st regis",
      "moxy",
      "autograph",
      "méridien",
      "meridien",
      "renaissance",
      "gaylord",
      "towneplace",
      "four points",
      "tribute portfolio",
      "delta hotels",
      "protea",
      "edition",
    ],
  },
  {
    of: ["ihg"],
    names: [
      "holiday inn",
      "crowne plaza",
      "kimpton",
      "intercontinental",
      "staybridge",
      "candlewood",
      "hotel indigo",
      "even hotel",
      "avid hotel",
      "six senses",
      "vignette",
      "voco",
      "regent",
    ],
  },
  {
    of: ["hilton"],
    names: [
      "hilton",
      "hampton",
      "doubletree",
      "embassy suites",
      "waldorf",
      "conrad",
      "curio",
      "canopy",
      "tru by",
      "homewood",
      "home2",
      "tempo by",
      "motto",
      "signia",
    ],
  },
  {
    of: ["hyatt"],
    names: [
      "hyatt",
      "andaz",
      "thompson",
      "alila",
      "grand hyatt",
      "park hyatt",
      "hyatt place",
      "hyatt house",
      "miraval",
      "caption by",
    ],
  },
  {
    of: ["wyndham"],
    names: [
      "wyndham",
      "ramada",
      "days inn",
      "la quinta",
      "baymont",
      "microtel",
      "super 8",
      "travelodge",
      "howard johnson",
    ],
  },
  {
    of: ["choice"],
    names: [
      "comfort inn",
      "comfort suites",
      "quality inn",
      "sleep inn",
      "clarion",
      "cambria",
      "econo lodge",
      "rodeway",
      "mainstay",
    ],
  },
  {
    of: ["american", "aadvantage"],
    names: ["american airlines", "american eagle"],
    codes: ["aa", "american"],
  },
  {
    of: ["united", "mileageplus"],
    names: ["united airlines"],
    codes: ["ua", "united"],
  },
  {
    of: ["southwest", "rapid"],
    names: ["southwest"],
    codes: ["wn", "southwest"],
  },
  { of: ["delta", "skymiles"], names: ["delta air"], codes: ["dl", "delta"] },
  { of: ["jetblue", "trueblue"], names: ["jetblue"], codes: ["b6", "jetblue"] },
  {
    of: ["alaskaair", "mileageplan"],
    names: ["alaska airlines"],
    codes: ["as"],
  },
  { of: ["frontier"], names: ["frontier airlines"], codes: ["f9"] },
  { of: ["spirit"], names: ["spirit airlines"], codes: ["nk"] },
  { of: ["aircanada", "aeroplan"], names: ["air canada"], codes: ["ac"] },
  { of: ["lufthansa"], names: ["lufthansa"], codes: ["lh"] },
  { of: ["british"], names: ["british airways"], codes: ["ba"] },
  { of: ["avis"], names: ["avis"] },
  { of: ["hertz"], names: ["hertz", "thrifty", "dollar rent"] },
  { of: ["sixt"], names: ["sixt"] },
  {
    of: ["enterprise", "emerald"],
    names: ["enterprise rent", "national car", "alamo"],
  },
  { of: ["budget"], names: ["budget rent"] },
  {
    of: ["royal", "anchor"],
    names: [
      "royal caribbean",
      "of the seas",
      "icon of the seas",
      "perfect day",
      "coco cay",
    ],
  },
  {
    of: ["princess", "captains"],
    names: [
      "princess cruises",
      "princess cruise",
      "sky princess",
      "regal princess",
      "discovery princess",
    ],
  },
  { of: ["norwegian", "latitudes"], names: ["norwegian cruise", "ncl "] },
  {
    of: ["celebrity", "captainsclub"],
    names: ["celebrity cruises", "celebrity apex", "celebrity edge"],
  },
  {
    of: ["carnival", "vifp"],
    names: ["carnival cruise", "carnival ", "mardi gras"],
  },
  { of: ["viking"], names: ["viking ocean", "viking river", "viking sky"] },
  { of: ["cunard"], names: ["cunard", "queen mary 2", "queen anne"] },
  { of: ["amtrak"], names: ["amtrak", "coast starlight", "empire builder"] },
  {
    of: ["universal"],
    names: [
      "universal orlando",
      "islands of adventure",
      "epic universe",
      "cabana bay",
      "portofino bay",
    ],
  },
];

/** The words in a name that could only be that company. */
export function brandTokens(...names) {
  const out = new Set();
  for (const name of names) {
    for (const word of String(name || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)) {
      if (word.length < 4) continue;
      if (GENERIC.has(word)) continue;
      out.add(word);
    }
  }
  return [...out];
}

/** True when two words differ by at most one letter. Long words only. */
function nearlyEqual(a, b) {
  if (a === b) return true;
  if (a.length < 6 || b.length < 6) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  // One substitution, or one insertion, walked in a single pass.
  let i = 0;
  let j = 0;
  let slips = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++slips > 1) return false;
    if (a.length === b.length) {
      i++;
      j++;
    } else if (a.length > b.length) i++;
    else j++;
  }
  return slips + (a.length - i) + (b.length - j) <= 1;
}

/** Everything the lines of one kind say, lowercased. */
function textFor(itinerary, categories) {
  const want = new Set(categories);
  const bits = [];
  for (const row of (itinerary || []).slice(0, 150)) {
    const category = String(row?.category || "")
      .trim()
      .toLowerCase();
    if (want.size && !want.has(category)) continue;
    bits.push(
      row?.title,
      row?.location,
      row?.vendor,
      row?.notes,
      row?.detail,
      row?.confirmation_number,
    );
  }
  return bits
    .filter(Boolean)
    .map((b) => String(b).toLowerCase())
    .join(" | ");
}

// Transport covers a motorcoach, a ferry, a train and a hire car, and a booked
// motorcoach says nothing about whether the hire car is still to be chosen. So a
// car program is judged on the lines that are actually about a car.
const KIND_LOOKS_LIKE = {
  car: /\b(rent|rental|car|hire|suv|avis|hertz|sixt|budget|enterprise|alamo|thrifty|dollar|turo)\b/,
  rail: /\b(train|rail|railway|railroad|amtrak|via rail|eurostar|sleeper)\b/,
};

function rowText(row) {
  return [row?.title, row?.location, row?.notes, row?.vendor]
    .filter(Boolean)
    .map((b) => String(b).toLowerCase())
    .join(" | ");
}

function isBooked(row) {
  const status = String(row?.status || "").toLowerCase();
  return (
    Boolean(String(row?.confirmation_number || "").trim()) ||
    status === "booked" ||
    status === "confirmed" ||
    status === "paid"
  );
}

/**
 * For one kind of program: is that sort of thing settled on this trip?
 *
 * Three answers, and the middle one matters most. Settled means everything of that
 * sort is booked with somebody, so a level held elsewhere can only mislead. Open
 * means there is still something to choose, and a level is then worth knowing about
 * even though it is not a date. Absent means the trip has no lines of that sort at
 * all, which is also open — they may yet add one.
 */
function settledFor(itinerary, categories, kind) {
  const want = new Set(categories);
  const looks = KIND_LOOKS_LIKE[kind] || null;
  let booked = 0;
  let waiting = 0;
  for (const row of itinerary || []) {
    const category = String(row?.category || "")
      .trim()
      .toLowerCase();
    if (!want.has(category)) continue;
    if (looks && !looks.test(rowText(row))) continue;
    if (isBooked(row)) booked++;
    else waiting++;
  }
  return booked > 0 && waiting === 0;
}

/** The alias entries that belong to one program. */
function familiesFor(tokens) {
  return FAMILIES.filter((family) =>
    family.of.some((word) => tokens.some((token) => nearlyEqual(token, word))),
  );
}

/**
 * Is this operator on these lines?
 *
 * Three ways of saying yes, in order of how obvious they are: the company's own
 * name, a property or ship that belongs to it, or a flight code that is it.
 */
function namedIn(text, tokens, families) {
  if (!text) return false;
  const words = text.split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    if (text.includes(token)) return true;
    if (words.some((word) => nearlyEqual(word, token))) return true;
  }
  for (const family of families) {
    for (const name of family.names || []) {
      if (text.includes(name)) return true;
    }
    for (const code of family.codes || []) {
      // "WN 2813", "WN2813", "American 131" — a code only counts with a flight
      // number after it, so a stray word is not an airline.
      if (new RegExp(`\\b${code}\\s?\\d{1,4}\\b`).test(text)) return true;
    }
  }
  return false;
}

/**
 * Sort the family's standings by what they mean on one trip.
 *
 * @param {object} input
 * @param {Array} input.programs   rewards_programs rows
 * @param {object} input.trip
 * @param {Array} input.itinerary  that trip's items
 * @returns {{applies: Array, anywhere: Array, opportunity: Array, conflict: Array}}
 */
export function programsForTrip({
  programs = [],
  trip = null,
  itinerary = [],
}) {
  const out = { applies: [], anywhere: [], opportunity: [], conflict: [] };
  const cache = new Map();
  const textOf = (categories) => {
    const key = categories.join(",");
    if (!cache.has(key)) cache.set(key, textFor(itinerary, categories));
    return cache.get(key);
  };

  for (const row of (programs || []).slice(0, 40)) {
    if (!row || row.is_active === false) continue;
    if (!row.brand && !row.program_name) continue;

    const kind = String(row.kind || "")
      .trim()
      .toLowerCase();
    if (kind === "credit_card") {
      out.anywhere.push(row);
      continue;
    }

    const categories = KIND_CATEGORIES[kind] || KIND_CATEGORIES.other;
    const tokens = brandTokens(row.brand, row.program_name);
    const families = familiesFor(tokens);

    if (namedIn(textOf(categories), tokens, families)) {
      out.applies.push(row);
      continue;
    }

    // Not on the trip. Whether that is a missed chance or a trap depends on
    // whether there is anything of that sort left to choose.
    if (settledFor(itinerary, categories, kind)) out.conflict.push(row);
    else out.opportunity.push(row);
  }
  return out;
}

function nameOf(row) {
  return clip(row.brand || row.program_name, 70);
}

function whoOf(row, byId) {
  const who = row.traveler_id ? byId.get(row.traveler_id) : null;
  return who || "the whole family";
}

/**
 * One line per standing, in the shape the bucket deserves.
 *
 * A program with no level recorded is still said out loud, because "they belong
 * but have no status" is a real answer and stops the model inventing one.
 *
 * @param {Array} rows       rewards_programs rows from one bucket
 * @param {Array} travelers  for putting a name to a row that belongs to a person
 * @param {"applies"|"anywhere"|"opportunity"|"conflict"} bucket
 * @returns {string[]}
 */
export function memberLines(rows = [], travelers = [], bucket = "applies") {
  const byId = new Map((travelers || []).map((t) => [t.id, t.name]));
  return (rows || []).slice(0, 30).map((row) => {
    const kind = KINDS[String(row.kind || "").toLowerCase()] ?? "";
    const tier = clip(row.status_tier, 60);

    if (bucket === "conflict") {
      // Deliberately no level and no perks. The only reason this line exists is
      // to name the program and forbid it.
      return `- ${nameOf(row)}${kind ? ` (${kind})` : ""} — this trip's ${kind || "booking"} is with somebody else, so this program governs nothing here. Never use it for a date or an eligibility on this trip.`;
    }

    const bits = [nameOf(row)];
    if (kind) bits.push(kind);
    bits.push(tier ? `level: ${tier}` : "member, no level recorded");
    bits.push(whoOf(row, byId));
    const perks = clip(row.perks, 200);
    return `- ${bits.join(" | ")}${perks ? ` — ${perks}` : ""}`;
  });
}

/**
 * The standings section of a brief, sorted for one trip.
 *
 * @returns {string[]} lines, headings included
 */
export function memberSection({
  programs = [],
  travelers = [],
  trip = null,
  itinerary = [],
}) {
  const sorted = programsForTrip({ programs, trip, itinerary });
  const lines = [];

  lines.push(
    "THEIR LOYALTY STANDINGS, AND WHETHER THEY APPLY HERE. A level can change WHEN something may be booked, but only ever with the company that grants it:",
  );

  if (sorted.applies.length) {
    lines.push(
      "With companies on this trip's own itinerary — these levels may change dates here:",
    );
    lines.push(...memberLines(sorted.applies, travelers, "applies"));
  } else {
    lines.push(
      "With companies on this trip's own itinerary: none. Nothing they hold gives them status with anybody they have booked, so every window on this trip is the public one.",
    );
  }

  if (sorted.anywhere.length) {
    lines.push(
      "Cards they carry — protections and lounge access travel with them, but these grant no booking window with any operator:",
    );
    lines.push(...memberLines(sorted.anywhere, travelers, "anywhere"));
  }

  if (sorted.opportunity.length) {
    lines.push(
      "Held, and that sort of thing is not booked on this trip yet — worth weighing while they are still choosing, never a date:",
    );
    lines.push(...memberLines(sorted.opportunity, travelers, "opportunity"));
  }

  if (sorted.conflict.length) {
    lines.push("Held, but not with anybody on this trip — do not apply these:");
    lines.push(...memberLines(sorted.conflict, travelers, "conflict"));
  }

  return lines;
}

/**
 * The levels a researched window on this trip is allowed to cite.
 *
 * Used to check the answer rather than to shape the question: a model that has
 * been told Castaway Club does not apply to a Holland America sailing may still
 * write it down, and a date printed under the wrong company's level is worse than
 * no date. Anything citing a level that is not on this list keeps its date and
 * loses its claim about who it belongs to.
 */
export function allowedStatuses({
  programs = [],
  trip = null,
  itinerary = [],
}) {
  const sorted = programsForTrip({ programs, trip, itinerary });
  const out = [];
  for (const row of [...sorted.applies, ...sorted.anywhere]) {
    const tier = clip(row.status_tier, 60);
    if (!tier) continue;
    out.push({
      tier,
      tokens: [
        ...brandTokens(row.brand, row.program_name),
        ...brandTokens(tier),
      ],
    });
  }
  return out;
}

/**
 * Does this claimed level belong to a program that applies on this trip?
 *
 * Generous about wording — "Castaway Club Silver" and "Silver castaway club" are
 * the same thing — and strict about company, because the company is the part that
 * goes wrong. A claim with no distinctive word in it at all ("resort guest", "day
 * guest") is allowed through: it names a guest category rather than a program,
 * which is a thing an operator can perfectly well have.
 */
export function statusAllowed(claim, allowed = []) {
  const words = brandTokens(claim);
  if (!words.length) return true;
  return words.some((word) =>
    (allowed || []).some((row) =>
      row.tokens.some((token) => nearlyEqual(token, word)),
    ),
  );
}

/**
 * What to do with the standings, said once and reused in both prompts.
 *
 * About dates and eligibility rather than about perks. "You get a free drink" is
 * not a tip; "your level is why this can be booked eleven days earlier than the
 * page says" is the whole game.
 */
export const MEMBER_RULE = `Their loyalty standings are listed below, sorted by whether they apply to this trip. Treat them as facts about who this family is, not as a topic.

Where a level changes WHEN something can be done, the level's date is the only date worth giving them. Cruise lines open shore excursions, dining and activities to their loyalty members in waves by level; theme parks open ride reservations and dining differently to resort guests and to ticket holders; hotel and airline levels move check-in, upgrade and seat selection windows. Look up the wave or window for the exact level they hold and give them that day, and say which level it rests on.

A level is only ever worth anything with the company that grants it. A cruise line's loyalty level says nothing about a different cruise line, an airline's says nothing about another airline, and a hotel group's says nothing about an independent hotel. Only use a level from the ones listed as applying here. If this trip's operator is one they hold nothing with, they have no status there and the public window is their window — say so plainly rather than reaching for a level they hold somewhere else.

The sorting is done by matching names, so it can be wrong in one direction: if a line of the itinerary is plainly run by a company whose program is listed further down as not applying — a ship, a property, a sub-brand or a flight code you recognize as theirs — then it does apply, and you should use it and say why. Never the other way round: never promote a program because the trip merely looks like the sort of trip they would use it on.

Never invent a level, never assume a level is higher than what is recorded, and if you cannot verify what a level changes, say nothing about it rather than guessing a day.`;
