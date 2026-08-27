// What counts as a pro tip, and what gets thrown away.
//
// A tip is advice the family did not ask for, which is a high bar: unsolicited
// advice that is obvious, generic, or already on their list is worse than
// silence, because after two of those nobody reads the third. So the model is
// asked for tips and this file is what decides whether any of them survive. It
// is allowed - expected, most days - to return nothing at all.
//
// Three rules do most of the work:
//
//   1. A tip has to say why it applies to this family. The model is required to
//      fill in `because`, naming the preference, the review, the date, the
//      roster fact or the itinerary item that makes the advice worth reading. No
//      reason, no tip. That single requirement kills most travel-blog filler,
//      because "book excursions early" has no because and "you gave the Skagway
//      train 5 stars in 2019, and the 2027 sailing docks there on a Sunday" does.
//   2. A tip that repeats something already written down is dropped. If the task
//      list already says renew the passports, being told to renew the passports
//      is not a tip, it is an echo.
//   3. A tip with a date that has passed is dropped rather than shown late.
//
// Everything here is pure so it can be tested without a model or a database.

export const URGENCIES = ["now", "soon", "whenever"];
export const SCOPES = ["trip", "item", "packing"];

const TITLE_MIN = 6;
const TITLE_MAX = 90;
const BODY_MIN = 40;
const BODY_MAX = 600;
const BECAUSE_MIN = 12;
// Three per place at most. A screen with six tips on it is a screen nobody reads.
export const MAX_PER_SCOPE = 3;
// How near a date has to be before it interrupts you at the top of every screen.
export const BANNER_DAYS = 14;
export const MAX_IN_BANNER = 3;

// Advice with no content at all: no object, no place, no number, nothing to do
// differently. This list is deliberately short, and it started out three times
// longer. "Download the offline maps" was on it, and so was the passport window,
// until both turned up as the examples of what this feature is for — which is the
// lesson. Whether a tip is filler is not a property of its opening words. "Bring
// a converter" is filler; "the hairdryer on your list will not survive 230 volts"
// is the same subject and is the best tip in the app. So the work of separating
// them is done by the `because` requirement, which the first cannot satisfy and
// the second satisfies by construction, and this list only catches sentences that
// could be printed on a bookmark.
const FILLER = [
  /^(?:be sure to |remember to |don't forget to )?(?:have fun|enjoy)\b/i,
  /^stay hydrated\b/i,
  /^pack light\b/i,
  /^be flexible\b/i,
  /^plan ahead\b/i,
  /^book (?:early|ahead|in advance)\.?$/i,
  /^check the weather\.?$/i,
  /^arrive early\.?$/i,
];

const text = (value) => (typeof value === "string" ? value.trim() : "");

/** Words only, lowercase, single-spaced — for comparing two bits of advice. */
export function normalize(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The identity of a tip, so the same advice cannot arrive twice.
 *
 * Scope and place are in it because the same sentence is a different tip on a
 * different trip. The title is in it and the body is not, so a model rephrasing
 * yesterday's tip still collides with yesterday's tip. Stored unique per family,
 * which is what makes clearing something permanent: the next run generates the
 * same fingerprint, the insert is refused, and the tip stays gone.
 */
export function fingerprintOf(tip) {
  const place = tip.itinerary_item_id || tip.trip_id || "family";
  return `${tip.scope || "trip"}:${place}:${normalize(tip.title).slice(0, 70)}`;
}

function isFiller(tip) {
  const head = `${text(tip.title)} ${text(tip.body).slice(0, 60)}`;
  return (
    FILLER.some((pattern) => pattern.test(text(tip.title))) ||
    FILLER.some((pattern) => pattern.test(head.trim()))
  );
}

/** An ISO date, or null. Anything the model invents that is not one is dropped. */
function isoDate(value) {
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : raw;
}

/**
 * Turn whatever the model returned into tips worth showing, or into nothing.
 *
 * @param {object} input
 * @param {Array} input.candidates  parsed JSON from the model
 * @param {string} input.today      ISO date
 * @param {object} input.place      {family_id, trip_id, itinerary_item_id, scope}
 * @param {string[]} input.avoid    things already written down - task titles,
 *                                  packing items, note titles - which a tip may
 *                                  not simply restate
 * @param {string[]} input.known    fingerprints already in the database,
 *                                  whatever their status, so cleared and
 *                                  advice they put away does not come back
 * @param {Array} input.sources     [{title, url}] the pages behind the answer
 * @param {string} input.model
 * @param {boolean} input.searched
 * @returns {{tips: Array, dropped: Array}} dropped carries a reason each, which
 *   is the only way to tell "the model said nothing useful" from "the model said
 *   nothing", and the two want different words on screen
 */
export function acceptTips({
  candidates,
  today,
  place,
  avoid = [],
  known = [],
  sources = [],
  model = null,
  searched = false,
}) {
  const tips = [];
  const dropped = [];
  const seen = new Set(known);
  const avoidSet = new Set(avoid.map(normalize).filter(Boolean));

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const title = text(candidate?.title);
    const body = text(candidate?.body);
    const because = text(candidate?.because);
    const reject = (reason) =>
      dropped.push({ title: title || "(untitled)", reason });

    if (title.length < TITLE_MIN || title.length > TITLE_MAX) {
      reject("the title is missing or the wrong length");
      continue;
    }
    if (body.length < BODY_MIN || body.length > BODY_MAX) {
      reject("the tip itself is missing or the wrong length");
      continue;
    }
    if (because.length < BECAUSE_MIN) {
      reject("it does not say what about this family makes it apply");
      continue;
    }
    if (isFiller(candidate)) {
      reject("it is advice that would be true of any trip");
      continue;
    }
    const normTitle = normalize(title);
    if (avoidSet.has(normTitle)) {
      reject("it repeats something already on the list");
      continue;
    }
    const actBy = isoDate(candidate?.act_by);
    if (candidate?.act_by && !actBy) {
      reject("the date it gave is not a date");
      continue;
    }
    if (actBy && today && actBy < today) {
      reject("the day to act on it has already passed");
      continue;
    }
    const urgency = URGENCIES.includes(text(candidate?.urgency))
      ? text(candidate.urgency)
      : "whenever";

    const tip = {
      family_id: place.family_id,
      trip_id: place.trip_id || null,
      itinerary_item_id: place.itinerary_item_id || null,
      scope: SCOPES.includes(place.scope) ? place.scope : "trip",
      title,
      body,
      because,
      urgency,
      act_by: actBy,
      sources: Array.isArray(sources) ? sources.slice(0, 6) : [],
      model,
      searched: Boolean(searched),
      status: "active",
    };
    tip.fingerprint = fingerprintOf(tip);
    if (seen.has(tip.fingerprint)) {
      reject("it has been offered before");
      continue;
    }
    seen.add(tip.fingerprint);
    tips.push(tip);
  }

  // Best first, then cut. Ranking before the cap means a dated tip beats a vague
  // one for the last slot rather than losing it to whatever the model listed first.
  tips.sort(compareTips);
  const kept = tips.slice(0, MAX_PER_SCOPE);
  for (const extra of tips.slice(MAX_PER_SCOPE)) {
    dropped.push({
      title: extra.title,
      reason: "there were already three better ones",
    });
  }
  return { tips: kept, dropped };
}

const URGENCY_RANK = { now: 0, soon: 1, whenever: 2 };

/**
 * The order tips are read in: soonest deadline first, then how pressing, then
 * alphabetically so two runs over the same data agree.
 */
export function compareTips(a, b) {
  const dateA = a.act_by || "";
  const dateB = b.act_by || "";
  if (dateA && dateB && dateA !== dateB) return dateA < dateB ? -1 : 1;
  if (dateA && !dateB) return -1;
  if (!dateA && dateB) return 1;
  const rank = (URGENCY_RANK[a.urgency] ?? 2) - (URGENCY_RANK[b.urgency] ?? 2);
  if (rank) return rank;
  return String(a.title).localeCompare(String(b.title));
}

/** Days from `today` to `iso`, negative once the day has passed. */
export function daysBetween(today, iso) {
  if (!today || !iso) return null;
  const from = Date.parse(`${today}T00:00:00Z`);
  const to = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86400000);
}

/**
 * Which tips have earned a place at the top of every screen.
 *
 * Only two things qualify: a tip the model marked as needing action now, and a
 * tip with a date inside the next fortnight. Everything else waits on the screen
 * it belongs to. The banner is the most expensive space in the app - it is in
 * front of you whatever you came to do - so the test is whether you would want
 * to be interrupted, not whether the tip is good.
 */
export function bannerTips(tips, today, limit = MAX_IN_BANNER) {
  const urgent = (tips || []).filter((tip) => {
    if (tip.status && tip.status !== "active") return false;
    const away = daysBetween(today, tip.act_by);
    if (away !== null && away <= BANNER_DAYS) return true;
    return tip.urgency === "now";
  });
  urgent.sort(compareTips);
  return urgent.slice(0, limit);
}

/** How a tip's timing reads on screen. */
export function tipWhen(tip, today) {
  const away = daysBetween(today, tip?.act_by);
  if (away !== null) {
    if (away < 0) return { label: "Was due", tone: "late" };
    if (away === 0) return { label: "Today", tone: "now" };
    if (away === 1) return { label: "By tomorrow", tone: "now" };
    if (away <= BANNER_DAYS) return { label: `${away} days`, tone: "now" };
    return { label: "Later", tone: "soon" };
  }
  if (tip?.urgency === "now") return { label: "Worth doing now", tone: "now" };
  if (tip?.urgency === "soon") return { label: "Soon", tone: "soon" };
  return { label: "No rush", tone: "quiet" };
}
