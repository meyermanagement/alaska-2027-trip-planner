// What is true of a person rather than of a trip: the phone in their pocket, the
// equipment they travel with, and the languages they speak.
//
// These three arrived together because they change the same thing — the advice.
// A roaming tip that does not know the carrier is a link to a comparison table.
// A tip about a park day that does not know a stroller is coming is a tip about a
// park day. And "download a translation app" is worth nothing next to "nobody
// going speaks Papiamentu, and Google Translate's Papiamentu pack has to be
// downloaded before you lose the signal."
//
// So the facts live on the person, and this file is the one place that decides
// what they are called, how they are cleaned, and how they are read out loud.
// Both the model briefs and Aly's own context call it, so a phone described one
// way on the Family tab is described the same way in every prompt.
//
// Pure: rows in, strings and arrays out. No database, no clock.

/**
 * The equipment worth knowing about, in the order it is shown.
 *
 * A closed list rather than free text, because a rule has to be able to ask
 * "is a wheelchair coming?" and get a reliable answer. Anything that does not
 * fit goes in the notes beside it, which the model reads and the rules do not.
 */
export const MOBILITY_AIDS = [
  { value: "stroller", label: "Stroller", plural: "strollers" },
  { value: "wheelchair", label: "Wheelchair", plural: "wheelchairs" },
  {
    value: "mobility_scooter",
    label: "Mobility scooter",
    plural: "mobility scooters",
  },
  { value: "walker", label: "Walker or cane", plural: "walkers or canes" },
  { value: "hearing_aid", label: "Hearing aid", plural: "hearing aids" },
  {
    value: "service_animal",
    label: "Service animal",
    plural: "service animals",
  },
  { value: "cpap", label: "CPAP machine", plural: "CPAP machines" },
];

const AID_BY_VALUE = new Map(MOBILITY_AIDS.map((a) => [a.value, a]));

/** Just the stored values, for a tool schema's enum. */
export const MOBILITY_AID_VALUES = MOBILITY_AIDS.map((a) => a.value);

/** The label for one stored value, or the raw value if it is not one of ours. */
export function aidLabel(value) {
  return AID_BY_VALUE.get(value)?.label || String(value || "");
}

/** The same, lower case, for the middle of a sentence. */
export function aidPhrase(value) {
  const label = aidLabel(value);
  // Proper nouns keep their capitals; CPAP is not "a cpap machine".
  return /^CPAP/.test(label) ? label : label.toLowerCase();
}

/**
 * How somebody describes themselves.
 *
 * Free text in the database and a short list in the form, which is deliberate.
 * A check constraint here would be this app deciding what a person is allowed to
 * be, and it has no business doing that -- so the list below is an offer, an
 * unrecognized term is kept exactly as it was typed, and nothing is ever
 * rewritten into a category to make it fit.
 *
 * "Prefer not to say" earns its place as a stored value rather than being left
 * blank. Blank means nobody has got round to it and is worth asking about once;
 * undisclosed means somebody answered, and asking again would be rude.
 *
 * This is not what a passport says. Travel documents carry their own sex field,
 * printed as F, M or X by whoever issued them, and it does not always match --
 * so nothing here is ever used to fill in paperwork.
 */
export const GENDERS = [
  { value: "female", label: "Female", phrase: "female" },
  { value: "male", label: "Male", phrase: "male" },
  { value: "nonbinary", label: "Non-binary", phrase: "non-binary" },
  {
    value: "undisclosed",
    label: "Prefer not to say",
    phrase: "gender not disclosed",
  },
];

/** Just the stored values, for a tool schema and for the form. */
export const GENDER_VALUES = GENDERS.map((g) => g.value);

const GENDER_BY_VALUE = new Map(GENDERS.map((g) => [g.value, g]));

// The ways people and models actually write these, mapped onto the four stored
// values. Everything else survives as typed.
const GENDER_ALIASES = new Map([
  ["f", "female"],
  ["female", "female"],
  ["woman", "female"],
  ["women", "female"],
  ["girl", "female"],
  ["she", "female"],
  ["m", "male"],
  ["male", "male"],
  ["man", "male"],
  ["men", "male"],
  ["boy", "male"],
  ["he", "male"],
  ["nb", "nonbinary"],
  ["enby", "nonbinary"],
  ["nonbinary", "nonbinary"],
  ["nonbinarie", "nonbinary"],
  ["genderqueer", "nonbinary"],
  ["undisclosed", "undisclosed"],
  ["prefernottosay", "undisclosed"],
  ["prefernotto", "undisclosed"],
  ["private", "undisclosed"],
  ["declined", "undisclosed"],
  ["unspecified", "undisclosed"],
]);

/**
 * One stored value, or the term as it was given.
 *
 * Matching ignores spaces, hyphens and case, so "Non-Binary", "non binary" and
 * "nonbinary" are one value rather than three. A term that is not ours comes back
 * trimmed and capped and otherwise untouched.
 */
export function normalizeGender(raw) {
  const text = String(raw == null ? "" : raw)
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const key = text.toLowerCase().replace(/[^a-z]/g, "");
  const known = GENDER_ALIASES.get(key);
  if (known) return known;
  return text.slice(0, 40);
}

/** What it is called on screen. A term of somebody's own is shown as they wrote it. */
export function genderLabel(value) {
  if (!value) return "";
  return GENDER_BY_VALUE.get(value)?.label || String(value);
}

/**
 * The one line a packing prompt gets, or nothing at all.
 *
 * Deliberately narrow. It says who recorded what, tells the model to use it only
 * where it changes an actual item, and says plainly that anybody missing from the
 * line is not to be guessed at -- which is the failure this is guarding against,
 * since a model handed four names and two genders will happily invent the other
 * two from the names.
 */
export function genderLines(travelers) {
  const said = (travelers || [])
    .filter((t) => t && t.is_person !== false && t.gender)
    .map((t) => {
      const name = String(t.name || "").trim();
      const value = normalizeGender(t.gender);
      if (!name || !value || value === "undisclosed") return null;
      return `${name} ${genderPhrase(value)}`;
    })
    .filter(Boolean);
  if (!said.length) return [];
  return [
    `GENDER, WHERE SOMEBODY RECORDED IT: ${said.join("; ")}. Use this only where it decides an actual item, and never assume it for anybody who is not on this line.`,
  ];
}

/** The same, for the middle of a sentence a model is going to read. */
export function genderPhrase(value) {
  if (!value) return "";
  const known = GENDER_BY_VALUE.get(value);
  if (known) return known.phrase;
  // Somebody's own word for themselves. Left cased as they typed it, because
  // lower-casing a term is a small way of correcting it.
  return String(value);
}

/**
 * Only the values this app knows, in the canonical order, without repeats.
 * Anything unrecognized is dropped rather than stored, because a rule that
 * tested for "wheel chair" would quietly never fire.
 */
export function cleanAids(list) {
  // A string is accepted because Aly sometimes sends one piece of equipment as a
  // bare word rather than a list of one.
  const given = Array.isArray(list)
    ? list
    : typeof list === "string"
      ? list.split(/[,;]/)
      : [];
  const asked = new Set(
    given
      .map((v) =>
        String(v || "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_"),
      )
      .filter(Boolean),
  );
  return MOBILITY_AIDS.filter((a) => asked.has(a.value)).map((a) => a.value);
}

/** Whether anyone on this list travels with a particular piece of equipment. */
export function whoHasAid(travelers, value) {
  return (travelers || [])
    .filter(
      (t) =>
        t &&
        t.is_person !== false &&
        Array.isArray(t.mobility_aids) &&
        t.mobility_aids.includes(value),
    )
    .map((t) => String(t.name || "").trim())
    .filter(Boolean);
}

/**
 * Languages, from whatever the form or the model handed over.
 *
 * People type them separated by commas, by "and", or on separate lines, and they
 * type "spanish" as often as "Spanish". Stored one to an entry, capitalized, so
 * two people who speak the same language match.
 */
export function parseLanguages(value) {
  const raw = Array.isArray(value) ? value.join(",") : String(value || "");
  const out = [];
  for (const part of raw.split(/[,;\n/]|\band\b/i)) {
    const word = part.trim().replace(/\s+/g, " ");
    if (!word || word.length > 40) continue;
    const named = word
      .split(" ")
      .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ");
    if (!out.some((k) => k.toLowerCase() === named.toLowerCase()))
      out.push(named);
    if (out.length >= 8) break;
  }
  return out;
}

/** Back into one line, for a text field the person types in. */
export function languageField(list) {
  return (Array.isArray(list) ? list : []).join(", ");
}

/** Every language anyone on this list speaks, once each. */
export function languagesAcross(travelers) {
  const out = [];
  for (const t of travelers || []) {
    if (!t || t.is_person === false) continue;
    for (const lang of Array.isArray(t.languages) ? t.languages : []) {
      const named = String(lang || "").trim();
      if (named && !out.some((k) => k.toLowerCase() === named.toLowerCase()))
        out.push(named);
    }
  }
  return out;
}

/** Whether the family already has one of these languages covered. */
export function speaksAny(travelers, languages) {
  const held = languagesAcross(travelers).map((l) => l.toLowerCase());
  return (languages || []).some((l) =>
    held.includes(
      String(l || "")
        .trim()
        .toLowerCase(),
    ),
  );
}

/** Who speaks a given language, by name. */
export function whoSpeaks(travelers, language) {
  const want = String(language || "")
    .trim()
    .toLowerCase();
  if (!want) return [];
  return (travelers || [])
    .filter(
      (t) =>
        t &&
        t.is_person !== false &&
        (Array.isArray(t.languages) ? t.languages : []).some(
          (l) =>
            String(l || "")
              .trim()
              .toLowerCase() === want,
        ),
    )
    .map((t) => String(t.name || "").trim())
    .filter(Boolean);
}

/** The carriers on this trip, each with the people who are on it. */
export function carrierGroups(travelers) {
  const groups = new Map();
  for (const t of travelers || []) {
    if (!t || t.is_person === false) continue;
    const carrier = String(t.phone_carrier || "").trim();
    if (!carrier) continue;
    const key = carrier.toLowerCase();
    if (!groups.has(key)) groups.set(key, { carrier, who: [], devices: [] });
    const row = groups.get(key);
    const name = String(t.name || "").trim();
    if (name) row.who.push(name);
    const device = String(t.phone_device || "").trim();
    if (device && !row.devices.includes(device)) row.devices.push(device);
  }
  return [...groups.values()];
}

/**
 * One person, in a sentence, or null when there is nothing on file.
 *
 * Written as prose rather than as fields because everything that reads it is a
 * language model, and "Veda — Verizon on an iPhone 13; travels with a stroller;
 * speaks English and Spanish" costs fewer tokens and is misread less often than
 * the same facts as JSON.
 */
export function profileSentence(person) {
  if (!person) return null;
  const name = String(person.name || "").trim();
  if (!name || person.is_person === false) return null;

  const bits = [];
  // First, because it is the plainest fact here and the one most likely to be
  // relevant to something as ordinary as what to pack or who shares a room.
  const gender = genderPhrase(normalizeGender(person.gender));
  if (gender) bits.push(gender);
  const carrier = String(person.phone_carrier || "").trim();
  const device = String(person.phone_device || "").trim();
  if (carrier && device) bits.push(`${carrier} on ${device}`);
  else if (carrier) bits.push(`on ${carrier}`);
  else if (device) bits.push(`carries ${device}`);

  const aids = cleanAids(person.mobility_aids);
  if (aids.length) bits.push(`travels with ${listOf(aids.map(aidPhrase))}`);
  const access = String(person.accessibility_notes || "").trim();
  if (access) bits.push(access.replace(/\s+/g, " ").slice(0, 200));

  const langs = (
    Array.isArray(person.languages) ? person.languages : []
  ).filter(Boolean);
  if (langs.length) bits.push(`speaks ${listOf(langs)}`);

  if (!bits.length) return null;
  return `${name} — ${bits.join("; ")}`;
}

function listOf(values) {
  const list = (values || []).map((v) => String(v).trim()).filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/**
 * The block of lines a prompt gets, or an empty array when nobody has filled any
 * of this in. Empty rather than a row of "not recorded" lines: a model told
 * three times that nothing is known starts inventing, and a model told nothing
 * asks.
 */
export function profileLines(travelers, heading) {
  const rows = (travelers || []).map(profileSentence).filter(Boolean);
  if (!rows.length) return [];
  return [
    heading ||
      "WHAT IS TRUE OF THE PEOPLE THEMSELVES \u2014 how they describe themselves, their phones, the equipment they travel with, and what they speak. Use these to make advice specific, and never guess at the ones that are missing. Gender here is what somebody recorded about themselves and is for advice only: a passport carries its own sex field, so never use this to fill in paperwork or to assume what a document says:",
    ...rows.map((row) => `- ${row}`),
  ];
}

// ---------------------------------------------------------------------------
// About Me
// ---------------------------------------------------------------------------
//
// Everything above is a fact somebody recorded. This is the one thing on file
// that the person wrote about themselves, and it is a different kind of input:
// "I like sunsets, yoga, and relaxing" is not a field, cannot be normalized, and
// is the difference between advice that fits this family and advice that would
// fit anyone. So it goes into a prompt as its own block, in the person's own
// words, rather than being folded into the semicolon list above where a paragraph
// would read as one more attribute.
//
// It is also the only thing here that works on day one. A new family has no
// bookings, no packing list and no ticked preferences, and every other input to a
// recommendation is empty. This one is answerable before they have booked
// anything.

/**
 * The examples the app shows.
 *
 * Four rather than two, and deliberately unlike each other: a nurse-photographer
 * who loves wide country, a recovering drinker who reads Russian novels and
 * follows F1, a family whose kids are into marine biology and dinosaurs, and a
 * retired architect making the trip her late husband didn't get to. Shown
 * together they say "there is no right answer here" better than any instruction
 * would.
 *
 * Each is longer than it strictly needs to be, on purpose. The first version of
 * this shipped with two short examples, and short examples read as a ceiling --
 * somebody copying their shape writes one sentence and stops. These reach
 * further, so between them they name the things people turn out to have and
 * would never have thought to mention: what they do for work, hobbies that
 * follow them on a trip, what they read or watch, landscapes and subjects that
 * pull at them, faith and language and heritage, health that changes how a day
 * works, and the personal reason this particular trip matters. On purpose,
 * these examples do not spend words on pace, food style, early or late starts,
 * or budget split -- those live in the interview and asking again here trains
 * people to say the same thing twice.
 */
export const ABOUT_ME_EXAMPLES = [
  "I run five days a week and I plan a lot of trips around finding somewhere new to run \u2014 a river path, a park loop, a beach at sunrise. I fish in the summer, I ski in the winter, and I am slowly working my way through every Broadway show my wife has ever wanted to see. History nerd, especially the American Civil War, and I will drive an hour out of the way for a battlefield or a good used bookshop. Cities are fine but I'd rather end a day somewhere I can see the stars. Please, no cruises.",
  "I'm a landscape photographer in my spare time and a nurse the rest of it. Give me a mountain, a coast, or a desert and I'm happy \u2014 cities I can take or leave. I read a lot of natural history and I know embarrassingly much about birds. I grew up on a farm in Iowa, so wide-open country still feels like home. My wife and I are trying to see one national park a year with the kids while they still want to come with us.",
  "I've been sober six years and that shapes more of travel than you'd think \u2014 I'd rather find the best coffee in town than the best bar, and I love a place with a great morning scene. I read Russian novels, I follow F1 more closely than is dignified, and I've been slowly working my way through the world's Frank Lloyd Wright houses. I speak passable Spanish and I always try to learn a few words of wherever I'm going. My daughter is thirteen and starting to have opinions of her own; I want the trips we take now to be ones she remembers.",
  "We travel as a family of four \u2014 two adults, a nine-year-old who is obsessed with marine biology, and a six-year-old who is obsessed with dinosaurs. That drives a lot of our choices: aquariums, tide pools, natural history museums, anywhere we can see something the kids have read about. I'm Jewish and we like to be somewhere we can find a shul on a Friday night when it works out, though we don't build the trip around it. I have celiac, which is real and not a preference. My husband is a chef, so food is a whole thing for us.",
  "I'm retired now \u2014 spent thirty years as an architect \u2014 and I finally have the time to see the buildings I only ever read about. Kahn, Aalto, Barrag\u00e1n, Scarpa. I sing in a choir, I'm a lifelong Cardinals fan, and I've been keeping a travel journal since 1987. My knees are not what they were, so long stairs and cobblestones are worth flagging. My husband died two years ago and this is the first trip I'm taking with the kids since then, so it means more than a normal one.",
];

/**
 * The things worth mentioning about yourself, offered as small pill hints beside
 * the box. Not fields and not a form: a checklist gets ticked and a paragraph
 * gets written, and the paragraph is the thing that is actually useful to read.
 *
 * Rewritten to lead with taste rather than career. The first version opened with
 * "what you do for work" and everything downstream read like a resume. Now the
 * pills are example-loaded -- each one names three or four specific things a
 * person can react to (Broadway, jazz, jogging, fishing, Civil War) rather than
 * an empty category ("hobbies") that leaves the reader staring at a blank box.
 * Dislikes get their own pill on purpose: a family that hates cruises or hates
 * hot weather is as useful to Aly as one that loves them. Work moves to the end,
 * reworded so it does not read as the opening move. How you travel -- pace, food,
 * early or late, where to spend the money -- is asked by the interview.
 */
export const ABOUT_ME_PROMPTS = [
  "live things you go out for \u2014 Broadway, standup, symphony, a club show, sports in person",
  "a Saturday when nothing is planned \u2014 jogging, fishing, hiking, gardening, a long drive, a museum, a bookshop",
  "places that pull at you \u2014 mountains, coast, desert, small towns, big cities, farm country, islands",
  "subjects you read into for fun \u2014 history, architecture, natural history, true crime, food, science, a specific country",
  "sports you follow, sports you play \u2014 teams, leagues, the ones you'd change a trip to catch",
  "music you'd cross a city for \u2014 a band still touring, a festival, live jazz, opera, a specific venue",
  "food that would make a trip \u2014 a cuisine, a city known for one thing, a specific restaurant you've been meaning to hit",
  "faith, heritage, language \u2014 anything that makes a place feel like home or worth stopping at",
  "health and body \u2014 allergies, phobias, knees, altitude, seasickness, anything that changes a day",
  "the thing you'd never do on a trip \u2014 cruises, buffets, group tours, hot weather, long flights, all-inclusives",
  "the best trip you ever took, and what made it that",
  "what you do when you have to, and what you'd rather be doing",
];

/**
 * The four short prompts that make up the About-you screen.
 *
 * These are the only entry points now. The old freeform textarea was honest but
 * hard \u2014 people stared at nine rows and wrote two sentences. The four prompts
 * each ask for two or three sentences, which is what people actually give, and
 * on save they concatenate into the same about_me column so nothing downstream
 * changes. Aly still reads one block of text before every answer; the block is
 * just written in four bites instead of one paragraph.
 *
 * The order matters. Love first \u2014 taste before anything else. Into now second,
 * because a current fascination is more useful for planning than a lifelong
 * preference. Skip third, because dislikes are constraints Aly weighs early.
 * Else last, as a catch-all for work, health, heritage, family, phobias, and
 * the reason this trip matters.
 */
export const ABOUT_ME_MICRO_PROMPTS = [
  {
    key: "love",
    label: "What you love to do",
    placeholder:
      "Hobbies, sports, live shows, things you go out of your way for. Broadway with my wife, jogging at sunrise, fishing in the summer, a used bookshop I have not been to.",
  },
  {
    key: "into",
    label: "What you're into right now",
    placeholder:
      "A book, a subject, a place, a team, whatever's on your mind this month. The Civil War, the Cardinals, a country I want to see, a documentary that got under my skin.",
  },
  {
    key: "skip",
    label: "What you'd rather skip",
    placeholder:
      "The kind of trip or the kind of day that is not for you. No cruises. Not a group tour. Hot weather is a hard sell. Nothing that starts before seven.",
  },
  {
    key: "else",
    label: "Anything else worth knowing",
    placeholder:
      "Work, health, heritage, language, family, why this trip matters. What you do when you have to. A milestone or reason this trip is happening.",
  },
];

/**
 * The four prompts, stitched back into one paragraph for storage.
 *
 * Aly reads about_me as one block of text, so the four boxes serialize with
 * their labels inline. The label plus colon prefix is on purpose \u2014 it tells
 * a model that "cruises" under "What you'd rather skip:" is a constraint, not a
 * preference, and it keeps the paragraph readable if somebody opens the row in
 * Supabase. Blank sections are dropped so an unwritten box does not leave a
 * dangling heading.
 */
export function aboutMeFromParts(parts) {
  return ABOUT_ME_MICRO_PROMPTS.map((p) => {
    const val = String((parts && parts[p.key]) || "").trim();
    if (!val) return null;
    return `${p.label}: ${val}`;
  })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Tap-to-append chip drawer. Each group is a heading and a list of specifics.
 *
 * The reason this exists: on a phone, nobody types a paragraph even with
 * dictation. A tap that turns into "I like Broadway" in the main box is the
 * difference between an empty About-you and a specific one. Chips are not
 * exhaustive on purpose \u2014 they are conversation starters, so the reader thinks
 * "oh yes, jazz, not classical" and edits the appended line into their own
 * words. Dislikes are their own group with a different prefix ("I'd rather skip
 * X") so Aly reads them as constraints, not preferences.
 */
export const ABOUT_ME_CHIP_GROUPS = [
  {
    key: "live",
    label: "Live shows and outings",
    prefix: "I like",
    target: "love",
    items: [
      "Broadway",
      "live music",
      "live jazz",
      "classical",
      "opera",
      "standup comedy",
      "the symphony",
      "a good club show",
      "sports in person",
      "minor-league baseball",
      "college football",
    ],
  },
  {
    key: "outdoors",
    label: "Outdoors and hobbies",
    prefix: "I like",
    target: "love",
    items: [
      "jogging",
      "hiking",
      "long walks",
      "biking",
      "fishing",
      "birding",
      "hunting",
      "skiing",
      "snowboarding",
      "surfing",
      "kayaking",
      "sailing",
      "gardening",
      "cooking",
      "baking",
      "woodworking",
      "photography",
      "sketching",
    ],
  },
  {
    key: "subjects",
    label: "Subjects you read into",
    prefix: "I'm into",
    target: "into",
    items: [
      "history",
      "Civil War history",
      "World War II history",
      "architecture",
      "art museums",
      "natural history",
      "aquariums",
      "national parks",
      "astronomy",
      "religion",
      "true crime",
      "a country's food",
      "a country's language",
    ],
  },
  {
    key: "places",
    label: "Places that pull at you",
    prefix: "I love",
    target: "into",
    items: [
      "mountains",
      "the coast",
      "the desert",
      "small towns",
      "big cities",
      "farm country",
      "islands",
      "lakes",
      "rivers",
      "forests",
      "a place with dark skies",
    ],
  },
  {
    key: "sports",
    label: "Sports and teams",
    prefix: "I follow",
    target: "into",
    // Filled at render time. The first few are the family's home teams, picked
    // from the home address on the families row; the rest are general sports
    // categories to round out the drawer for somebody in a metro with no pro
    // team, or somebody who does not care about their local one. Do not read
    // this list directly -- use buildSportsChipItems(homeLat, homeLon) from
    // lib/travelers/sports so the local teams land at the top.
    items: [],
  },
  {
    key: "skip",
    label: "Things you'd rather skip",
    prefix: "I'd rather skip",
    target: "skip",
    items: [
      "cruises",
      "buffets",
      "group tours",
      "all-inclusives",
      "hot weather",
      "long flights",
      "red-eyes",
      "early mornings",
      "crowded places",
      "chain restaurants",
      "resort pools",
      "casinos",
    ],
  },
];

/** What sits in an empty box. Grey, so it must not look like an answer already given. */
export const ABOUT_ME_PLACEHOLDER =
  "Write it the way you'd say it to a friend planning the trip for you. What you love to do (Broadway, jogging, fishing, live jazz, a good used bookshop), what pulls at you (mountains, small towns, the Civil War, the Cardinals), and what you'd rather skip (cruises, buffets, hot weather). A paragraph is plenty.";

/**
 * Set by "Skip for now" on the About You screen, and read by the Trips page to
 * decide whether to send somebody there.
 *
 * Deliberately given no max age, which makes it last as long as the browser
 * session: somebody who is not in the mood to write a paragraph is not asked
 * twice in one sitting, and is not permanently opted out of the one question that
 * makes every recommendation specific to them. Saving settles it for good --
 * there is something in the column after that, so the question stops being asked.
 */
export const ABOUT_SKIP_COOKIE = "alyeska_about_skipped";

/** How much of one person's paragraph a prompt will carry. */
export const ABOUT_MAX = 1200;

/** One person's own words, tidied but not rewritten. */
export function aboutSentence(person) {
  if (!person || person.is_person === false) return null;
  const name = String(person.name || "").trim();
  const said = String(person.about_me || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || !said) return null;
  return `${name}: ${said.slice(0, ABOUT_MAX)}`;
}

/**
 * The About Me block a prompt gets, or nothing at all when nobody has written
 * one.
 *
 * The instruction attached to it matters as much as the words. Left unlabelled, a
 * model reads "I do like the occasional extreme sport" as a request to book a
 * zip line, and reads a stated love of reading as a reason to recommend
 * bookshops in a city they are visiting for one evening. What it is is taste: the
 * thing to weigh when choosing between two honest recommendations, and the thing
 * to check a recommendation against before making it.
 */
export function aboutLines(travelers, options) {
  // Called with a bare string for years, and the tips brief still calls it with
  // nothing at all because it is already handed only the people going.
  const opts =
    typeof options === "string" ? { heading: options } : options || {};
  const { heading, going = null, tripName = null } = opts;
  const filtering = going instanceof Set && going.size > 0 && !!tripName;

  const rows = (travelers || [])
    .map((person) => {
      const sentence = aboutSentence(person);
      if (!sentence) return null;
      // Not dropped, marked. Dropping them would break the questions where you
      // want them -- which of two trips would suit Steph, or the Trips page with
      // no trip open at all -- and marking is what the saved preferences below
      // already do, so the two blocks now read the same way.
      const off = filtering && person?.id && !going.has(person.id);
      return off
        ? `${sentence} \u2014 NOT on ${tripName}, so do not shape a recommendation for ${tripName} around this`
        : sentence;
    })
    .filter(Boolean);
  if (!rows.length) return [];

  const scoped = filtering
    ? ` Only some of these people are on ${tripName}: weigh the ones who are, and ignore a paragraph marked NOT on ${tripName} unless the question is explicitly about that person.`
    : "";

  return [
    heading ||
      `WHAT THEY SAY THEY ARE LIKE ON A TRIP, in their own words. This is the only thing here they wrote about themselves, so weigh it heavily when you are choosing between two good recommendations, and check any recommendation against it before you make it. It is taste rather than instruction: somebody who says they like the occasional zip line has not asked you to book one, and somebody who says they like to relax will not thank you for a packed day. Where it is silent, do not invent a preference \u2014 ask, or leave it alone.${scoped}`,
    ...rows.map((row) => `- ${row}`),
  ];
}
