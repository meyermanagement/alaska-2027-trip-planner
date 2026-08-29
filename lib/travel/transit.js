/**
 * Is public transportation a real option where the family is?
 *
 * The answer is not global. In Munich a subway is the obvious way to cross town;
 * in Girdwood there is nothing to catch. Offering "Transit" everywhere would make
 * the day screen useless in half the places this family goes, and hiding it
 * everywhere would waste the half where it is the best answer.
 *
 * This is a curated table rather than a lookup service on purpose. It is
 * deterministic, it costs nothing, it can be tested, and its failure mode is a
 * flat `unknown` -- which the screen says nothing about. A wrong confident answer
 * is the one outcome worth engineering against, so a place this table does not
 * recognize gets no transit option at all rather than a guess based on how big
 * the city sounds.
 *
 * `region` exists so a written preference about a region can find a city. The
 * family's note says "unless it's a European train", and Venice does not contain
 * the word Europe.
 */

/**
 * quality:
 *  - `excellent` — you would not think about a car. Frequent, broad, tourist-legible.
 *  - `good`      — a genuine option on most journeys in the core.
 *  - `resort`    — not a public system, but a real network the family will use:
 *                  Disney buses, monorail, Skyliner, boats.
 *  - `limited`   — something exists, and recommending it would be a disservice.
 */
const PLACES = [
  // --- Europe -------------------------------------------------------------
  {
    match: ["munich", "münchen"],
    quality: "excellent",
    region: "Germany, Europe",
    said: "U-Bahn, S-Bahn and trams reach almost everything",
  },
  {
    match: ["berlin"],
    quality: "excellent",
    region: "Germany, Europe",
    said: "U-Bahn and S-Bahn run all night at weekends",
  },
  {
    match: ["rothenburg"],
    quality: "limited",
    region: "Germany, Europe",
    said: "the old town is walkable and the rest is regional rail",
  },
  {
    match: ["salzburg"],
    quality: "good",
    region: "Austria, Europe",
    said: "trolleybuses cover the city and the centre is walkable",
  },
  {
    match: ["innsbruck", "tirol", "tyrol"],
    quality: "good",
    region: "Austria, Europe",
    said: "trams and regional buses reach the valleys",
  },
  {
    match: ["vienna", "wien"],
    quality: "excellent",
    region: "Austria, Europe",
    said: "the U-Bahn is fast and the tram network is dense",
  },
  {
    match: ["venice", "venezia"],
    quality: "excellent",
    region: "Italy, Europe",
    said: "vaporetti are the buses here and there are no cars at all",
  },
  {
    match: ["rome", "roma"],
    quality: "good",
    region: "Italy, Europe",
    said: "two metro lines plus buses, though the centre is walked",
  },
  {
    match: ["florence", "firenze"],
    quality: "good",
    region: "Italy, Europe",
    said: "the centre is walkable and trams reach the edges",
  },
  {
    match: ["milan", "milano"],
    quality: "excellent",
    region: "Italy, Europe",
    said: "four metro lines and a large tram network",
  },
  {
    match: ["istria", "pula", "rovinj"],
    quality: "limited",
    region: "Croatia, Europe",
    said: "intercity buses between towns, little else",
  },
  {
    match: ["ljubljana", "lake bled", "bled"],
    quality: "good",
    region: "Slovenia, Europe",
    said: "buses connect Bled and Ljubljana hourly",
  },
  {
    match: ["paris"],
    quality: "excellent",
    region: "France, Europe",
    said: "the Métro reaches everywhere inside the city",
  },
  {
    match: ["london"],
    quality: "excellent",
    region: "England, United Kingdom, Europe",
    said: "the Underground, buses and Overground with one card",
  },
  {
    match: ["edinburgh"],
    quality: "good",
    region: "Scotland, United Kingdom, Europe",
    said: "trams and a good bus network",
  },
  {
    match: ["amsterdam"],
    quality: "excellent",
    region: "Netherlands, Europe",
    said: "trams, metro and ferries, plus bikes everywhere",
  },
  {
    match: ["barcelona"],
    quality: "excellent",
    region: "Spain, Europe",
    said: "the metro is quick and covers the whole city",
  },
  {
    match: ["madrid"],
    quality: "excellent",
    region: "Spain, Europe",
    said: "one of the largest metro systems in Europe",
  },
  {
    match: ["lisbon", "lisboa"],
    quality: "good",
    region: "Portugal, Europe",
    said: "metro, trams and funiculars for the hills",
  },
  {
    match: ["prague", "praha"],
    quality: "excellent",
    region: "Czechia, Europe",
    said: "metro and trams, cheap and frequent",
  },
  {
    match: ["budapest"],
    quality: "excellent",
    region: "Hungary, Europe",
    said: "metro, trams and trolleybuses across both banks",
  },
  {
    match: ["copenhagen", "københavn"],
    quality: "excellent",
    region: "Denmark, Europe",
    said: "a driverless metro and S-tog, plus bike lanes",
  },
  {
    match: ["stockholm"],
    quality: "excellent",
    region: "Sweden, Europe",
    said: "the Tunnelbana reaches the suburbs and the islands",
  },
  {
    match: ["oslo"],
    quality: "good",
    region: "Norway, Europe",
    said: "metro, trams and ferries on one ticket",
  },
  {
    match: ["zurich", "zürich", "geneva", "lucerne", "interlaken"],
    quality: "excellent",
    region: "Switzerland, Europe",
    said: "Swiss trains and buses run to the minute",
  },
  {
    match: ["dublin"],
    quality: "good",
    region: "Ireland, Europe",
    said: "Luas trams and buses in the core",
  },
  {
    match: ["athens"],
    quality: "good",
    region: "Greece, Europe",
    said: "the metro reaches the airport and the Acropolis",
  },
  {
    match: ["reykjavik", "reykjavík"],
    quality: "limited",
    region: "Iceland, Europe",
    said: "city buses only; the country needs a car",
  },

  // --- Asia and Oceania ----------------------------------------------------
  {
    match: ["tokyo"],
    quality: "excellent",
    region: "Japan, Asia",
    said: "trains go everywhere and arrive when they say",
  },
  {
    match: ["kyoto", "osaka"],
    quality: "excellent",
    region: "Japan, Asia",
    said: "subways and JR lines cover the city",
  },
  {
    match: ["singapore"],
    quality: "excellent",
    region: "Asia",
    said: "the MRT is clean, cheap and air-conditioned",
  },
  {
    match: ["hong kong"],
    quality: "excellent",
    region: "China, Asia",
    said: "the MTR plus the Star Ferry",
  },
  {
    match: ["seoul"],
    quality: "excellent",
    region: "South Korea, Asia",
    said: "an enormous subway with English signage",
  },
  {
    match: ["taipei"],
    quality: "excellent",
    region: "Taiwan, Asia",
    said: "the MRT covers the city and the airport",
  },
  {
    match: ["sydney"],
    quality: "good",
    region: "Australia, Oceania",
    said: "trains and the harbour ferries",
  },
  {
    match: ["melbourne"],
    quality: "good",
    region: "Australia, Oceania",
    said: "trams through the centre are free in the CBD",
  },
  {
    match: ["auckland", "wellington"],
    quality: "limited",
    region: "New Zealand, Oceania",
    said: "buses in the core; the country needs a car",
  },

  // --- Americas ------------------------------------------------------------
  {
    match: ["chicago"],
    quality: "excellent",
    region: "Illinois, United States",
    said: "the L runs all night and reaches both airports",
  },
  {
    match: ["new york", "manhattan", "brooklyn", "nyc"],
    quality: "excellent",
    region: "New York, United States",
    said: "the subway runs 24 hours",
  },
  {
    match: ["washington, dc", "washington dc", "district of columbia"],
    quality: "excellent",
    region: "United States",
    said: "Metro reaches the monuments and both airports",
  },
  {
    match: ["boston"],
    quality: "good",
    region: "Massachusetts, New England, United States",
    said: "the T covers the core, and the core is small",
  },
  {
    match: ["san francisco"],
    quality: "good",
    region: "California, United States",
    said: "Muni and BART, plus the cable cars",
  },
  {
    match: ["philadelphia"],
    quality: "good",
    region: "Pennsylvania, United States",
    said: "SEPTA subway and regional rail",
  },
  {
    match: ["montreal", "montréal"],
    quality: "excellent",
    region: "Quebec, Canada",
    said: "the Métro is quick and warm in winter",
  },
  {
    match: ["toronto"],
    quality: "good",
    region: "Ontario, Canada",
    said: "the subway plus a large streetcar network",
  },
  {
    match: ["vancouver"],
    quality: "good",
    region: "British Columbia, Canada",
    said: "the SkyTrain reaches the airport and the suburbs",
  },
  {
    match: ["mexico city", "ciudad de méxico", "cdmx"],
    quality: "excellent",
    region: "Mexico",
    said: "an enormous and very cheap metro",
  },
  {
    match: ["buenos aires"],
    quality: "good",
    region: "Argentina, South America",
    said: "the Subte covers the central barrios",
  },

  // --- places this family goes where the honest answer is no ---------------
  {
    match: [
      "walt disney world",
      "disney world",
      "magic kingdom",
      "epcot",
      "hollywood studios",
      "animal kingdom",
      "disney springs",
    ],
    quality: "resort",
    region: "Florida, United States",
    said: "Disney buses, boats, the monorail and the Skyliner",
  },
  {
    match: ["disneyland"],
    quality: "resort",
    region: "California, United States",
    said: "resort buses and a short walk to the gates",
  },
  {
    match: ["des moines"],
    quality: "limited",
    region: "Iowa, United States",
    said: "DART buses exist but do not go where a horse show does",
  },
  {
    match: ["orlando"],
    quality: "limited",
    region: "Florida, United States",
    said: "outside the resorts, Orlando needs a car",
  },
  {
    match: ["anchorage"],
    quality: "limited",
    region: "Alaska, United States",
    said: "People Mover buses are thin outside downtown",
  },
  {
    match: [
      "girdwood",
      "denali",
      "seward",
      "skagway",
      "juneau",
      "ketchikan",
      "sitka",
      "icy strait",
      "haines",
    ],
    quality: "limited",
    region: "Alaska, United States",
    said: "shuttles and tours rather than a network",
  },
  {
    match: ["willemstad", "curaçao", "curacao"],
    quality: "limited",
    region: "Caribbean",
    said: "buses are infrequent; the ferry across the bay is free",
  },
  {
    match: ["springfield, il", "springfield, illinois"],
    quality: "limited",
    region: "Illinois, United States",
    said: "a small bus system, not built for visitors",
  },
  {
    match: ["aruba", "bonaire", "st thomas", "st maarten", "nassau"],
    quality: "limited",
    region: "Caribbean",
    said: "shared vans and taxis rather than a timetable",
  },
];

const UNKNOWN = { quality: "unknown", region: "", said: null, matched: null };

function fold(text) {
  return (
    String(text || "")
      .toLowerCase()
      .normalize("NFD")
      // Strip accents so "Curaçao" finds "curacao" and "München" finds "munchen".
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * What transit looks like at a place.
 *
 * @param where free text: a trip destination, an item location, or both joined
 * @returns {{ quality, region, said, matched }}
 *
 * A trip destination is often a list -- "Munich, Rothenburg, Tirol, Salzburg,
 * Lake Bled, Istria & Venice" -- so the best match wins rather than the first.
 * Being told about the U-Bahn matters more than being told Rothenburg is walkable.
 */
export function transitAt(where) {
  const text = fold(where);
  if (!text) return UNKNOWN;

  const RANK = { excellent: 4, resort: 3, good: 2, limited: 1 };
  let best = null;
  for (const place of PLACES) {
    for (const term of place.match) {
      if (!text.includes(fold(term))) continue;
      if (!best || RANK[place.quality] > RANK[best.quality])
        best = { ...place, matched: term };
      break;
    }
  }
  return best || UNKNOWN;
}

/** Is transit worth putting on the screen at all here? */
export function transitWorthOffering(quality) {
  return quality === "excellent" || quality === "good" || quality === "resort";
}

/**
 * Words describing where the family is, for testing a written exception against.
 *
 * The region is folded in deliberately: "unless it's a European train" has to
 * apply in Venice, and only the table knows Venice is in Europe.
 */
export function placeWords(where, hit) {
  return [where, hit?.region].filter(Boolean).join(", ");
}
