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
// request body, and a request that carries one answers against it alone --
// the defaults below are for a rehearsal that has typed nothing, never a
// filler for the parts of a real run that happen to be empty.
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

// There is deliberately no list of practice trips. The practice chain is one
// continuous rehearsal of a brand-new family's first login, and a brand-new
// family has no trips: the trip builder is the screen after the chain ends.
// A stand-in trip only ever let a rehearsal skip the question it was supposed
// to be rehearsing.

export const PRACTICE_PREFS = [
  { slot: "pace", body: "Slow mornings; one anchor thing per day." },
  {
    slot: "day_shape",
    // Two real hours, in the same words the band files, so a rehearsal that
    // reads this row back sees the shape a real answer takes.
    body: "When the day starts and ends: 9:30 am to midnight",
  },
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
 * null when there is nothing usable at all, which is the one case that falls
 * through to the built-in stand-in family.
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

  const anything =
    familyName ||
    home ||
    aboutMe ||
    people.length ||
    pets.length ||
    prefs.length;
  if (!anything) return null;

  return { familyName, home, aboutMe, people, pets, prefs };
}

/**
 * Resolve the family a practice request answers against.
 *
 * All or nothing, on purpose. This used to merge field by field, so a run
 * that had a family but no interview answers borrowed the built-in family's
 * six preferences -- and a practice plan came back explaining itself with
 * slow mornings the person had never said. Borrowing one field from a
 * stranger is worse than leaving it blank: a blank block says "nothing
 * recorded", where a borrowed one is presented as the person's own answer.
 *
 * So a rehearsal that has typed anything at all answers against exactly what
 * it typed, blanks included, and the built-in family is used only for a
 * rehearsal that has typed nothing.
 */
export function resolveStandIn(raw) {
  const given = sanitizeStandIn(raw);
  if (given) {
    return {
      familyName: given.familyName,
      home: given.home,
      aboutMe: given.aboutMe,
      people: given.people,
      pets: given.pets,
      prefs: given.prefs,
      // True when the caller supplied anything at all, so a screen can say
      // whose answers it is working from rather than leaving a person to
      // wonder whether their run reached the prompt.
      custom: true,
    };
  }
  return {
    familyName: PRACTICE_FAMILY_NAME,
    home: PRACTICE_HOME,
    aboutMe: "",
    people: PRACTICE_PEOPLE,
    pets: PRACTICE_PETS,
    prefs: PRACTICE_PREFS,
    custom: false,
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
  return standIn.prefs.map((p) => `- ${p.slot ? `[${p.slot}] ` : ""}${p.body}`);
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

/**
 * The stand-in family in the shape a travelers read returns.
 *
 * The interview personalizes its reason chips from a context built out of the
 * travelers and pets tables -- who the children are, whether there is a
 * partner, what the animals are called. Practice has no rows to read, so this
 * hands the same builder the stand-in family instead, and the rehearsal talks
 * about the practice family rather than about the real one.
 *
 * The first person is marked primary because that is what the welcome form
 * does with the first row it is given: the person filling it in is the one
 * with the login.
 */
export function standInTravelers(standIn) {
  return (standIn?.people || []).map((person, i) => ({
    id: `practice-person-${i + 1}`,
    name: person.name,
    is_person: true,
    date_of_birth: person.date_of_birth || null,
    access_level: i === 0 ? "primary" : "secondary",
  }));
}

/** The stand-in animals in the shape a pets read returns. */
export function standInPetsRows(standIn) {
  return (standIn?.pets || []).map((pet, i) => ({
    id: `practice-pet-${i + 1}`,
    name: pet.name,
    species: pet.species || "other",
  }));
}
