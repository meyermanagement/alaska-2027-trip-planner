// Public-domain OurAirports snapshot; rebuild with scripts/build-fare-geography.py.
// Geographic relevance is not proof of event dates, transfers or availability.
import airports from "./geography.json";

const continents = {
  EU: ["europe", "european"],
  AS: ["asia", "asian"],
  AF: ["africa", "african"],
  NA: ["north america", "north american"],
  SA: ["south america", "south american"],
  OC: ["oceania"],
  AN: ["antarctica", "antarctic"],
};
const aliases = {
  Germany: ["german"],
  France: ["french"],
  Italy: ["italian"],
  Spain: ["spanish"],
  Portugal: ["portuguese"],
  Austria: ["austrian"],
  Switzerland: ["swiss"],
  Belgium: ["belgian"],
  Netherlands: ["dutch"],
  "United Kingdom": ["britain", "british"],
  Japan: ["japanese"],
  Greece: ["greek"],
  Norway: ["norwegian"],
  Sweden: ["swedish"],
  Denmark: ["danish"],
  Finland: ["finnish"],
  Poland: ["polish"],
  Czechia: ["czech", "czech republic"],
};
function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function contains(text, phrase) {
  return phrase && ` ${normalized(text)} `.includes(` ${normalized(phrase)} `);
}
const countryNames = [...new Set(Object.values(airports).map((a) => a[1]))];

/** Strongest named geography first; a country must not collapse into its continent. */
export function geographyScore(deal, place) {
  const airport = airports[String(deal?.destination_code || "").toUpperCase()];
  if (!airport) return 0;
  const [, country, continent] = airport;
  const text = place?.place || "";
  const namedCountries = countryNames.filter((name) =>
    [name, ...(aliases[name] || [])].some((term) => contains(text, term)));
  if (namedCountries.length) return namedCountries.includes(country) ? 3 : 0;
  const namedContinents = Object.entries(continents).filter(([, terms]) =>
    terms.some((term) => contains(text, term)));
  if (namedContinents.length)
    return namedContinents.some(([code]) => code === continent) ? 1 : 0;
  // An explicit region can supply the geography of a thematic entry, but not
  // contradict a country already named in its title.
  if (place?.region) return geographyScore(deal, { place: place.region });
  return 0;
}
