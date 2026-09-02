// Recommendations you can look at, not just read.
//
// A paragraph naming five restaurants is a research task handed back to the
// person who asked: they still have to type each name into Maps, work out where
// it is, decide whether it looks right, and then come back and dictate the one
// they chose. So a recommendation is a card - a photo, where it is, why it was
// suggested, a link to the place itself, a link to the map, and a button that
// puts it on the itinerary.
//
// The model fills these in by calling show_places. Nothing here writes anything:
// a card is an answer, not a change, and it goes nowhere near the confirmation
// machinery. Picking one is what starts a change, and the person picks.

const KINDS = new Set(["eat", "stay", "do"]);

// What each kind is called in front of a human.
export const KIND_LABELS = {
  eat: "Place to eat",
  stay: "Place to stay",
  do: "Thing to do",
};

/**
 * Which list a place belongs on.
 *
 * A shortlist that is only the things this family would like leaves out the
 * thing the city is known for; a shortlist that is only the famous things is a
 * guidebook and could have been written for anybody. Both belong on the screen,
 * and the family should be able to see at a glance which is which -- "we picked
 * this because you rated the last one five stars" and "everybody goes here" are
 * different kinds of claim and should not be read off the same list.
 */
const GROUPS = new Set(["popular", "for_you"]);

/** The headings, in the order the lists appear. */
export const GROUP_ORDER = ["popular", "for_you"];

export const GROUP_LABELS = {
  popular: "Most popular",
  for_you: "For you",
};

// One short line under each heading, because two lists with no explanation
// invite the question of what the difference is, and the difference is the point.
export const GROUP_NOTES = {
  popular: "What the place is known for",
  for_you: "Picked from what the app knows about you",
};

const MAX_PLACES = 6;

function text(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * A link to the place on a map, without needing anyone's API key.
 *
 * Worth having even when a photo lookup is unavailable: it is one tap to
 * photos, hours, reviews and directions, from the app everyone already has.
 */
export function mapsLink(name, area) {
  const what = [text(name, 120), text(area, 80)].filter(Boolean).join(" ");
  if (!what) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(what)}`;
}

// A website the model volunteered. Only http(s), and never a Google redirect
// dressed up as the restaurant's own site.
function website(value) {
  const said = text(value, 300);
  if (!said) return null;
  let url;
  try {
    url = new URL(said);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (
    /(^|\.)(google\.com|googleusercontent\.com|vertexaisearch\.cloud\.google\.com)$/i.test(
      url.hostname,
    )
  ) {
    return null;
  }
  return url.toString();
}

function rating(value) {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n) || n <= 0 || n > 5) return null;
  return Math.round(n * 10) / 10;
}

/**
 * One place, cleaned up. Returns null when there is not enough to show.
 */
export function normalizePlace(raw) {
  if (!raw || typeof raw !== "object") return null;
  const name = text(raw.name, 120);
  if (!name) return null;
  const kind = KINDS.has(raw.kind) ? raw.kind : "do";
  const area = text(raw.area, 80);
  return {
    name,
    // Absent is allowed and common: a single ungrouped shortlist is still a fine
    // answer, and an older stored card has no group on it at all.
    group: GROUPS.has(raw.group) ? raw.group : null,
    kind,
    area: area || null,
    why: text(raw.why, 280) || null,
    // What this one gives up against the shortlist already on screen. Only ever
    // set on a second helping: the first set has nothing to be compared with,
    // and a drawback with nothing behind it reads as a reason not to go.
    tradeoff: text(raw.tradeoff, 240) || null,
    // Why this one may not suit them, on a set that was chosen without asking
    // whether it would. Only ever set on the alternatives: on an ordinary
    // shortlist every card was picked to fit, so a line about fit would be
    // manufactured doubt.
    misfit: text(raw.misfit, 240) || null,
    price: text(raw.price, 24) || null,
    // What a night costs on the family's own dates, and what that average is
    // over. A rate with no season attached is a number somebody made up, so the
    // two travel together and the card says so when the second one is missing.
    nightly: text(raw.nightly, 32) || null,
    nightlyBasis: text(raw.nightly_basis ?? raw.nightlyBasis, 48) || null,
    // A program the family is in, and what it gets them here. Claimed by the
    // model and NOT trusted: withPrograms checks it against their own rows and
    // removes both when it does not match one, because a perk that turns out not
    // to exist was a reason to book.
    program: text(raw.program, 60) || null,
    perk: text(raw.perk, 160) || null,
    rating: rating(raw.rating),
    website: website(raw.website),
    maps: mapsLink(name, area),
    // Filled in later, by whatever can find a picture. Absent is a fine answer:
    // a photograph of the wrong building is worse than no photograph.
    photo: null,
  };
}

/**
 * The places from one show_places call: cleaned, deduplicated by name, capped.
 */
export function normalizePlaces(args) {
  const list = Array.isArray(args?.places) ? args.places : [];
  const seen = new Set();
  const places = [];
  for (const raw of list) {
    const place = normalizePlace(raw);
    if (!place) continue;
    const key = place.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    places.push(place);
    if (places.length >= MAX_PLACES) break;
  }
  return places;
}

/**
 * Words that do not distinguish one place from another.
 *
 * A model asked twice about the same trip does not repeat itself exactly. It
 * offers "Quinta da Regaleira" and then "Quinta da Regaleira Guided Tour",
 * "Livraria Bertrand" and then "Livraria Bertrand - Chiado", "Benagil Cave &
 * Dolphin Watching Boat Tour" and then "Private Dolphin & Cave Cruise". Those
 * are one place each. Matching on the exact name leaves all three pairs on
 * screen twice, which is what the family sees.
 */
const NOT_THE_PLACE = new Set([
  "a",
  "an",
  "and",
  "at",
  "boat",
  "by",
  "centre",
  "center",
  "cruise",
  "da",
  "de",
  "do",
  "dos",
  "e",
  "el",
  "experience",
  "from",
  "guided",
  "in",
  "la",
  "las",
  "los",
  "of",
  "on",
  "private",
  "ride",
  "riding",
  "the",
  "tickets",
  "tour",
  "tours",
  "trip",
  "visit",
  "y",
]);

/** The part of a name that actually names the place. */
function nameTokens(name) {
  return new Set(
    String(name || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word && !NOT_THE_PLACE.has(word)),
  );
}

/**
 * Two names for the same place.
 *
 * One being contained in the other is the shape this takes -- an added district,
 * an added "Guided Tour", a dropped "Private" -- so a subset is a match. Two
 * significant words are required before that counts, or every "Lisbon X" would
 * swallow every other "Lisbon Y".
 */
function samePlace(a, b) {
  const one = nameTokens(a);
  const two = nameTokens(b);
  const [small, big] = one.size <= two.size ? [one, two] : [two, one];
  if (small.size < 2)
    return small.size === 1 && big.size === 1 && [...small][0] === [...big][0];
  for (const word of small) if (!big.has(word)) return false;
  return true;
}

/**
 * One shortlist out of two, without the same place on it twice.
 *
 * Whichever name arrived first is the one kept, because it is the one already
 * spoken about; anything the second one knew that the first did not is filled in
 * behind it.
 */
export function mergePlaces(first, second) {
  const places = [];
  for (const place of [].concat(first || [], second || [])) {
    if (!place?.name) continue;
    const already = places.find((kept) => samePlace(kept.name, place.name));
    if (already) {
      for (const field of [
        "why",
        "tradeoff",
        "misfit",
        "area",
        "group",
        "price",
        // A second call about the same hotel often carries the number the first
        // one left out, which is the whole reason a shortlist gets asked twice.
        "nightly",
        "nightlyBasis",
        "program",
        "perk",
        "photo",
        "website",
        "rating",
      ]) {
        if (
          already[field] === null ||
          already[field] === undefined ||
          already[field] === ""
        ) {
          already[field] = place[field] ?? already[field];
        }
      }
      continue;
    }
    places.push({ ...place });
    if (places.length >= MAX_PLACES) break;
  }
  return places;
}

/**
 * The shortlist as the lists it should be read as.
 *
 * Returns one unlabeled group when there is nothing to split: everything in one
 * group, or no groups at all. A lone "For you" heading is worse than no heading,
 * because it says a "Most popular" list exists somewhere and was withheld.
 */
export function groupPlaces(places) {
  const list = (Array.isArray(places) ? places : []).filter((p) => p?.name);
  if (!list.length) return [];
  const held = GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    note: GROUP_NOTES[group],
    places: list.filter((place) => place.group === group),
  })).filter((section) => section.places.length);
  // Anything the model left ungrouped, or grouped as something we do not know,
  // is still an answer and is shown rather than dropped.
  const loose = list.filter((place) => !GROUPS.has(place.group));
  if (held.length < 2) {
    return [{ group: null, label: null, note: null, places: list }];
  }
  if (loose.length) {
    held.push({
      group: null,
      label: "Also worth a look",
      note: null,
      places: loose,
    });
  }
  return held;
}

/**
 * Pull the show_places calls out of a model reply.
 *
 * They are separated before anything else looks at the calls, because every other
 * tool describes a change to the family's data and this one describes an answer.
 * Letting it through the validator would file it as a proposal nobody asked for.
 */
export function splitPlaceCalls(calls) {
  const kept = [];
  let places = [];
  for (const call of Array.isArray(calls) ? calls : []) {
    if (call?.name === "show_places") {
      places = places.concat(normalizePlaces(call.args));
    } else if (call) {
      kept.push(call);
    }
  }
  // Two calls in one reply - eating and doing, say - are one shortlist.
  return { calls: kept, places: places.slice(0, MAX_PLACES) };
}

/**
 * What tapping "Tell me more" should ask on the family's behalf.
 *
 * A card is a shortlist entry, not an answer about the place: three lines about
 * why it suits them is where the interest starts rather than where it ends. This
 * asks the question they would otherwise type out one-fingered.
 */
export function moreRequest(place) {
  const name = text(place?.name, 120);
  if (!name) return "";
  const where = text(place?.area, 80);
  return `Tell me more about ${name}${where ? ` in ${where}` : ""} — what it is like, what it costs, whether it needs booking, and anything that would put us off.`;
}

// Somewhere to go, sleep or eat. The nouns are what makes a question a shortlist
// question; the verbs alone are not enough, because "what should we book first"
// is asking to be advised about places without asking for any more of them.
const PLACE_NOUN =
  /\b(eat|eating|dine|dining|dinner|lunch|breakfast|brunch|food|restaurant|restaurants|cafe|cafes|bar|bars|stay|stays|staying|sleep|hotel|hotels|resort|resorts|lodge|lodges|inn|airbnb|rental|to do|to see|worth seeing|visit|attraction|attractions|activity|activities|excursion|excursions|tour|tours|museum|museums|beach|beaches|hike|hikes|park|parks|sight|sights|nearby|around here)\b/i;

// Wanting to be shown some. "Where", "what is there", "recommend", "any good".
const PLACE_ASK =
  /\b(where|what else|whats there|what is there|anything else|recommend|recommends|recommendation|recommendations|suggest|suggestion|suggestions|ideas|options|find|show|any good|worth (a )?(visit|going|seeing)|best)\b/i;

// Questions that are about the plan rather than about places, and which come
// back with places named in the prose anyway. "What should we book first" is the
// one that started this: it answers with hotels, so cards appear under it, and a
// "Find more" button under that reads as an offer of more hotels when what was
// asked was in which order to book the ones they have.
const NOT_A_SHORTLIST =
  /\b(book (first|next)|what to book|in what order|what order|priority|prioriti[sz]e|how far ahead|how far in advance|when should we book|deadline|budget|how much (have|are) we|cost so far|total cost)\b/i;

/**
 * Was that question asking to be shown places?
 *
 * Only those get "Find more" underneath the cards. Everything else that happens
 * to produce cards -- what to book first, how the week is shaping up, what a
 * day costs -- has places in it without being a request for more of them, and an
 * offer of a second helping there is answering a question nobody asked.
 */
export function asksForPlaces(said) {
  const text = String(said == null ? "" : said).trim();
  if (!text) return false;
  // A second helping should still offer a third, and these are the exact
  // sentences the two buttons under a shortlist send.
  if (/^find me more\b/i.test(text)) return true;
  if (/^show me the highest regarded\b/i.test(text)) return true;
  if (NOT_A_SHORTLIST.test(text)) return false;
  // A question can be the noun phrase on its own -- "Things to do near Ponta da
  // Piedade?" asks for a shortlist without containing a single asking word.
  if (
    /^(things to do|places to (eat|stay|visit|go|see)|somewhere to (eat|stay|go)|more (places|options|ideas))\b/i.test(
      text,
    )
  )
    return true;
  return PLACE_NOUN.test(text) && PLACE_ASK.test(text);
}

/** What a set of cards is a set of, said the way a person would say it. */
const KIND_PHRASES = {
  eat: "places to eat",
  stay: "places to stay",
  do: "things to do",
};

function kindsOf(places) {
  const held = new Set(
    (Array.isArray(places) ? places : [])
      .map((place) => (KINDS.has(place?.kind) ? place.kind : null))
      .filter(Boolean),
  );
  // Same order every time, so the sentence does not depend on which card the
  // model happened to put first.
  return ["eat", "stay", "do"].filter((kind) => held.has(kind));
}

function joinWords(parts) {
  if (parts.length <= 1) return parts[0] || "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * What tapping "Find more" should ask on the family's behalf.
 *
 * A shortlist of six is a shortlist of six. What people do next is not pick one
 * of them -- it is ask whether that was really everything, which they were
 * having to type out while listing the places they had already been shown so as
 * not to get them back.
 *
 * The button belongs to the list it sits under and to nothing else. Ask where
 * to stay, get six resorts, then later ask what there is to do and get six
 * activities: the button under the activities is asking for more activities.
 * It used to read the whole conversation for both halves of the question, so
 * it saw two kinds of card, could not name either, asked for more "options" --
 * and then handed the model a list of resort names as the things to avoid. The
 * model did as it was told and found more resorts, under a list of things to
 * do. So what is being asked for comes from this list alone.
 *
 * What is already on screen still matters for the other half: press the button
 * twice and the second helping has to avoid the first helping as well, or the
 * third set is the first set again. But only the cards of the kinds being asked
 * about are named -- the resorts have nothing to do with a question about
 * things to do, and naming them there is how the question got confused in the
 * first place.
 *
 * The interesting half of the question is the last sentence. A second helping
 * of recommendations is by construction the stuff that did not make the first
 * cut, and offered without that said out loud it reads as six more equally good
 * ideas -- so the family works through a longer list with no way of telling why
 * anything on it was held back. So each new one has to say what it gives up.
 * And she is told, in as many words, that "the first set was the best of them"
 * is a permitted answer, because otherwise the model will always find six more.
 *
 * @param {object[]} shown  every place already on screen in this conversation
 * @param {object[]} [from] the list the button sits under; defaults to all of them
 */
export function findMoreRequest(shown, from) {
  const all = Array.isArray(shown) ? shown : [];
  const list = Array.isArray(from) && from.length ? from : all;
  const kinds = kindsOf(list);
  const what = kinds.length
    ? joinWords(kinds.map((kind) => KIND_PHRASES[kind]))
    : "things to do";
  // The list itself, plus anything of the same kind from earlier in the
  // conversation. A resort shown an hour ago is not a candidate answer to
  // "more things to do", so it is not named as one.
  const wanted = new Set(kinds);
  const names = Array.from(
    new Set(
      list
        .concat(all.filter((place) => wanted.has(place?.kind)))
        .map((place) => text(place?.name, 120))
        .filter(Boolean),
    ),
  );
  const not = names.length
    ? ` Not ${names.join(", ")}, or anything else of that sort already on screen.`
    : "";
  return `Find me more ${what} — the same sort of thing as the list you just showed me, and nothing else.${not} For each new one, say plainly what it gives up compared with the ones you showed me first — what is worse about it, not another reason it is good. And if the first set really was the best of them, say that instead of finding six more.`;
}

/**
 * What tapping "Highly rated anyway" should ask on the family's behalf.
 *
 * Everything else the app shows has been through the family first. The
 * preferences, the roster, the reviews they left, the pattern of what they
 * booked before -- every shortlist is filtered by all of it, and that is
 * usually right. It also means a family who once said "no long drives" is never
 * again shown the thing an hour away that everybody who goes there says is the
 * best day of the trip. They do not know they are not being shown it. A filter
 * nobody can see is a decision nobody made.
 *
 * So this asks the opposite question: what would you tell anyone, if you had
 * never heard of us? Chosen on reputation alone, ranked as the place itself
 * ranks them.
 *
 * The point is not the list, though. It is the line under each one saying which
 * of their own preferences it cuts against -- "this is the two-hour drive you
 * said you did not want", "this is the tasting menu and Veda is eleven". That
 * turns a list of things they were being protected from into a set of decisions
 * they get to make, which is the only reason to show it at all. And where a
 * place turns out to suit them perfectly well, it has to say so plainly rather
 * than inventing a doubt to fill the line.
 *
 * @param {object[]} shown  every place already on screen in this conversation
 * @param {object[]} [from] the list the button sits under; defaults to all of them
 */
export function alternativesRequest(shown, from) {
  const all = Array.isArray(shown) ? shown : [];
  const list = Array.isArray(from) && from.length ? from : all;
  const kinds = kindsOf(list);
  const what = kinds.length
    ? joinWords(kinds.map((kind) => KIND_PHRASES[kind]))
    : "things to do";
  const wanted = new Set(kinds);
  const names = Array.from(
    new Set(
      list
        .concat(all.filter((place) => wanted.has(place?.kind)))
        .map((place) => text(place?.name, 120))
        .filter(Boolean),
    ),
  );
  const not = names.length ? ` Not ${names.join(", ")}.` : "";
  return `Show me the highest regarded ${what} here — the ones you would tell anybody about, chosen on reputation alone. Ignore our preferences, our reviews and who is on the roster when you choose them; pick what the place is actually known for and rank them the way they are ranked.${not} Then, for each one, set misfit to one plain sentence saying which of our own preferences or circumstances it cuts against, naming the preference — and if it does in fact suit us perfectly well, say that instead of inventing a doubt. Do not set tradeoff on these.`;
}

/** What tapping "Add to itinerary" should say on the family's behalf. */
export function addRequest(place) {
  const name = text(place?.name, 120);
  if (!name) return "";
  const where = text(place?.area, 80);
  const what =
    place?.kind === "stay"
      ? "as where we are staying"
      : place?.kind === "eat"
        ? "as a meal"
        : "as an activity";
  return `Add ${name}${where ? ` (${where})` : ""} to the itinerary ${what}. Ask me which day if you are not sure.`;
}
