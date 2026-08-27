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
  /^(?:early |late |quick )?(?:breakfast|brunch|lunch|dinner|supper|drinks?|coffee|dessert)\s+(?:at|in|on|@)\s+/i,
  /^check[\s-]?(?:in|out)(?:\s+(?:to|at|of|from))?\s+/i,
  /^(?:board|boarding|embark(?:ation)?|disembark(?:ation)?)\s+(?:at|in|from|the)?\s*/i,
  /^(?:flight|fly|drive|driving|train|bus|coach|ferry|shuttle|transfer|taxi|ride|sail|cruise)\s+(?:to|from|into|for)\s+/i,
  /^(?:pick[\s-]?up|drop[\s-]?off|collect)\s+(?:at|from|in|the)?\s*/i,
  /^(?:tour|tours|visit|visiting|explore|exploring|see|seeing|walk|walking|hike|hiking|stroll)\s+(?:of|around|round|through|to|in|at|the)?\s*/i,
  /^(?:stay|nights?|overnight)\s+(?:at|in|on)\s+/i,
  /^(?:arrive|arriving|depart|departing|leave|leaving)\s+(?:at|in|from)?\s*/i,
  /^(?:reservation|booking|tickets?|entry|admission)\s+(?:at|for|to)\s+/i,
  /^(?:meet|meeting|check\s+in\s+with)\s+(?:at|in)\s+/i,
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
  // One opener is enough; "check in to the Hotel Captain Cook" should not then
  // lose "the Hotel" to a second pass.
  for (const opener of OPENERS) {
    if (opener.test(text)) {
      text = text.replace(opener, "").trim();
      break;
    }
  }
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
    props.state,
    props.country,
  ];
  const seen = new Set([placeName(props).toLowerCase()]);
  const out = [];
  for (const part of parts) {
    const clean = String(part || "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
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
  const where = [
    props.city || props.locality || props.district || props.county,
    props.state,
  ].filter(Boolean);
  // Somewhere abroad is worth naming; the country of a US address is not.
  if (props.country && props.countrycode !== "US") where.push(props.country);
  const parts = [name, ...where];
  const out = [];
  for (const part of parts) {
    const clean = String(part || "").trim();
    if (clean && !out.some((p) => p.toLowerCase() === clean.toLowerCase())) {
      out.push(clean);
    }
  }
  return out.join(", ");
}

/**
 * The results, best first: the sort of place the item is after, then anything
 * with a name of its own, then whatever order the geocoder liked. Duplicates of
 * the same place, which the geocoder does return, are dropped.
 */
export function rankPlaces(features = [], kinds = []) {
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
    scored.push({
      order: i,
      score: (matchesKind(props, kinds) ? 2 : 0) + (props.name ? 1 : 0),
      place: {
        name,
        detail: placeDetail(props),
        value,
        kind: props.osm_value || props.osm_key || "",
        lat: feature?.geometry?.coordinates?.[1] ?? null,
        lon: feature?.geometry?.coordinates?.[0] ?? null,
      },
    });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.map((s) => s.place);
}
