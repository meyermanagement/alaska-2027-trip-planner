import { nearestKm } from "./photon";

// Turning "what is happening" into something worth searching for.
//
// The location box used to be a plain text field, so it held whatever anyone
// typed and meant nothing to anything else. Now it looks places up — and the
// thing it looks up first is the line above it, because by the time you have
// written "Dinner at Simon and Seafort's" you have already said where you are
// going and should not have to say it twice.

// Openings that name the kind of thing rather than the place. "Dinner at" tells
// the search nothing except which sort of place to prefer, and searching for the
// word dinner buries the restaurant you meant.
const OPENERS = [
  // Every optional preposition group carries its own leading space and is
  // followed by a required one. Written the other way round, "in" happily eats
  // the first two letters of "Innsbruck" and "to" eats the start of "tour".
  /^(?:early |late |quick )?(?:breakfast|brunch|lunch|dinner|supper|drinks?|coffee|dessert)\s+(?:at|in|on|@)\s+/i,
  /^check[\s-]?(?:in|out)(?:\s+(?:to|into|at|of|from))?\s+/i,
  /^(?:board|boarding|embark(?:ation)?|disembark(?:ation)?)(?:\s+(?:at|in|from|the))?\s+/i,
  /^(?:flight|fly|drive|driving|train|bus|coach|ferry|shuttle|transfer|taxi|ride|sail|cruise)\s+(?:to|from|into|for)\s+/i,
  /^(?:pick[\s-]?up|drop[\s-]?off|collect)(?:\s+(?:at|from|in|the))?\s+/i,
  /^(?:tour|tours|visit|visiting|explore|exploring|see|seeing|walk|walking|hike|hiking|stroll)(?:\s+(?:of|around|round|through|to|in|at|the))?\s+/i,
  /^(?:stay|nights?|overnight)\s+(?:at|in|on)\s+/i,
  /^(?:arrive|arriving|depart|departing|leave|leaving)(?:\s+(?:at|in|from))?\s+/i,
  /^(?:reservation|booking|tickets?|entry|admission)\s+(?:at|for|to)\s+/i,
  /^(?:meet|meeting)\s+(?:at|in)\s+/i,
];

// Trailing asides. "Denali flightseeing (2 hrs)" and "Ferry — bring passports"
// both end in something that is not part of any place's name.
const TAILS = [
  /\s*[([{][^)\]}]*[)\]}]\s*$/,
  /\s+[—–-]{1,2}\s+.*$/,
  /\s*[,;]\s*(?:bring|remember|note|confirmation|conf|ref|booked|paid|deposit)\b.*$/i,
  /\s+with\s+(?:the\s+)?(?:kids|family|everyone|steph|veda|mark)\s*$/i,
];

// Words that are never a place on their own, so a title that reduces to one of
// them gets no suggestions rather than a screenful of noise.
const BARE = new Set([
  "breakfast",
  "brunch",
  "lunch",
  "dinner",
  "supper",
  "drinks",
  "coffee",
  "flight",
  "flights",
  "drive",
  "train",
  "bus",
  "ferry",
  "shuttle",
  "transfer",
  "taxi",
  "tour",
  "tours",
  "visit",
  "hike",
  "walk",
  "packing",
  "rest",
  "free time",
  "free day",
  "travel day",
  "check in",
  "check out",
  "departure",
  "arrival",
  "note",
  "notes",
  "tbd",
  "tba",
]);

/**
 * The part of an item's title that names a place, or "" when the title is only
 * describing an activity.
 */
export function queryFromTitle(title) {
  let text = String(title || "").trim();
  if (!text) return "";
  for (const tail of TAILS) text = text.replace(tail, "").trim();
  // Two openers at most. "Walking tour of Willemstad" needs both passes to get
  // down to the city, and a title with three verbs in front of the place name is
  // not a title anybody writes. Every opener needs a verb and a following word,
  // so whatever survives to the last pass is safe from being eaten further.
  for (let pass = 0; pass < 2; pass++) {
    const opener = OPENERS.find((o) => o.test(text));
    if (!opener) break;
    text = text.replace(opener, "").trim();
  }
  // What is left can still lead with the thing rather than the place: "Board the
  // cruise at Canada Place" survives the openers as "cruise at Canada Place",
  // which finds a road in Whistler. A generic noun followed by "at" is not the
  // name of anywhere.
  text = text
    .replace(
      /^(?:the\s+)?(?:cruise|ship|boat|flight|plane|train|bus|coach|ferry|shuttle|car|van|tour|show|dinner|lunch|breakfast|brunch|meal|table|room|reservation|booking|meeting|check[\s-]?in|check[\s-]?out)(?:\s+(?:reservations?|booking|table|tickets?))?\s+(?:at|in|on|from)\s+/i,
      "",
    )
    .trim();
  text = text.replace(/^(?:the|a|an|our|my)\s+/i, "").trim();
  text = text.replace(/\s+/g, " ");
  if (text.length < 3) return "";
  if (BARE.has(text.toLowerCase())) return "";
  return text;
}

// Which sorts of place each kind of item usually means. Used to sort what comes
// back rather than to filter it, because a hotel search that finds the right
// street but no matching hotel tag should still show you the street.
const KINDS = {
  flight: ["aeroway:aerodrome", "aeroway:terminal"],
  lodging: [
    "tourism:hotel",
    "tourism:guest_house",
    "tourism:motel",
    "tourism:apartment",
    "tourism:hostel",
    "leisure:resort",
  ],
  cruise: [
    "amenity:ferry_terminal",
    "man_made:pier",
    "landuse:port",
    "harbour:port",
  ],
  dining: [
    "amenity:restaurant",
    "amenity:cafe",
    "amenity:bar",
    "amenity:pub",
    "amenity:fast_food",
    "amenity:ice_cream",
  ],
  excursion: [
    "tourism:attraction",
    "tourism:viewpoint",
    "boundary:national_park",
    "leisure:nature_reserve",
    "natural:peak",
    "natural:glacier",
    "leisure:park",
  ],
  transport: [
    "railway:station",
    "amenity:bus_station",
    "amenity:car_rental",
    "aeroway:aerodrome",
    "amenity:ferry_terminal",
  ],
  activity: [
    "tourism:attraction",
    "tourism:museum",
    "tourism:theme_park",
    "amenity:theatre",
    "leisure:park",
  ],
  note: [],
};

/** The kinds of place an item of this category probably means. */
export function kindsForCategory(category) {
  return KINDS[category] || [];
}

/** Whether one result is the sort of place this category was after. */
export function matchesKind(props, kinds) {
  if (!kinds || !kinds.length) return false;
  const key = props?.osm_key;
  const value = props?.osm_value;
  if (!key) return false;
  return kinds.includes(`${key}:${value}`) || kinds.includes(key);
}

/**
 * The two names as one comparable word, for deciding whether a part of an address
 * repeats a part already written down.
 *
 * A plain lowercase comparison is not enough. Photon returns the island of Kauai
 * with a name of "Kauai" and a county of "Kauaʻi", which differ by one ʻokina and
 * so were kept as two separate parts -- that is how "Kauai, Kauaʻi, Hawaii" ended
 * up on the bucket list. Accents, the ʻokina and its lookalike apostrophes,
 * hyphens and spaces all come out, and a trailing administrative word comes off
 * the end, so Kauai matches Kauaʻi, Bora-Bora matches Bora Bora, and King County
 * matches King. The word city is deliberately left alone: Oklahoma City is not
 * Oklahoma, and Kansas City is in the wrong state half the time it is guessed at.
 */
function sameNameKey(text) {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+(county|parish|borough|municipality)\s*$/, "")
    .replace(/[^a-z0-9]/g, "");
}

// Words that describe what a place is rather than which one it is. A region whose
// name is the bare form of the place -- Galápagos behind Galapagos Islands -- is
// repeating it, not locating it, so the name is compared with and without them.
// "City" is deliberately absent: Oklahoma City is not Oklahoma.
const GENERIC =
  /\s+(islands?|isles?|national park|state park|peninsula|archipelago)\s*$/;

/** Every form of the leading name that a later part could be repeating. */
function nameKeys(name) {
  const plain = String(name || "").toLowerCase();
  return new Set(
    [plain, plain.replace(GENERIC, "")].map(sameNameKey).filter(Boolean),
  );
}

/** The line a suggestion leads with. */
export function placeName(props = {}) {
  if (props.name) return props.name;
  const street = [props.housenumber, props.street].filter(Boolean).join(" ");
  return street || props.city || props.county || props.state || "";
}

/**
 * The quieter line underneath, which exists to tell two places of the same name
 * apart. The leading name is left out of it, and so is anything already said.
 */
export function placeDetail(props = {}) {
  const street = props.name
    ? [props.housenumber, props.street].filter(Boolean).join(" ")
    : "";
  const parts = [
    street,
    props.city || props.locality || props.district,
    // The county is dropped from the value that gets written down, so this quiet
    // line is where it earns its keep: two Wilmingtons in one state are told
    // apart here, in the list, before anybody chooses one.
    props.county,
    props.state,
    props.country,
  ];
  const seen = nameKeys(placeName(props));
  const out = [];
  for (const part of parts) {
    const clean = String(part || "").trim();
    if (!clean) continue;
    const key = sameNameKey(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out.join(", ");
}

/**
 * What actually gets written into the field when a suggestion is chosen: enough
 * to find the place again, short enough to sit on an itinerary card. The street
 * number is dropped, because "Simon and Seafort's, Anchorage, Alaska" is what
 * you would have typed.
 */
export function placeValue(props = {}) {
  const name = placeName(props);
  // A county is a last resort, not a middle name. Photon has no city for a place
  // that is itself the city, so the county filled the gap and the bucket list
  // read "Seattle, King, Washington" and "Savannah, Chatham, Georgia" -- a county
  // written where a reader expects a town. It is only worth saying when nothing
  // else locates the place at all.
  const town = props.city || props.locality || props.district;
  // An administrative unit wearing its full legal name is a county in all but
  // word: "Madikwe Game Reserve, Ngaka Modiri Molema District Municipality, North
  // West, South Africa" is four parts where three would do.
  const clerical = /\b(district|metropolitan|local|rural)\s+municipality$/i;
  const where = [town && !clerical.test(town) ? town : "", props.state].filter(
    Boolean,
  );
  if (!where.length) {
    const last = props.county || town;
    if (last) where.push(last);
  }
  // Somewhere abroad is worth naming; the country of a US address is not.
  if (props.country && props.countrycode !== "US") {
    // A region named after the country it is in says the country twice: Denmark
    // does not need saying in "Copenhagen, Capital Region of Denmark, Denmark".
    // The country wins, because it is the half a reader is navigating by.
    const key = sameNameKey(props.country);
    for (let i = where.length - 1; i >= 0; i -= 1) {
      if (key && sameNameKey(where[i]).endsWith(key)) where.splice(i, 1);
    }
    where.push(props.country);
  }
  const parts = [name, ...where];
  const out = [];
  const seen = nameKeys(name);
  seen.delete(sameNameKey(name));
  // A region that is the place's own name with an administrative wrapper round it
  // -- Community of Madrid behind Madrid -- is the place again, said longer. The
  // wrapper has to be one of these words, so that York is not swallowed by New
  // York, which merely ends the same way.
  const own = sameNameKey(name);
  const unwrap = (text) =>
    sameNameKey(
      String(text || "").replace(
        /^(?:the\s+)?(?:autonomous\s+|capital\s+|greater\s+|metropolitan\s+)*(?:community|province|region|state|department|governorate|prefecture|canton|territory|municipality|city|island|isle)\s+of\s+/i,
        "",
      ),
    );
  for (const part of parts) {
    const clean = String(part || "").trim();
    const key = sameNameKey(clean);
    if (!clean || !key || seen.has(key)) continue;
    if (own && key !== own && unwrap(clean) === own) continue;
    seen.add(key);
    out.push(clean);
  }
  return out.join(", ");
}

/**
 * The results, best first: the sort of place the item is after, then anything
 * with a name of its own, then whatever order the geocoder liked. Duplicates of
 * the same place, which the geocoder does return, are dropped.
 */
/**
 * How much a place being near the trip is worth.
 *
 * Distance to the nearest stop, not to some middle of the trip: a hotel in
 * Vancouver is right for an Alaska cruise that sails from there, even though the
 * rest of the trip is two thousand kilometres north. Bands rather than a curve,
 * because the difference between two and twenty kilometres does not matter and
 * the difference between the same city and the wrong continent does.
 *
 * Worth more than matching the kind of item, which is what stops a pub in Sydney
 * called Captain Cook Hotel from beating the hotel in Anchorage.
 */
export function nearScore(point, stops = []) {
  if (!stops.length) return 0;
  if (!Number.isFinite(point?.lat) || !Number.isFinite(point?.lon)) return 0;
  const km = nearestKm(point, stops);
  if (km <= 40) return 6;
  if (km <= 200) return 4;
  if (km <= 800) return 2;
  return 0;
}

export function rankPlaces(features = [], kinds = [], stops = []) {
  const seen = new Set();
  const scored = [];
  features.forEach((feature, i) => {
    const props = feature?.properties || {};
    const name = placeName(props);
    if (!name) return;
    const value = placeValue(props);
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const lat = feature?.geometry?.coordinates?.[1] ?? null;
    const lon = feature?.geometry?.coordinates?.[0] ?? null;
    scored.push({
      order: i,
      score:
        (matchesKind(props, kinds) ? 3 : 0) +
        (props.name ? 1 : 0) +
        nearScore({ lat, lon }, stops),
      place: {
        name,
        detail: placeDetail(props),
        value,
        kind: props.osm_value || props.osm_key || "",
        lat,
        lon,
      },
    });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((s) => s.place);
}
