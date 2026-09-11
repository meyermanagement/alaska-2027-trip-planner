// The family a practice-mode request answers against: the one the person
// rehearsing typed, and nothing else.
//
// Practice mode exists so a new primary can walk the whole first-login
// sequence without writing anything to their real family. It used to ship a
// hard-coded family -- two grown-ups and a nine-year-old going to Reykjavik --
// as a stand-in for a rehearsal that had typed nothing. That family is gone.
// It was never useful: it showed the shape of a screen while answering
// somebody else's questions, and every time a real run left a field blank
// there was a stranger's answer sitting where the person expected their own.
//
// So the client carries a run of its own: the family name, home, people,
// animals, About-you paragraph, and interview answers a person typed while
// walking the practice chain. It travels as `standIn` on the request body. A
// rehearsal that has typed nothing answers against an empty family, and the
// screens say so, because "nothing recorded yet" is the honest state of a
// rehearsal nobody has filled in.
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

// There is deliberately no built-in family, and no list of practice trips.
// The practice chain is one continuous rehearsal of a brand-new family's
// first login, and a brand-new family has nothing: the trip builder is the
// screen after the chain ends. Stock content only ever let a rehearsal skip
// the question it was supposed to be rehearsing.

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
 * null when there is nothing usable at all, which resolves to an empty
 * family rather than to stock content.
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
 * Whatever the rehearsal typed, blanks included, and nothing else. A run with
 * a family but no interview answers gets no interview answers: it used to
 * borrow six from a built-in family, and a practice plan came back explaining
 * itself with slow mornings the person had never said. Borrowing one field
 * from a stranger is worse than leaving it blank, because a blank block says
 * "nothing recorded" where a borrowed one is presented as the person's own.
 *
 * `custom` says whether anything was typed at all, so a screen can tell a
 * person their run reached the prompt instead of leaving them to wonder.
 */
export function resolveStandIn(raw) {
  const given = sanitizeStandIn(raw);
  return {
    familyName: given?.familyName || "",
    home: given?.home || "",
    aboutMe: given?.aboutMe || "",
    people: given?.people || [],
    pets: given?.pets || [],
    prefs: given?.prefs || [],
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
 * The practice family in the shape a travelers read returns.
 *
 * The interview personalizes its reason chips from a context built out of the
 * travelers and pets tables -- who the children are, whether there is a
 * partner, what the animals are called. Practice has no rows to read, so this
 * hands the same builder the typed practice family instead, so the rehearsal
 * talks about that family rather than about the real one.
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

/** The practice animals in the shape a pets read returns. */
export function standInPetsRows(standIn) {
  return (standIn?.pets || []).map((pet, i) => ({
    id: `practice-pet-${i + 1}`,
    name: pet.name,
    species: pet.species || "other",
  }));
}
