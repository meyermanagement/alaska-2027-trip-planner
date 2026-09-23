/**
 * Cards for the places a reply named, without asking the model a second time.
 *
 * When the first turn answers a question about places in prose -- bold names,
 * a reason after each -- and draws no cards, the route used to pay for a whole
 * second turn whose only job was to hand the same names back as show_places.
 * Twice in eight days, about two and a half seconds each, and the same prompt
 * billed again. The names are already on the screen; what the card needs from
 * outside the reply is a photograph, an address and a map pin, and those come
 * from the place lookup, not from the model.
 *
 * The risk is the wrong building. A bold line that is a heading ("Best for a
 * rainy day") or a name that exists in forty cities would staple a stranger's
 * address to a confident-looking card. So a name only becomes a card when:
 *
 * - it was looked up in the trip's own area, or around where they are;
 * - Google's name for what it found is the name in the reply, not merely a
 *   neighbor of it;
 * - it is not far from where they are, when the app knows that;
 * - and at least two of them survive. One lonely card is more likely a slip
 *   than a shortlist, and the model finish is still there to fall back on.
 *
 * Anything short of that returns nothing and the route asks the model, exactly
 * as before.
 */
import { normalizePlace } from "./cards";
import { lookUpPlace, photosConfigured } from "./photos";
import { bias as biasFor, precise } from "./here";
import { biasPoint, haversineKm } from "./photon";

/** No more cards than a shortlist would carry. */
const MOST = 6;
/** Fewer than this, and the model is asked instead. */
const FEWEST = 2;
/** Further than this from where they are, and it is some other place. */
const NEAR_KM = 60;
/** Further than this from the rest of the shortlist, and it is an outlier. */
const TOGETHER_KM = 150;

const NEARBY =
  /\b(near(?:by)?|near me|close by|closest|around here|walking distance|from here|where we are|where i am)\b/i;

const BOLD = /\*\*([^*\n]{2,80}?)\*\*/g;

// Words a heading is made of. A bold phrase made only of these is a label, not
// a place: "Best splurge", "Rainy day pick", "Budget option".
const LABEL_WORDS = new Set(
  (
    "a an the and or of for to on in at with my our your best top pick picks " +
    "option options choice choices splurge value budget cheap classic quick " +
    "easy tip tips note why how what when where plan day days morning " +
    "afternoon evening night tonight tomorrow today lunch dinner breakfast " +
    "brunch rainy sunny family families kid kids adults bonus alternative " +
    "alternatives backup favorite favourite first second third last also " +
    // The labels a formatted answer puts in front of each line under a name:
    // "Menu highlights:", "Why it wins:", "Good to know:".
    "menu highlights highlight why it wins worth know good great must try " +
    "order skip insider pro heads up here is are this that"
  ).split(" "),
);

// Talk about a place rather than a place: "4.5-star Google rating floor",
// "3x points on your Chase Sapphire Reserve", "4.1 and 4.3 on Google". Bold is
// how an answer stresses a number, and each one looked up is a paid lookup.
const NOT_A_NAME =
  /\b(google|yelp|tripadvisor|ratings?|rated|reviews?|points|miles)\b|%|\d\s*-?\s*stars?\b|\d+x\b/i;

// A markdown heading, with or without a number in front: "### 1. Name".
const HEADING = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t#]*$/gm;

function fold(text) {
  return String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(text) {
  return fold(text)
    .split(" ")
    .filter((t) => t && t !== "the" && t !== "and" && t !== "a");
}

/** A bold phrase that reads like a label rather than somebody's name. */
function isLabel(name) {
  const all = tokens(name);
  if (!all.length) return true;
  return all.every((t) => LABEL_WORDS.has(t) || /^\d+$/.test(t));
}

/**
 * Is what Google found the place the reply named?
 *
 * Every word of the reply's name has to be in Google's, or every word of
 * Google's in the reply's. "Loews Royal Pacific" finds "Loews Royal Pacific
 * Resort at Universal Orlando" and passes; "Blue Door" finding "Blue Door
 * Dental" passes too, which is why the area and the distance checks exist.
 * "Rainy day pick" finding "Rainy Day Laundromat" never gets this far.
 */
export function sameName(asked, found) {
  const a = tokens(asked);
  const b = tokens(found);
  if (!a.length || !b.length) return false;
  const inB = new Set(b);
  const inA = new Set(a);
  if (b.every((t) => inA.has(t))) return true;
  if (!a.every((t) => inB.has(t))) return false;
  // One word is too little to vouch for a longer name: "The Optimist" is not
  // "Optimist Hall". It may only gain words that say what sort of place it is.
  if (a.length > 1) return true;
  return b.every((t) => inA.has(t) || SORT_WORDS.has(t));
}

// What a place's own name adds to say what it is: "Mokuleia" and "Mokuleia
// Beach Park" are one place, "Optimist" and "Optimist Hall" are two.
const SORT_WORDS = new Set(
  (
    "restaurant restaurants bar grill kitchen cafe coffee bakery tavern pub " +
    "bistro brasserie trattoria cantina diner eatery hotel resort inn lodge " +
    "suites spa park beach museum gallery garden gardens market trail falls " +
    "at of in on by"
  ).split(" "),
);

const EAT =
  /\b(eat|eating|ate|dinner|lunch|breakfast|brunch|restaurants?|food|foodie|meal|drinks?|bars?|coffee|cafes?|dessert|bakery|pizza|sushi|tacos?)\b/i;
const STAY =
  /\b(stay|staying|hotels?|resorts?|lodges?|lodging|rooms?|airbnb|vrbo|rentals?|inns?|sleep|nights?\s+in)\b/i;

/** What sort of card: taken from the question, since the reply names all sorts. */
export function kindFor(said) {
  const q = String(said || "");
  if (EAT.test(q)) return "eat";
  if (STAY.test(q)) return "stay";
  return "do";
}

function plain(text) {
  return String(text || "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The reason given for a name: the rest of its line, or its sentence. */
function reasonFor(text, raw, name) {
  const line =
    String(text || "")
      .split(/\n+/)
      .find((l) => l.includes(raw)) || "";
  // "**Name** — the reason" or "**Name:** the reason": the rest is the reason.
  const rest = line.slice(line.indexOf(raw) + raw.length);
  const after = plain(rest).replace(/^[\s:–—,.-]+/, "").trim();
  const separated = /^\s*[:–—-]/.test(rest) || /[:–—-]\s*$/.test(raw.slice(2, -2));
  if (separated && after.split(" ").length >= 4) return after;
  // The name in the middle of a sentence: the sentence is the reason.
  const sentence =
    plain(line)
      .split(/(?<=[.!?])\s+/)
      .find((s) => s.includes(name)) || plain(line);
  return sentence;
}

/**
 * The name in a bold phrase or heading, and where it is if the answer said.
 *
 * "Capt. Cook's (4.5 on Google) — Disney's Polynesian Village Resort" is a
 * name, an aside and a location in one line; the lookup wants the first and
 * the last, and the aside is never part of anybody's name.
 */
export function nameAndWhere(phrase) {
  const bare = String(phrase || "")
    .replace(/\*\*|__|`/g, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/\s*\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const [head, ...rest] = bare.split(/\s+[–—]\s+/);
  const clean = (t) => String(t || "").replace(/[\s:–—,.;!?-]+$/, "").trim();
  return { name: clean(head), where: clean(rest.join(" — ")) };
}

/** The reason under a heading: its first line of prose, label taken off. */
function reasonUnder(text, end) {
  for (const line of String(text || "").slice(end).split(/\n/)) {
    if (!line.trim() || /^\s*-{3,}\s*$/.test(line)) continue;
    if (/^\s*#/.test(line)) return "";
    return plain(line.replace(/^\s*(?:[-*•]\s*)?\*\*[^*\n]{1,40}?\*\*\s*/, ""));
  }
  return "";
}

/**
 * The names in a reply, as cards not yet looked up: bold phrases and headings,
 * in the order they appear. Labels, talk about ratings and points, repeats and
 * the trip's own destination are left out.
 */
export function namedInReply(text, { said = "", area = null } = {}) {
  const reply = String(text || "");
  const kind = kindFor(said);
  const places = [];
  const seen = new Set();
  const areaKey = fold(area);

  const found = [];
  for (const match of reply.matchAll(BOLD)) {
    found.push({ at: match.index, phrase: match[1], why: (name) => reasonFor(reply, match[0], name) });
  }
  for (const match of reply.matchAll(HEADING)) {
    const end = match.index + match[0].length;
    found.push({ at: match.index, phrase: match[1], why: () => reasonUnder(reply, end) });
  }
  // A bold phrase inside a heading is the heading's own name, seen twice.
  found.sort((a, b) => a.at - b.at);

  for (const item of found) {
    if (NOT_A_NAME.test(nameAndWhere(item.phrase).name)) continue;
    const { name, where } = nameAndWhere(item.phrase);
    if (!name || name.split(/\s+/).length > 8) continue;
    if (!/^[\p{Lu}\p{N}]/u.test(name)) continue;
    if (isLabel(name)) continue;
    const key = fold(name);
    if (seen.has(key) || (areaKey && key === areaKey)) continue;
    seen.add(key);
    const within = where && fold(where) !== areaKey ? where : "";
    const place = normalizePlace({
      name,
      kind,
      area: [within, area].filter(Boolean).join(", "),
      why: item.why(name),
    });
    if (place) places.push(place);
    if (places.length >= MOST) break;
  }
  return places;
}

/**
 * The same names, looked up and kept only where the lookup is convincing.
 * Returns [] whenever the model should be asked instead.
 *
 * lookUp is the place lookup, passed in so the tests can hand it a map.
 */
export async function cardsFromReply({
  text,
  said = "",
  area = null,
  here = null,
  lookUp = lookUpPlace,
  timeoutMs = 2500,
} = {}) {
  // Where to lean the search. The trip's destination, unless they asked about
  // what is near them or there is no trip open: somebody at home asking where
  // to eat at Epcot is asking about Orlando, not about their own street.
  const located = here && precise(here) ? here : null;
  const near = located && (!area || NEARBY.test(String(said || ""))) ? located : null;
  // Nowhere to lean on at all, and a name alone is anywhere in the world.
  if (!area && !near) return [];
  if (lookUp === lookUpPlace && !photosConfigured()) return [];
  const named = namedInReply(text, { said, area });
  if (named.length < FEWEST) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let found;
  try {
    found = await Promise.all(
      named.map((place) =>
        lookUp(place, { signal: controller.signal, bias: biasFor(near) }).catch(
          () => null,
        ),
      ),
    );
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }

  let kept = [];
  named.forEach((place, i) => {
    const extra = found[i];
    if (!extra || !sameName(place.name, extra.name)) return;
    const point =
      Number.isFinite(extra.lat) && Number.isFinite(extra.lon)
        ? { lat: extra.lat, lon: extra.lon }
        : null;
    if (near && (!point || haversineKm(near, point) > NEAR_KM)) return;
    kept.push({
      ...place,
      photo: extra.photo || null,
      website: extra.website || place.website,
      rating: extra.rating ?? place.rating,
      ratingCount: extra.ratingCount ?? null,
      address: extra.address || null,
      lat: point ? point.lat : null,
      lon: point ? point.lon : null,
      // Already looked up: the route does not look it up again.
      looked: true,
    });
  });

  // One of them on the far side of the country is a namesake, not a pick.
  const middle = biasPoint(
    kept.filter((p) => Number.isFinite(p.lat)).map((p) => ({ lat: p.lat, lon: p.lon })),
  );
  if (middle) {
    kept = kept.filter(
      (p) => !Number.isFinite(p.lat) || haversineKm(middle, p) <= TOGETHER_KM,
    );
  }
  return kept.length >= FEWEST ? kept : [];
}
