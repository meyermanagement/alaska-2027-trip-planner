// A bucket-list place, written out as the sentence the trip builder starts from.
//
// The two screens were not connected, and the gap between them was the whole
// point of keeping a bucket list: somebody writes down Kyoto, the months that
// work, why they want to go and who it is for, and then the day they decide to
// actually do it they open the trip builder and type "Kyoto" into an empty box.
// Everything they had already said stayed on the other screen.
//
// So this turns the row into a paragraph in the first person, because that is
// what the builder reads. It is not a summary and it is not sent anywhere on its
// own: it lands in the box as editable text, the seven things light up against
// it, and the family adds whatever the bucket-list row never had room for
// before anything is said to Aly.

import { cleanMonths, MONTHS_FULL } from "@/lib/someday/months";

/** "March", "March or April", "March, April or May". */
function monthsPhrase(months) {
  const set = cleanMonths(months);
  if (!set.length || set.length === 12) return "";
  const names = set.map((month) => MONTHS_FULL[month - 1]);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

// Spelled out up to twelve, because this is prose and "6 nights" in the middle of
// a paragraph reads like a field that leaked into a sentence.
const SMALL = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
];

function nightsSaid(nights) {
  const count = Number(nights);
  if (!Number.isFinite(count) || count < 1) return "";
  return SMALL[count] || String(count);
}

/** "Mark", "Mark and Steph", "Mark, Steph and Veda". */
function namesPhrase(travelers = [], ids = []) {
  const names = travelers
    .filter((person) => (ids || []).includes(person.id))
    .map((person) => person.name)
    .filter(Boolean);
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The paragraph a place becomes.
 *
 * Each fact gets its own short sentence rather than being packed into one long
 * one, for two reasons: a person editing this has to be able to delete the bit
 * that is no longer true without unpicking a clause, and the reader that lights
 * up the seven things looks for phrases like "we want to" and "in September",
 * which survive a sentence and get lost in a list.
 *
 * The nights and the fare ceiling are included when Aly has written them, since
 * they answer two of the seven that a bucket-list row otherwise says nothing
 * about. Nothing is invented: a row with only a place name becomes one sentence.
 */
export function ideaFromPlace(place, travelers = []) {
  if (!place?.place) return "";
  const lines = [`I want to go to ${place.place}.`];

  const why = (place.why || "").trim();
  if (why) {
    // Carried across as the family's own words, untouched. An earlier version
    // tried to fold them into a sentence -- "we want to go because..." -- and
    // that only reads if the note happens to start with a verb: the bucket list
    // also holds "larch season, and a lake the kids can paddle", which no prefix
    // rescues. So the note is quoted after the question it answers, and only the
    // missing period is added.
    lines.push(
      `What we want to do there: ${/[.!?]$/.test(why) ? why : `${why}.`}`,
    );
  }

  const months = monthsPhrase(place.months);
  if (months) lines.push(`The months that work for us are ${months}.`);

  const nights = nightsSaid(place.nights);
  if (nights) lines.push(`We are thinking about ${nights} nights.`);

  if (place.fare_ceiling) {
    lines.push(
      `Flights are worth it to us under $${Number(place.fare_ceiling).toLocaleString("en-US")} each.`,
    );
  }

  const who = namesPhrase(travelers, place.traveler_ids);
  if (who) lines.push(`It would be ${who} going.`);

  // Said last, and only for the place at the top, because it is the one fact
  // here that is about the list rather than about the trip. Aly reads it as
  // "this matters", which is worth saying once and pointless five times.
  if (place.priority === 1) {
    lines.push("This one is top of our bucket list.");
  }

  return lines.join(" ");
}
