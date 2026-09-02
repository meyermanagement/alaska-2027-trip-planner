/**
 * What the trip itself now says, as against what the family said at the start.
 *
 * The six answers a trip is made of are text a person typed, or dictated, before
 * anything existed. Then the trip gets built, and some of those answers stop
 * being the plan and start being a memory of one. Portugal Spring 2027 said "One
 * apartment in Lisbon for the whole stay"; the days now hold Herdade da
 * Malhadinha Nova in the Alentejo for two nights and Vila Vita Parc in the
 * Algarve for four. Not an apartment, not Lisbon, not the whole stay, and two
 * places rather than one -- yet the card went on presenting the apartment as the
 * current answer, because a text column has no idea what happened after it was
 * written.
 *
 * This module reads the itinerary and says what three of the six would say if
 * they were derived from the trip rather than remembered. Three, not six: where
 * you sleep, how you get there and how you get around are all things the days
 * name outright. What you do is a judgment about which of eleven activities
 * mattered, and where and when are already the trip's own fields. Deriving those
 * would be inventing an answer rather than reading one.
 *
 * Nothing here writes. Overwriting the family's own words automatically is the
 * one thing this must not do: "one apartment, we do not want to move" survives
 * being outvoted by two hotels, because it says something true about them that
 * the hotels do not. So this reports the disagreement and the screen shows both.
 *
 * Two things do not count as what the trip has become, both learned the hard
 * way on Maui January 2027:
 *
 *   - A row Aly merely thought of. 'optional' means, in the app's own words,
 *     "anything you thought of rather than the family deciding on it". A draft
 *     whose whole week Aly sketched out must not then turn round and tell the
 *     family their own answers are out of date; the trip has not become
 *     anything yet, it has been offered something.
 *   - The journey out and the journey home, when the question is how you get
 *     around once you are there. Maui said "Rent a car (essential for Road to
 *     Hana and resort exploring)" -- exactly right -- and the days held two
 *     transport rows, "Arrive in Maui & Check-In" on the first day and
 *     "Check-Out & Departure" on the last. Read literally they named nothing
 *     the answer mentioned, so the screen struck the car rental through and
 *     offered to replace it with the two bookends joined by an "and". Every
 *     trip begins and ends with a movement; they say nothing whatever about
 *     how a family moves about in between.
 */

/** Trimmed text, or "" for anything empty. */
function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/** Nights between two ISO dates, or 0 when either is missing or backwards. */
export function nightsBetween(startISO, endISO) {
  const a = Date.parse(`${clean(startISO)}T00:00:00Z`);
  const b = Date.parse(`${clean(endISO)}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * The useful half of a location.
 *
 * "Albernoa, Alentejo, Portugal" is the whole address and "Alentejo" is what
 * somebody means when they ask where you are staying. The country is dropped
 * because a trip already knows which one it is in, and the street is dropped
 * because nobody weighs a hotel by its street.
 */
export function areaOf(location) {
  const parts = clean(location)
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  // Second from last: the region, with the country after it.
  return parts[parts.length - 2];
}

/**
 * A movement that is the trip starting or the trip ending.
 *
 * Two tests, because either alone leaves a hole. The dates catch "Drive Home to
 * St. Louis" and "Arrive in Maui & Check-In", which say nothing a pattern could
 * find but sit on the only two days where a transport row is a foregone
 * conclusion. The words catch an airport transfer booked for the day after
 * landing, which the dates would miss. Neither test touches Alaska's "Disembark
 * and motorcoach to Denali" -- that one happens in the middle of the trip and is
 * genuinely how that family crosses the state.
 */
const BOOKEND_WORDS =
  /\barriv|\bdepart|check[-\s]?in|check[-\s]?out|airport transfer|transfer (?:to|from) (?:the )?airport/i;

function isBookend(item, trip) {
  if (BOOKEND_WORDS.test(clean(item.title))) return true;
  const date = clean(item.item_date);
  if (!date) return false;
  return date === clean(trip?.start_date) || date === clean(trip?.end_date);
}

const OF_INTEREST = {
  staying: ["lodging"],
  // A cruise is both: it is how they get there and where they sleep. It is
  // listed here as travel because "we are sailing" is the more surprising fact
  // about a trip, and a cruise's own screen already covers the cabin.
  getting_there: ["flight", "cruise"],
  getting_around: ["transport"],
};

/**
 * Statuses that mean somebody decided. 'needs_booking' is in: the family chose
 * it and it merely has not been arranged yet -- Portugal's two hotels sit there.
 * 'optional' and 'cancelled' are out; one was never chosen, the other was
 * un-chosen.
 */
const DECIDED = ["confirmed", "planned", "needs_booking"];

function itemsFor(items, basic, trip) {
  const wanted = OF_INTEREST[basic];
  if (!wanted) return [];
  return (
    (Array.isArray(items) ? items : [])
      .filter((i) => wanted.includes(clean(i.category)))
      .filter((i) => DECIDED.includes(clean(i.status)))
      .filter((i) => clean(i.title))
      // How you get around is a question about the middle of a trip.
      .filter((i) => basic !== "getting_around" || !isBookend(i, trip))
      .slice()
      .sort((a, b) => clean(a.item_date).localeCompare(clean(b.item_date)))
  );
}

/**
 * One stay, described the way somebody would say it out loud.
 *
 * The nights matter more than the dates. "Vila Vita Parc, 4 nights" is the fact
 * you weigh; "2027-06-02 to 2027-06-06" is the same fact with arithmetic left
 * for the reader.
 */
function stayPhrase(item) {
  const nights = nightsBetween(item.item_date, item.end_date);
  const area = areaOf(item.location);
  const bits = [];
  if (nights) bits.push(`${nights} night${nights === 1 ? "" : "s"}`);
  if (area) bits.push(area);
  return bits.length
    ? `${clean(item.title)} (${bits.join(", ")})`
    : clean(item.title);
}

/**
 * What the days say about one of the six, or "" when they say nothing.
 *
 * Written as a sentence fragment that can sit where the family's own answer sits,
 * so the two can be read against each other without a change of register.
 */
export function settledText(items, basic, trip) {
  const rows = itemsFor(items, basic, trip);
  if (rows.length === 0) return "";
  if (basic === "staying") {
    const phrases = rows.map(stayPhrase);
    if (phrases.length === 1) return phrases[0];
    // "then" rather than a comma: the order is the point when a family moves
    // between two hotels, and a comma reads like a choice between them.
    return phrases.join(", then ");
  }
  const titles = [...new Set(rows.map((r) => clean(r.title)))];
  if (titles.length === 1) return titles[0];
  const last = titles.pop();
  return `${titles.join(", ")} and ${last}`;
}

/** How many things the days name for this one. */
export function settledCount(items, basic, trip) {
  return itemsFor(items, basic, trip).length;
}

/** The rows themselves, for a screen that wants to link to them. */
export function settledItems(items, basic, trip) {
  return itemsFor(items, basic, trip);
}

/**
 * Whether the days contradict the answer, and in what way.
 *
 * Deliberately conservative, because a false disagreement is much worse than a
 * missed one: telling somebody their own answer is out of date when it is not is
 * how a screen loses the right to say it at all. Two tests, both of which have
 * to be a plain contradiction rather than a difference of wording:
 *
 *   - The days name a place the answer does not mention. "One apartment in
 *     Lisbon" against Malhadinha Nova and Vila Vita Parc: neither appears, so
 *     the answer is about something else entirely.
 *   - The answer counts, and the count is wrong. "One hotel the whole time"
 *     against two stays is a contradiction even if both are named.
 *
 * A missing answer never disagrees -- there is nothing to disagree with -- and
 * neither does a missing itinerary.
 */
const NUMBER_WORDS = {
  one: 1,
  1: 1,
  a: 1,
  single: 1,
  two: 2,
  2: 2,
  three: 3,
  3: 3,
  four: 4,
  5: 5,
  five: 5,
};

export function statedCount(answer) {
  const text = clean(answer).toLowerCase();
  // Only a number that is actually counting places. "one apartment", "two
  // hotels", "a condo" -- not "one good dinner" and not a street number.
  const m = text.match(
    /\b(one|two|three|four|five|a|single|\d)\s+(?:\w+\s+){0,2}?(apartment|apartments|hotel|hotels|condo|condos|resort|resorts|rental|rentals|place|places|house|houses|villa|villas|airbnb|flat|flats|room|rooms|lodge|lodges|inn|inns)\b/,
  );
  if (!m) return null;
  const n = NUMBER_WORDS[m[1]];
  return Number.isFinite(n) ? n : null;
}

function unnamedWhy(basic, count) {
  const thing =
    basic === "getting_around"
      ? count === 1
        ? "a way of getting about"
        : `${count} ways of getting about`
      : count === 1
        ? "somewhere"
        : `${count} places`;
  return `The days name ${thing} this answer does not mention.`;
}

export function settledDisagreement(trip, items, basic) {
  const answer = clean(trip?.[basic]);
  const rows = itemsFor(items, basic, trip);
  if (!answer || rows.length === 0) return null;

  const said = answer.toLowerCase();
  const named = rows.filter((r) => {
    const title = clean(r.title).toLowerCase();
    if (!title) return false;
    if (said.includes(title)) return true;
    // A hotel called "Vila Vita Parc" is often written as "Vila Vita" -- match
    // on the distinctive opening rather than demanding the full trading name.
    const head = title
      .split(/[\s,–-]+/)
      .slice(0, 2)
      .join(" ");
    return head.length >= 6 && said.includes(head);
  });

  if (named.length === 0) {
    return {
      basic,
      reason: "unnamed",
      text: settledText(items, basic, trip),
      count: rows.length,
      // Said plainly, because the screen has to justify contradicting somebody.
      // A stay is somewhere and a movement is a way of getting about, and
      // calling either one the other is how a true sentence still reads wrong.
      why: unnamedWhy(basic, rows.length),
    };
  }

  const stated = statedCount(answer);
  if (stated !== null && stated !== rows.length) {
    return {
      basic,
      reason: "count",
      text: settledText(items, basic, trip),
      count: rows.length,
      why: `This answer is about ${stated}, and the days hold ${rows.length}.`,
    };
  }

  return null;
}

/**
 * A sentence handed to Aly when somebody presses the button.
 *
 * The button does not write. It says, in the family's own voice, what they want,
 * and Aly proposes the change with a confirmation card -- the same path as a
 * recommendation card and as a typed sentence, so there is one way a trip
 * changes rather than three. It names the old answer as well as the new one
 * because the old one is what she is replacing, and being explicit about that is
 * what stops her writing a summary of both.
 */
export function adoptRequest(trip, items, basic, label) {
  const answer = clean(trip?.[basic]);
  const text = settledText(items, basic, trip);
  if (!text) return "";
  return `On ${clean(trip?.name) || "this trip"}, ${label.toLowerCase()} still says "${answer}", but the days now hold ${text}. Update the answer to match the days.`;
}
