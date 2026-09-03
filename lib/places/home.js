// The household's own address, as something a location box can offer.
//
// Almost every trip begins and ends at the same address, and typing it out again
// for the drive to the airport, the drive back and the kennel drop-off is work
// the app already knows the answer to. It is labeled "Home" rather than by its
// street, because that is what it is to the person choosing it -- and it carries
// the full address as its value, because that is what a drive has to be measured
// from.

/** The family's home as a suggestion row, or null when they have not set one. */
export function homeRow(row) {
  const address = row?.home_address;
  if (!address) return null;
  return {
    name: "Home",
    detail: address,
    value: address,
    kind: row.home_precise ? "address" : "street",
    lat: Number.isFinite(row.home_lat) ? row.home_lat : null,
    lon: Number.isFinite(row.home_lon) ? row.home_lon : null,
  };
}

/**
 * Whether Home belongs at the top of this particular list.
 *
 * On an empty box, yes -- that is the tap it exists for, and it outranks anything
 * guessed from the title of the item, since a guess should not beat the house.
 * While typing, only when the words point at it: the word "home" being spelled
 * out, or the address itself. Anybody typing a restaurant name should not have to
 * read past their own house to reach it.
 */
export function wantsHome(term, home) {
  if (!home) return false;
  const said = String(term || "")
    .trim()
    .toLowerCase();
  if (said.length < 2) return true;
  if ("home".startsWith(said)) return true;
  return String(home.detail || "")
    .toLowerCase()
    .includes(said);
}

/** Home first, and never twice, when it is wanted at all. */
export function withHome(places, home, term) {
  const list = Array.isArray(places) ? places : [];
  if (!wantsHome(term, home)) return list;
  return [home, ...list.filter((p) => p.value !== home.value)].slice(0, 6);
}

/**
 * One address written two ways, compared as a place rather than as text.
 *
 * "908 Windsor Ct, Webster Groves, MO 63119, USA" and "908 Windsor Ct, Webster
 * Groves, MO 63119" are the same house, and treating them as different strings
 * costs a geocoder request and risks a worse answer than the one already stored.
 * Country, punctuation and doubled spaces go; nothing else is touched, because
 * guessing that "St" and "Street" are the same word is how a comparison starts
 * merging places that only rhyme.
 */
export function sameAddress(a, b) {
  const tidy = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/,?\s*(usa|u\.s\.a\.|united states( of america)?)\.?\s*$/, "")
      .replace(/[.,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const one = tidy(a);
  return one.length > 0 && one === tidy(b);
}

/**
 * The household address off a trip row that joined it, in the shape locateItems
 * wants. Supabase hands a to-one join back as an object on some queries and a
 * one-element array on others, and a route should not have to care which.
 */
export function houseOf(trip) {
  const row = Array.isArray(trip?.families) ? trip.families[0] : trip?.families;
  return {
    address: row?.home_address || "",
    lat: row?.home_lat,
    lon: row?.home_lon,
  };
}
