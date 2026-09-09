// The stand-in family that practice-mode requests answer against, and the
// sanitizer that lets a rehearsal supply its own family instead.
//
// Practice mode exists so a new primary can walk the whole first-login
// sequence without writing anything to their real family. Until now every
// practice request answered against a hard-coded family -- two grown-ups
// and a nine-year-old Rivera going to Reykjavik -- which was fine for
// seeing the shape of a screen but useless for judging whether Aly's
// answers actually improve when *your* family's answers are the input.
//
// So the client may now carry a run of its own: the family name, home,
// people, animals, About-you paragraph, and interview answers a person
// typed while walking the practice chain. It travels as `standIn` on the
// request body and is merged over these defaults, so a half-finished run
// still produces a complete prompt.
//
// This module is imported by both route handlers and browser code, so it
// must stay free of React and of browser globals.
//
// Everything here is untrusted input. It arrives from a client that any
// signed-in primary can script, so each field is clamped and re-shaped
// rather than trusted. It is only ever interpolated into a model prompt
// for the caller's own rehearsal -- it is never written to the database
// and never read back by another family -- but the caps still matter, to
// keep a pasted novel from becoming the prompt and to keep the practice
// screens cheap.

export const PRACTICE_FAMILY_NAME = "the Rivera family";
export const PRACTICE_HOME = "St. Louis, MO";

export const PRACTICE_PEOPLE = [
  { name: "Alex", date_of_birth: "1985-06-01" },
  { name: "Sam", date_of_birth: "1987-03-14" },
  { name: "Riley", date_of_birth: "2016-08-20" },
];

export const PRACTICE_PETS = [];

export const PRACTICE_TRIPS = [
  {
    id: "demo-trip-reykjavik",
    name: "Reykjavik long weekend",
    destination: "Reykjavik, Iceland",
    start_date: null,
    end_date: null,
  },
  {
    id: "demo-trip-paris",
    name: "Paris in October",
    destination: "Paris, France",
    start_date: null,
    end_date: null,
  },
];

export const PRACTICE_PREFS = [
  { slot: "pace", body: "Slow mornings; one anchor thing per day." },
  { slot: "day_shape", body: "Late starts; dinner is the point of the day." },
  {
    slot: "doing_or_seeing",
    body: "Doing over seeing; walk more than we ride.",
  },
  {
    slot: "food",
    body: "Sit-down local places over reservations booked from home.",
  },
  {
    slot: "crowds",
    body: "Off-peak. Skip anything with a line longer than 15 minutes.",
  },
  {
    slot: "money",
    body: "Spend on food and a good hotel; save on activities.",
  },
];

const MAX_NAME = 80;
const MAX_HOME = 160;
const MAX_PEOPLE = 12;
const MAX_PETS = 12;
const MAX_PREFS = 40;
const MAX_PREF_BODY = 400;
const MAX_TRIPS = 6;
const MAX_ABOUT = 2000;

function str(value, cap) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, cap);
}

// Dates arrive as the yyyy-mm-dd a date input produces. Anything else is
// dropped rather than guessed at, because a half-parsed date would show up
// as a wrong age in the prompt and read as a bug in Aly's answer.
function isoDate(value) {
  const s = str(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * Reduce an untrusted practice run to the fields the prompts use. Returns
 * null when there is nothing usable, so callers can fall through to the
 * built-in stand-in family without a second check.
 */
export function sanitizeStandIn(raw) {
  if (!raw || typeof raw !== "object") return null;

  const familyName = str(raw.familyName, MAX_NAME);
  const home = str(raw.home, MAX_HOME);
  const aboutMe = str(raw.aboutMe, MAX_ABOUT);

  const people = Array.isArray(raw.people)
    ? raw.people
        .slice(0, MAX_PEOPLE)
        .map((p) => ({
          name: str(p?.name, MAX_NAME),
          date_of_birth: isoDate(p?.date_of_birth ?? p?.dob),
        }))
        .filter((p) => p.name)
    : [];

  const pets = Array.isArray(raw.pets)
    ? raw.pets
        .slice(0, MAX_PETS)
        .map((p) => ({
          name: str(p?.name, MAX_NAME),
          species: str(p?.species, MAX_NAME),
        }))
        .filter((p) => p.name)
    : [];

  const prefs = Array.isArray(raw.prefs)
    ? raw.prefs
        .slice(0, MAX_PREFS)
        .map((p) => ({
          slot: str(p?.slot, MAX_NAME),
          body: str(p?.body, MAX_PREF_BODY),
        }))
        .filter((p) => p.body)
    : [];

  const trips = Array.isArray(raw.trips)
    ? raw.trips
        .slice(0, MAX_TRIPS)
        .map((t, i) => ({
          id: str(t?.id, MAX_NAME) || `practice-trip-${i}`,
          name: str(t?.name, MAX_NAME),
          destination: str(t?.destination, MAX_NAME),
          start_date: isoDate(t?.start_date),
          end_date: isoDate(t?.end_date),
        }))
        .filter((t) => t.name || t.destination)
    : [];

  const anything =
    familyName ||
    home ||
    aboutMe ||
    people.length ||
    pets.length ||
    prefs.length ||
    trips.length;
  if (!anything) return null;

  return { familyName, home, aboutMe, people, pets, prefs, trips };
}

/**
 * Merge a sanitized run over the built-in stand-in, field by field. Merging
 * per field rather than all-or-nothing is what lets somebody who filled in
 * the welcome form but skipped the interview still get a proof screen with
 * their own family and the stand-in preferences, instead of an empty prompt.
 */
export function resolveStandIn(raw) {
  const given = sanitizeStandIn(raw);
  return {
    familyName: given?.familyName || PRACTICE_FAMILY_NAME,
    home: given?.home || PRACTICE_HOME,
    aboutMe: given?.aboutMe || "",
    people: given?.people?.length ? given.people : PRACTICE_PEOPLE,
    // An empty animals list is a real answer -- most families have none, and
    // the built-in stand-in has none either -- so it needs no fallback.
    pets: given?.pets?.length ? given.pets : PRACTICE_PETS,
    prefs: given?.prefs?.length ? given.prefs : PRACTICE_PREFS,
    trips: given?.trips?.length ? given.trips : PRACTICE_TRIPS,
    // True when the caller supplied anything at all, so a screen can say
    // whose answers it is working from rather than leaving a person to
    // wonder whether their run reached the prompt.
    custom: Boolean(given),
  };
}

export function ageFrom(dateOfBirth, now = new Date()) {
  if (!dateOfBirth) return null;
  const born = new Date(`${dateOfBirth}T12:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  if (
    now.getUTCMonth() < born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() &&
      now.getUTCDate() < born.getUTCDate())
  ) {
    age -= 1;
  }
  return age >= 0 && age < 130 ? age : null;
}

function personLabel(person) {
  const age = ageFrom(person.date_of_birth);
  return age === null ? person.name : `${person.name} (${age})`;
}

/** "the Rivera family (Alex, Sam, and Riley (9))" */
export function standInFamilyNames(standIn) {
  const labels = standIn.people.map(personLabel).filter(Boolean);
  if (!labels.length) return standIn.familyName;
  // Two names take a bare "and"; three or more take the serial comma. Without
  // the two-name case this produced "Mark (46), and Veda (12)", which reads
  // as a typo in the middle of a prompt Aly is about to answer from.
  const list =
    labels.length === 1
      ? labels[0]
      : labels.length === 2
        ? `${labels[0]} and ${labels[1]}`
        : `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
  return `${standIn.familyName} (${list})`;
}

export function standInPetsText(standIn) {
  if (!standIn.pets.length) return "(no pets)";
  return standIn.pets
    .map((p) => `${p.name} (${p.species || "pet"})`)
    .join(", ");
}

export function standInPrefsLines(standIn) {
  return standIn.prefs.map(
    (p) => `- ${p.slot ? `[${p.slot}] ` : ""}${p.body}`,
  );
}

export function standInTripsText(standIn) {
  return standIn.trips
    .map((t) => {
      const label = t.name || t.destination;
      const where = t.destination || "?";
      const when =
        t.start_date && t.end_date
          ? `${t.start_date} to ${t.end_date}`
          : "dates tentative";
      return `- ${label}: ${where}, ${when}`;
    })
    .join("\n");
}

/**
 * The "what you know about the family" block the proof screen compares
 * against a no-context answer. Kept here so the practice and real paths
 * format the same facts the same way.
 */
export function standInFamilyLines(standIn) {
  const lines = [];
  if (standIn.home) lines.push(`Home: ${standIn.home}`);
  if (standIn.people.length) {
    lines.push(`People: ${standIn.people.map(personLabel).join(", ")}`);
  }
  if (standIn.pets.length) {
    lines.push(`Pets: ${standInPetsText(standIn)}`);
  }
  if (standIn.aboutMe) {
    lines.push(`In the primary's own words: ${standIn.aboutMe}`);
  }
  return lines;
}
