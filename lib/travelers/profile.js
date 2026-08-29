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
      "WHAT IS TRUE OF THE PEOPLE THEMSELVES — their phones, the equipment they travel with, and what they speak. Use these to make advice specific, and never guess at the ones that are missing:",
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
 * The two examples the app shows, verbatim from what the family asked for.
 *
 * They are deliberately opposite: one person wants a beach and a book, the other
 * wants to have seen something new by dinner. Shown together, they say "there is
 * no right answer here" better than any instruction would, and they show the
 * length that is actually useful -- a few sentences, not three words.
 */
export const ABOUT_ME_EXAMPLES = [
  "I like sunsets, yoga, and relaxing. I'm OK with the occasional adventure but most of the time I just like to hang out and relax on trips, especially at a beach. I'm a big reader but also like a fun night out.",
  "I love adventure, the great outdoors. I'm an avid photographer. I'm not one to really sit around on vacation. I want to be out seeing things. I do like to do the occasional extreme sport like zip lining or scuba diving. The most important thing for me is to see something new that I've never seen before.",
];

/** What sits in an empty box. Grey text, so it must not be mistaken for an answer. */
export const ABOUT_ME_PLACEHOLDER = ABOUT_ME_EXAMPLES[0];

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
export function aboutLines(travelers, heading) {
  const rows = (travelers || []).map(aboutSentence).filter(Boolean);
  if (!rows.length) return [];
  return [
    heading ||
      "WHAT THEY SAY THEY ARE LIKE ON A TRIP, in their own words. This is the only thing here they wrote about themselves, so weigh it heavily when you are choosing between two good recommendations, and check any recommendation against it before you make it. It is taste rather than instruction: somebody who says they like the occasional zip line has not asked you to book one, and somebody who says they like to relax will not thank you for a packed day. Where it is silent, do not invent a preference — ask, or leave it alone:",
    ...rows.map((row) => `- ${row}`),
  ];
}
