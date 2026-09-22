// Bucket-list places an alert names, for the alerts no fare came out of.
//
// A newsletter can price a hub and then list a dozen onward cities with no price
// against any of them. Nothing verifiable comes out of that, so the fare reader
// saves nothing -- correctly, since the email never says what Oslo costs. But the
// family wrote Norway down, and the email does say Oslo. This turns that into a
// line on the history card instead of silence.
//
// Reads only the airport codes the email itself prints. No price, no month and no
// route is claimed here; the point is to say which of their places were mentioned.
import airports from "./geography.json";
import { geographyScore } from "./geography";
import { monthCheck, placeMatches } from "./verdict";
import { monthsIn } from "./parse";
import { monthsSaid } from "@/lib/someday/months";
import { readableFareText } from "./newsletter";

/** Codes from a Destinations list when the email has one, so a departure city
 * the family happens to have on their bucket list is not reported as a place the
 * alert was about. */
function destinationCodes(clean, { sectionOnly = false } = {}) {
  const section = clean.match(
    /(?:^|\n)\s*Destinations\s*\n([\s\S]*?)(?=\n\s*How to Book\b|\n\s*Booking Options\b|$)/i,
  );
  // A card on the fares list says the alert is about this place, so it may only
  // read a list the email itself headed Destinations. Falling back to every code
  // in the body is fine for a history line that only reports a mention, but it
  // would have a Switzerland offer claiming to be about Montreal.
  if (!section && sectionOnly) return null;
  const text = section ? section[1] : clean;
  return [...new Set([...text.matchAll(/\(([A-Z]{3})\)/g)].map((match) => match[1]))]
    .filter((code) => airports[code]);
}

const cityOf = (code) => String(airports[code][0]).replace(/\s*\(.*$/, "").trim();

/**
 * Open bucket-list rows named in an email, each with the city that named it.
 * A country in the row's title counts; a continent does not, or every European
 * city would name every European wish.
 */
export function namedSomeday(text, someday = [], { sectionOnly = false } = {}) {
  const clean = readableFareText(text);
  const codes = destinationCodes(clean, { sectionOnly });
  if (!codes) return [];
  const rows = (someday || []).filter(
    (row) => row && row.status === "open" && row.watch !== false,
  );
  const found = new Map();
  for (const code of codes) {
    const city = cityOf(code);
    const said = `${city} ${code}`;
    for (const row of rows) {
      if (found.has(row.id)) continue;
      const hit =
        placeMatches(said, row.place) ||
        (row.region ? placeMatches(said, row.region) : false) ||
        geographyScore({ destination: city, destination_code: code }, row) >= 3;
      if (!hit) continue;
      found.set(row.id, {
        id: row.id,
        place: row.place,
        // The chip says the wish, and the city too when they are not the same
        // word, so "Norway" is not left looking like a guess.
        said: placeMatches(city, row.place) ? row.place : `${row.place} — ${city}`,
        // The city the email actually printed, for a card that wants to say the
        // wish and the wording apart from each other.
        city,
      });
    }
  }
  return [...found.values()];
}

/**
 * The months the alert says it can be flown in, read off its own availability
 * line the same way a priced fare from the same email would be. Nothing is
 * inferred: an email that names no season comes back empty, and an empty season
 * is not a date match.
 */
export function alertMonths(text) {
  const clean = readableFareText(text);
  const said =
    clean.match(/^.*Full availability:[^\n]+/im)?.[0] ||
    clean.match(/^\s*Best:[^\n]+/im)?.[0] ||
    "";
  return monthsIn(said);
}

/**
 * An alert that saved no fare but still matches a place and a season the family
 * wrote down -- which is the pair they judge a fare on when there is no price.
 *
 * Only places whose months the alert's season actually reaches come back. A wish
 * for Christmas markets is not answered by a summer offer, and saying so on the
 * fares list would be noise on the one screen that is meant to be answers.
 */
export function fittingMentions(text, someday = []) {
  const named = namedSomeday(text, someday, { sectionOnly: true });
  if (!named.length) return null;
  const months = alertMonths(text);
  if (!months.length) return null;
  const rows = new Map((someday || []).map((row) => [row.id, row]));
  const places = named.filter((hit) => {
    const verdict = monthCheck({ travel_months: months }, rows.get(hit.id))?.verdict;
    // "any" is a place with no months saved: every season suits it.
    return verdict === "fits" || verdict === "any";
  });
  if (!places.length) return null;
  return { places, months, monthsSaid: monthsSaid(months) };
}
