// The pre-departure tasks a trip is not allowed to be missing.
//
// The packing floor next door guarantees the things that go in a bag. This
// guarantees the things that have to happen before anybody packs, and it exists
// because until now nothing in the app generated a task at all: the fifty-odd
// tasks on the family's trips were all either typed by hand, asked of Aly, or
// promoted from a pro tip somebody read. That works well for the tasks a person
// thinks of. It works not at all for the ones nobody thinks of until the card is
// declined in a taxi.
//
// Same discipline as the packing floor, for the same reasons:
//
//   - Driven by structured facts, never by reading the destination string.
//     leaves_country and the itinerary's own categories, nothing else.
//   - Silent about what it does not know. A trip whose facts have never been
//     researched does not get a currency task invented for it. It gets a task
//     asking the question, which is the honest version and is also the thing
//     that makes the next refresh able to answer it.
//   - Never duplicated. Every rule carries a predicate that recognizes its own
//     job already being on the list, matched against the title AND the detail of
//     every task including the finished ones. "Check in for each Southwest
//     flight 24 hours ahead" already exists on the Disney trip; the floor must
//     see that and stay quiet rather than filing a second one beside it.
//
// Nothing here asks a model. Given the same facts it produces the same tasks
// every time, which is the whole point of having it.

import { tripSignals } from "@/lib/packing/floor";

function list(values) {
  const rows = (values || [])
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  if (rows.length <= 1) return rows[0] || "";
  if (rows.length === 2) return `${rows[0]} and ${rows[1]}`;
  return `${rows.slice(0, -1).join(", ")} and ${rows[rows.length - 1]}`;
}

// Country names that take an article in a sentence. Without this the money task
// reads "what money you will need in Bahamas", which is the kind of small wrong
// note that makes a person trust the rest of the sentence less.
const ARTICLE_COUNTRIES = new Set([
  "bahamas",
  "gambia",
  "maldives",
  "netherlands",
  "philippines",
  "czech republic",
  "dominican republic",
  "united arab emirates",
  "united kingdom",
  "united states",
]);

function withArticle(name) {
  const clean = String(name || "").trim();
  if (!clean) return "";
  if (/^the /i.test(clean)) return clean;
  return ARTICLE_COUNTRIES.has(clean.toLowerCase()) ? `the ${clean}` : clean;
}

/** Countries other than the one they are leaving from, ready for a sentence. */
function abroad(facts) {
  return (facts?.countries || [])
    .map((c) => String(c || "").trim())
    .filter((c) => c && !/^united states$/i.test(c))
    .map(withArticle);
}

const RULES = [
  // Asked first, because it is the one task whose answer unlocks the others. A
  // trip with no fact sheet cannot be told whether it needs a passport, money,
  // or a word with the bank, and the app should say so rather than shrug.
  {
    id: "confirm_country",
    applies: (s) => s.international === null,
    already: (text) =>
      /leaves? the country|leaving the country|whether .{0,30}international|is this trip international/.test(
        text,
      ),
    rows: () => [
      {
        title: "Confirm whether this trip leaves the country",
        detail:
          "The app cannot tell yet whether any part of this trip crosses a border, and until it knows it will not put a passport on the packing list, work out what money to get, or say anything about roaming. Press Check for pro tips on this trip to have it researched, and check the answer yourself if the itinerary is still thin.",
        timing: "before_trip",
        priority: "high",
        assignee: "Shared",
      },
    ],
  },
  {
    id: "currency_unknown",
    applies: (s) => s.international === true && s.currencies === null,
    already: (text) => /currenc|what money|exchange rate/.test(text),
    rows: ({ facts }) => {
      const where = abroad(facts);
      return [
        {
          title: `Work out what money you will need${where.length ? ` in ${list(where)}` : " abroad"}`,
          detail:
            "The trip is known to leave the country, but not which money it needs. Some places take dollars happily and some do not, and the answer changes what you order from the bank. Press Check for pro tips on this trip and the app will research it.",
          timing: "before_trip",
          priority: "normal",
          assignee: "Shared",
        },
      ];
    },
  },
  {
    id: "currency_get",
    applies: (s) => s.international === true && (s.currencies?.length || 0) > 0,
    already: (text) =>
      /currenc|money exchange|exchange (some )?(money|cash)|get (some )?cash|order (some )?cash|\batm\b/.test(
        text,
      ),
    rows: ({ signals }) => {
      const names = signals.currencies.map((c) => c.name);
      const codes = signals.currencies
        .map((c) => c.code)
        .filter(Boolean)
        .join(", ");
      return [
        {
          title: `Get some ${list(names)} before you leave`,
          detail: `Order it from the bank rather than changing money at the airport, where the rate is worst.${codes ? ` (${codes})` : ""} A small amount of cash covers taxis, tips and the places that turn out not to take cards.`,
          timing: "week_before",
          priority: "normal",
          assignee: "Shared",
        },
      ];
    },
  },
  {
    id: "notify_bank",
    applies: (s) => s.international === true,
    already: (text) =>
      /\bbank\b|card issuer|travel notice|notify.{0,20}card|freeze.{0,20}card/.test(
        text,
      ),
    rows: () => [
      {
        title: "Tell the bank and card issuers where you are going",
        detail:
          "A card that looks stolen gets frozen at the worst possible moment. Most banks take the notice in the app in under a minute. Do it for every card anybody is actually taking, not just the main one.",
        timing: "week_before",
        priority: "normal",
        assignee: "Shared",
      },
    ],
  },
  {
    id: "flight_checkin",
    applies: (s) => s.flying,
    already: (text) =>
      /check ?-? ?in for .{0,24}flight|flight check ?-? ?in|online check ?-? ?in|check ?-? ?in .{0,20}24 hours/.test(
        text,
      ),
    rows: () => [
      {
        title: "Check in for the flights 24 hours ahead",
        detail:
          "Check-in opens exactly twenty-four hours before departure. On airlines that board in the order people checked in, the difference between doing it on the minute and doing it that evening is where the family sits.",
        timing: "day_before",
        priority: "high",
        assignee: "Shared",
      },
    ],
  },
];

/** Title and detail of every task on the trip, done ones included, lowercased. */
function haystack(tasks) {
  return (tasks || [])
    .map((t) =>
      `${String(t?.title || "")} ${String(t?.detail || "")}`.toLowerCase(),
    )
    .join(" | ");
}

/**
 * What this trip is missing, in predeparture_tasks shape.
 *
 * @param tasks  every task already on the trip, finished ones included. A
 *               currency task somebody ticked off last month is not a gap.
 * @returns {{ rows: object[], fired: string[], signals: object }}
 */
export function taskFloor({
  facts = null,
  itinerary = [],
  tasks = [],
  trip = null,
} = {}) {
  const signals = tripSignals({ facts, itinerary });
  const text = haystack(tasks);
  const rows = [];
  const fired = [];
  for (const rule of RULES) {
    if (!rule.applies(signals)) continue;
    if (rule.already(text)) continue;
    const produced = rule.rows({ signals, facts, trip }).filter(Boolean);
    if (!produced.length) continue;
    fired.push(rule.id);
    rows.push(...produced);
  }
  return { rows, fired, signals };
}

/**
 * The same rows with the columns the table wants. Kept separate from taskFloor so
 * the rules can be tested without a trip id or a sort order in the way.
 *
 * Sort order continues past whatever is already there rather than starting at
 * zero, so filed tasks land at the bottom of the stage they belong to instead of
 * jumping above the ones the family wrote themselves.
 */
export function taskFloorRows({
  facts = null,
  itinerary = [],
  tasks = [],
  trip = null,
} = {}) {
  const { rows, fired, signals } = taskFloor({ facts, itinerary, tasks, trip });
  const highest = (tasks || []).reduce(
    (max, t) => Math.max(max, Number(t?.sort_order) || 0),
    0,
  );
  return {
    rows: rows.map((row, i) => ({
      trip_id: trip?.id || null,
      title: row.title,
      detail: row.detail,
      assignee: row.assignee || "Shared",
      timing: row.timing,
      priority: row.priority || "normal",
      is_done: false,
      sort_order: highest + 10 * (i + 1),
    })),
    fired,
    signals,
  };
}
