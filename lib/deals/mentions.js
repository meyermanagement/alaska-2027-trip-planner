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
import { placeMatches } from "./verdict";
import { readableFareText } from "./newsletter";

/** Codes from a Destinations list when the email has one, so a departure city
 * the family happens to have on their bucket list is not reported as a place the
 * alert was about. */
function destinationCodes(clean) {
  const section = clean.match(
    /(?:^|\n)\s*Destinations\s*\n([\s\S]*?)(?=\n\s*How to Book\b|\n\s*Booking Options\b|$)/i,
  );
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
export function namedSomeday(text, someday = []) {
  const clean = readableFareText(text);
  const rows = (someday || []).filter(
    (row) => row && row.status === "open" && row.watch !== false,
  );
  const found = new Map();
  for (const code of destinationCodes(clean)) {
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
      });
    }
  }
  return [...found.values()];
}
