/**
 * Home-team lookup for the About-you sports chip drawer.
 *
 * The About-you screen has a chip drawer titled "Sports and teams" and the
 * point of it is to let somebody tap a name instead of typing one. A generic
 * list of "NFL, MLB, NBA" is fine but not surprising -- Aly is supposed to feel
 * like she already knows the family before she has been asked anything, and a
 * list that opens with the Cardinals and the Blues for a family in Webster
 * Groves is the first thing that gives that impression.
 *
 * How it works:
 *   - Every family has a home address on the families row, geocoded to
 *     home_lat and home_lon at welcome time. That is the source of truth.
 *   - This file carries a hand-built table of major US metros, each with a
 *     center coordinate and the pro teams that call it home. Four pro leagues
 *     only -- NFL, MLB, NBA, NHL. College is on purpose left off, because
 *     rival programs in the same metro turn "the local team" into an
 *     argument we do not need to have on a first-run screen.
 *   - Given a home lat/lon, we pick the nearest metro by haversine distance,
 *     and only if the family is inside a reasonable radius of that metro's
 *     center. A ranch in Wyoming or a house in rural Vermont falls back to
 *     the general list, which is fair; nobody there would call the Denver
 *     Broncos their local team either.
 *   - The output is a flat list of chip strings, home teams first (up to 4),
 *     then general sports categories to round the drawer out to a dozen. If
 *     home is unknown or nowhere near a metro, the whole thing is just the
 *     general list.
 *
 * The teams are named the way somebody would type them: with the article
 * ("the Cardinals", "the Blues"), not the city (no "St. Louis Cardinals"),
 * because the sentence built from the chip is "I follow the Cardinals" --
 * that is what somebody who follows them would say to a friend.
 *
 * Only US metros are in the table today. An international family or a family
 * in a US metro that is not listed falls through to the general list, which
 * is the same behaviour as before this file existed. Adding a metro is one
 * more object in TEAM_METROS; nothing else changes.
 */

const GENERAL_SPORTS = [
  "the NFL",
  "the NBA",
  "MLB",
  "the NHL",
  "college football",
  "college basketball",
  "F1",
  "soccer",
  "tennis",
  "golf",
  "the Olympics",
  "NASCAR",
];

// Max distance from a metro's center for a family to count as "in" that metro.
// About 120 miles. Big enough that a family an hour outside the city still
// sees their team; small enough that Webster Groves does not read as Kansas
// City. Chosen once, from the empirical footprint of professional team
// fanbases, not from any hard rule.
const METRO_RADIUS_MILES = 120;

/**
 * Major US metros with their pro teams.
 *
 * Coordinate is the metro's downtown-ish center. Teams are ordered the way
 * the drawer should show them: NFL first, MLB second, NBA third, NHL fourth.
 * A metro with only one or two teams gets whatever it has.
 *
 * Metros with rival teams in one league (LA has Rams and Chargers, Chicago
 * has White Sox and Cubs, NY has more of everything) list both -- somebody
 * will follow one, somebody the other, and a chip drawer is a starter, not
 * an exhaustive menu. Twelve chips total means the top ~4 of these get
 * shown; the rest slide off. That is fine.
 */
const TEAM_METROS = [
  {
    // NY has multiples in every league, and several names collide with other
    // metros (Rangers with Texas MLB, Giants with SF MLB, Jets with Winnipeg
    // NHL). NY is by far the older franchise for Giants and Rangers so those
    // keep the short form; the Jets are named to distinguish from Winnipeg.
    name: "New York",
    lat: 40.7128,
    lon: -74.006,
    teams: [
      "the Giants",
      "the Jets (NFL)",
      "the Yankees",
      "the Mets",
      "the Knicks",
      "the Nets",
      "the Rangers (NHL)",
      "the Islanders",
    ],
  },
  {
    // "the Kings" without qualification is the LA NHL team (older franchise).
    // Sacramento's NBA Kings read as "the Sacramento Kings" below.
    name: "Los Angeles",
    lat: 34.0522,
    lon: -118.2437,
    teams: [
      "the Rams",
      "the Chargers",
      "the Dodgers",
      "the Angels",
      "the Lakers",
      "the Clippers",
      "the Kings",
      "the Ducks",
    ],
  },
  {
    name: "Chicago",
    lat: 41.8781,
    lon: -87.6298,
    teams: [
      "the Bears",
      "the Cubs",
      "the White Sox",
      "the Bulls",
      "the Blackhawks",
    ],
  },
  {
    // "the Rangers" without qualification is the NYC NHL team (older, more
    // famous nationally). Texas reads as "the Texas Rangers".
    name: "Dallas-Fort Worth",
    lat: 32.7767,
    lon: -96.797,
    teams: [
      "the Cowboys",
      "the Texas Rangers",
      "the Mavericks",
      "the Stars",
    ],
  },
  {
    name: "Houston",
    lat: 29.7604,
    lon: -95.3698,
    teams: ["the Texans", "the Astros", "the Rockets"],
  },
  {
    name: "Washington",
    lat: 38.9072,
    lon: -77.0369,
    teams: [
      "the Commanders",
      "the Nationals",
      "the Wizards",
      "the Capitals",
    ],
  },
  {
    name: "Miami",
    lat: 25.7617,
    lon: -80.1918,
    teams: [
      "the Dolphins",
      "the Marlins",
      "the Heat",
      "the Florida Panthers",
    ],
  },
  {
    name: "Philadelphia",
    lat: 39.9526,
    lon: -75.1652,
    teams: ["the Eagles", "the Phillies", "the 76ers", "the Flyers"],
  },
  {
    name: "Atlanta",
    lat: 33.749,
    lon: -84.388,
    teams: ["the Falcons", "the Braves", "the Hawks"],
  },
  {
    name: "Boston",
    lat: 42.3601,
    lon: -71.0589,
    teams: ["the Patriots", "the Red Sox", "the Celtics", "the Bruins"],
  },
  {
    // "the Giants" without qualification is NY NFL. SF reads as "the SF Giants".
    name: "San Francisco Bay Area",
    lat: 37.7749,
    lon: -122.4194,
    teams: [
      "the 49ers",
      "the SF Giants",
      "the Athletics",
      "the Warriors",
      "the Sharks",
    ],
  },
  {
    // "the Cardinals" without qualification is St. Louis MLB (older, larger
    // fanbase). Phoenix reads with the state name to disambiguate.
    name: "Phoenix",
    lat: 33.4484,
    lon: -112.074,
    teams: [
      "the Arizona Cardinals",
      "the Diamondbacks",
      "the Suns",
    ],
  },
  {
    name: "Detroit",
    lat: 42.3314,
    lon: -83.0458,
    teams: ["the Lions", "the Tigers", "the Pistons", "the Red Wings"],
  },
  {
    name: "Seattle",
    lat: 47.6062,
    lon: -122.3321,
    teams: ["the Seahawks", "the Mariners", "the Kraken"],
  },
  {
    name: "Minneapolis",
    lat: 44.9778,
    lon: -93.265,
    teams: [
      "the Vikings",
      "the Twins",
      "the Timberwolves",
      "the Wild",
    ],
  },
  {
    name: "San Diego",
    lat: 32.7157,
    lon: -117.1611,
    teams: ["the Padres"],
  },
  {
    name: "Tampa",
    lat: 27.9506,
    lon: -82.4572,
    teams: ["the Buccaneers", "the Rays", "the Lightning"],
  },
  {
    name: "Denver",
    lat: 39.7392,
    lon: -104.9903,
    teams: [
      "the Broncos",
      "the Rockies",
      "the Nuggets",
      "the Avalanche",
    ],
  },
  {
    name: "St. Louis",
    lat: 38.627,
    lon: -90.1994,
    teams: ["the Cardinals", "the Blues"],
  },
  {
    name: "Baltimore",
    lat: 39.2904,
    lon: -76.6122,
    teams: ["the Ravens", "the Orioles"],
  },
  {
    // "the Panthers" without qualification is Carolina NFL. Florida NHL reads
    // as "the Florida Panthers" under Miami.
    name: "Charlotte",
    lat: 35.2271,
    lon: -80.8431,
    teams: ["the Panthers", "the Hornets"],
  },
  {
    name: "Orlando",
    lat: 28.5383,
    lon: -81.3792,
    teams: ["the Magic"],
  },
  {
    name: "San Antonio",
    lat: 29.4241,
    lon: -98.4936,
    teams: ["the Spurs"],
  },
  {
    name: "Portland",
    lat: 45.5152,
    lon: -122.6784,
    teams: ["the Trail Blazers"],
  },
  {
    name: "Sacramento",
    lat: 38.5816,
    lon: -121.4944,
    teams: ["the Sacramento Kings"],
  },
  {
    name: "Pittsburgh",
    lat: 40.4406,
    lon: -79.9959,
    teams: ["the Steelers", "the Pirates", "the Penguins"],
  },
  {
    name: "Cincinnati",
    lat: 39.1031,
    lon: -84.512,
    teams: ["the Bengals", "the Reds"],
  },
  {
    name: "Cleveland",
    lat: 41.4993,
    lon: -81.6944,
    teams: ["the Browns", "the Guardians", "the Cavaliers"],
  },
  {
    name: "Kansas City",
    lat: 39.0997,
    lon: -94.5786,
    teams: ["the Chiefs", "the Royals"],
  },
  {
    name: "Las Vegas",
    lat: 36.1699,
    lon: -115.1398,
    teams: ["the Raiders", "the Golden Knights"],
  },
  {
    name: "Columbus",
    lat: 39.9612,
    lon: -82.9988,
    teams: ["the Blue Jackets"],
  },
  {
    name: "Indianapolis",
    lat: 39.7684,
    lon: -86.1581,
    teams: ["the Colts", "the Pacers"],
  },
  {
    name: "Nashville",
    lat: 36.1627,
    lon: -86.7816,
    teams: ["the Titans", "the Predators"],
  },
  {
    name: "Milwaukee",
    lat: 43.0389,
    lon: -87.9065,
    teams: ["the Brewers", "the Bucks"],
  },
  {
    name: "Jacksonville",
    lat: 30.3322,
    lon: -81.6557,
    teams: ["the Jaguars"],
  },
  {
    name: "Memphis",
    lat: 35.1495,
    lon: -90.049,
    teams: ["the Grizzlies"],
  },
  {
    name: "Oklahoma City",
    lat: 35.4676,
    lon: -97.5164,
    teams: ["the Thunder"],
  },
  {
    name: "New Orleans",
    lat: 29.9511,
    lon: -90.0715,
    teams: ["the Saints", "the Pelicans"],
  },
  {
    name: "Salt Lake City",
    lat: 40.7608,
    lon: -111.891,
    teams: ["the Jazz"],
  },
  {
    name: "Buffalo",
    lat: 42.8864,
    lon: -78.8784,
    teams: ["the Bills", "the Sabres"],
  },
  {
    name: "Green Bay",
    lat: 44.5133,
    lon: -88.0133,
    teams: ["the Packers"],
  },
  {
    name: "Raleigh",
    lat: 35.7796,
    lon: -78.6382,
    teams: ["the Hurricanes"],
  },
  {
    name: "Toronto",
    lat: 43.6532,
    lon: -79.3832,
    teams: [
      "the Maple Leafs",
      "the Blue Jays",
      "the Raptors",
    ],
  },
  {
    name: "Montreal",
    lat: 45.5017,
    lon: -73.5673,
    teams: ["the Canadiens"],
  },
  {
    name: "Vancouver",
    lat: 49.2827,
    lon: -123.1207,
    teams: ["the Canucks"],
  },
  {
    name: "Calgary",
    lat: 51.0447,
    lon: -114.0719,
    teams: ["the Flames"],
  },
  {
    name: "Edmonton",
    lat: 53.5461,
    lon: -113.4938,
    teams: ["the Oilers"],
  },
  {
    name: "Ottawa",
    lat: 45.4215,
    lon: -75.6972,
    teams: ["the Senators"],
  },
  {
    // "the Jets" without qualification is the NY NFL team; Winnipeg reads as
    // "the Winnipeg Jets".
    name: "Winnipeg",
    lat: 49.8951,
    lon: -97.1384,
    teams: ["the Winnipeg Jets"],
  },
];

/**
 * Great-circle distance in miles between two lat/lon points. Haversine.
 * Radius of the Earth as 3958.8 miles -- the mean radius, not a spherical
 * approximation, which is close enough for picking a metro out of a
 * continent-sized list.
 */
function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Return the closest metro to (lat, lon) that is inside METRO_RADIUS_MILES,
 * or null when there is no home coordinate or the family is nowhere near
 * one of the metros in the table.
 */
export function nearestHomeMetro(homeLat, homeLon) {
  const lat = Number(homeLat);
  const lon = Number(homeLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  let best = null;
  let bestDist = Infinity;
  for (const metro of TEAM_METROS) {
    const d = haversineMiles(lat, lon, metro.lat, metro.lon);
    if (d < bestDist) {
      bestDist = d;
      best = metro;
    }
  }
  if (!best || bestDist > METRO_RADIUS_MILES) return null;
  return { ...best, distanceMiles: bestDist };
}

/**
 * Build the ordered chip list for "Sports and teams" for one family.
 *
 * Home teams first (up to 4, to keep them on the first visible line of chips
 * on a phone), then general sports categories to round out to a dozen total.
 * If the family has no home lat/lon on the row or lives outside every metro
 * in the table, the return is just the general list -- the same as before.
 *
 * The two arguments come straight from families.home_lat and
 * families.home_lon. Do not resolve or normalise them here; they are stored
 * as numbers already.
 */
export function buildSportsChipItems(homeLat, homeLon, maxItems = 12) {
  const metro = nearestHomeMetro(homeLat, homeLon);
  const home = metro ? metro.teams.slice(0, 4) : [];
  const homeSet = new Set(home);
  const filler = GENERAL_SPORTS.filter((s) => !homeSet.has(s));
  return [...home, ...filler].slice(0, maxItems);
}
