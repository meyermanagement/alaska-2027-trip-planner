// Asking for tips, and writing down the few that survive.
//
// Two calls to the model per trip, and they are different kinds of question.
//
// The first is factual and cacheable: does this trip leave the country, which
// countries, what comes out of the wall, and where does the signal go. Those
// answers do not change between Tuesday and Thursday, so they are researched once
// and kept in trip_facts. They are also what the app's own rules need in order to
// work — the passport warning and the hairdryer tip are arithmetic sitting on top
// of these four facts.
//
// The second is the judgement call: given everything the family has written down,
// their preferences, their own reviews, and the web, is there anything worth
// telling them. That one is asked fresh, is allowed to answer "no", and usually
// should.
//
// The order matters. Facts first, then the app's own rules, then the model — and
// the rules' tips are handed to the model as things already said, so it cannot
// spend one of its three slots repeating them.

import { generate as callModel } from "@/lib/agent/llm";
import { TIP_SYSTEM, tipBrief } from "./brief";
import { tipsFrom } from "./parse";
import { acceptTips } from "./tip";
import { houseTips } from "./rules";
import {
  memberSection,
  MEMBER_RULE,
  allowedStatuses,
  statusAllowed,
} from "./members";

// A fact sheet is worth keeping for a week. Sockets do not change; a road closure
// might, and a week is a fair compromise against Google's daily allowance.
export const FACTS_STALE_DAYS = 7;

// Bumped whenever a researched booking window gains a field the arithmetic relies
// on. A sheet written before the bump is not merely old, it is the wrong shape:
// the Disney window cached before loyalty levels existed had no level on it, so it
// quietly handed back the general date. Age alone would not have caught that,
// because the sheet was only a few days old.
export const WINDOWS_VERSION = 2;

/**
 * Which standings a set of windows was researched with.
 *
 * A level moves a date, so joining a program, or moving up in one, has to
 * re-research the windows rather than wait out the week.
 */
export function standingsKey(memberships = []) {
  return (memberships || [])
    .filter(
      (row) =>
        row?.is_active !== false && String(row?.status_tier || "").trim(),
    )
    .map((row) =>
      [row.brand, row.program_name, row.status_tier]
        .map((part) =>
          String(part || "")
            .trim()
            .toLowerCase(),
        )
        .join("|"),
    )
    .sort()
    .join(" ~ ");
}

const FACTS_SYSTEM = `You are answering factual questions about one trip, for a travel planner that will do arithmetic on your answers. Search the web. Be literal and brief.

Reply with JSON and nothing else:

{"leaves_country":true|false,"countries":["…"],"mains_voltage":"…","plug_types":["…"],"coverage_note":"…","entry_note":"…","booking_windows":[{"name":"…","applies_to":"…","applies_to_status":"…","opens_days_before":0,"anchor":"trip_start|trip_end|item","opens_time":"…","opens_on":null,"closes_on":null,"note":"…"}]}

  leaves_country  true if any part of this trip is outside the United States, including a port of call, a border crossing, a connection, or a cruise embarkation. A cruise that sails from a foreign port leaves the country even if the destination is a US state.
  countries       every country the trip touches, common names, US included if applicable
  mains_voltage   like "230 V, 50 Hz". Empty string if the whole trip is in the US.
  plug_types      like ["Type C","Type F"]. Empty array if the whole trip is in the US.
  coverage_note   one sentence, only if there is a specific and notable cell coverage problem on this itinerary — name the road, park, valley or stretch of water. Empty string if coverage is unremarkable. Do not write a general caution.
  entry_note      one sentence on entry documents for US citizens, only if there is something beyond an ordinary passport. Empty string otherwise.

  booking_windows anything on this itinerary that can only be booked, reserved, entered in a lottery, or ticketed starting on a particular day, where being late means missing out. Search for the current rules for these exact places rather than recalling them; several of these systems change their numbers every year or two. Do not include ordinary bookings that are simply available.

                  name              the system as its operator names it
                  applies_to        the place, park, restaurant, ride system, trail or event it governs
                  applies_to_status the loyalty level, membership or guest category this particular window belongs to, exactly as the operator names it, when the day depends on one — "Castaway Club Silver", "resort guest", "Bonvoy Platinum Elite". Empty string when the window is the same for everybody. Only ever a level listed below as applying to THIS trip: a level with one company says nothing about another company's window.
                  opens_days_before whole days before the anchor date. Return the number, never a date you worked out yourself.
                  anchor            "trip_start" when it counts back from arrival or check-in, "trip_end" from departure, "item" when it counts back from the day of that particular activity
                  opens_time        the time of day and time zone it opens, if there is one, like "7:00 am ET"
                  opens_on          only for a window with a fixed calendar date that has nothing to do with their dates, like a lottery that opens every 1 March. Otherwise null.
                  closes_on         the last day it can be done, if there is one. Otherwise null.
                  note              one or two sentences on what they actually have to do and what happens if they are late. Be concrete.

                  Where a loyalty level or guest category opens a window earlier than the public one, return the window for the level THIS family holds WITH THAT COMPANY rather than the public window, and name that level in applies_to_status. A cruise line that opens shore excursions to its loyalty members in waves has a different number for each wave; give the wave that applies to them. Do not return both. If they hold no level with the operator of a booked thing, return the public window with applies_to_status empty — never borrow a level they hold with a competitor.

                  Empty array is a fine and common answer.

${MEMBER_RULE}

Say nothing you did not verify. An empty string is a better answer than a guess.`;

function factsBrief(trip, itinerary, memberships = [], travelers = []) {
  const stops = (itinerary || [])
    .filter((i) => i?.location || i?.title)
    .slice(0, 40)
    .map(
      (i) =>
        `- ${i.item_date || "no date"}: ${String(i.title || "").slice(0, 70)}${i.location ? ` — ${String(i.location).slice(0, 70)}` : ""}${i.category ? ` [${i.category}]` : ""}`,
    );
  return [
    `TRIP: ${trip?.name || "untitled"}`,
    `DESTINATION AS THEY WROTE IT: ${trip?.destination || "not recorded"}`,
    `DATES: ${trip?.start_date || "?"} to ${trip?.end_date || "?"}`,
    trip?.summary ? `THEIR SUMMARY: ${String(trip.summary).slice(0, 300)}` : "",
    "",
    memberSection({
      programs: memberships,
      travelers,
      trip,
      itinerary,
    }).join("\n"),
    "",
    "EVERY STOP ON THE ITINERARY — read these for where the trip actually goes, not just the destination field:",
    stops.length ? stops.join("\n") : "- nothing on the itinerary yet",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Research the four facts for one trip.
 *
 * @returns {{facts: object|null, model: string|null, searched: boolean, sources: Array}}
 */
export async function researchFacts({
  trip,
  itinerary,
  memberships = [],
  travelers = [],
  deadline = undefined,
}) {
  const result = await callModel({
    system: FACTS_SYSTEM,
    messages: [
      {
        role: "user",
        text: factsBrief(trip, itinerary, memberships, travelers),
      },
    ],
    temperature: 0,
    grounded: true,
    thinking: "low",
    // Given by the route, which knows how long it has left before the platform
    // stops listening. Without one the model may still be talking when the
    // connection is cut, and a cut connection is not an error the app can explain
    // — the browser only knows the load failed.
    ...(deadline ? { deadline } : {}),
  });
  // The fact sheet is one object rather than a list, so it wants the object
  // reader below rather than the tip reader.
  const json = jsonObject(result.text);
  if (!json)
    return {
      facts: null,
      model: result.model || null,
      searched: Boolean(result.searched),
      sources: [],
    };
  const str = (value, max) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";
  const list = (value, max) =>
    Array.isArray(value)
      ? value
          .map((v) => str(v, 40))
          .filter(Boolean)
          .slice(0, max)
      : [];
  return {
    facts: {
      leaves_country:
        typeof json.leaves_country === "boolean" ? json.leaves_country : null,
      countries: list(json.countries, 12),
      mains_voltage: str(json.mains_voltage, 40),
      plug_types: list(json.plug_types, 6),
      coverage_note: str(json.coverage_note, 300),
      entry_note: str(json.entry_note, 300),
      booking_windows: windowsFrom(
        json.booking_windows,
        allowedStatuses({ programs: memberships, trip, itinerary }),
      ),
    },
    model: result.model || null,
    searched: Boolean(result.searched),
    sources: Array.isArray(result.sources) ? result.sources.slice(0, 6) : [],
  };
}

// Booking windows, cleaned before they are stored. The rules layer will do dates
// on these, so a bad number here becomes a wrong deadline on a screen: anything
// that is not a whole sensible count of days is dropped rather than coerced.
const ANCHORS = new Set(["trip_start", "trip_end", "item"]);

function windowsFrom(value, allowed = []) {
  if (!Array.isArray(value)) return [];
  const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  // A list of places goes in the tip's title, so a plain character cut leaves a
  // half-written restaurant on screen — "Liberty Tree Tavern, Ga". Cut at the
  // last comma instead and say how many were left off.
  const listStr = (v, max) => {
    const whole = typeof v === "string" ? v.trim() : "";
    if (whole.length <= max) return whole;
    const cut = whole.slice(0, max);
    const at = cut.lastIndexOf(",");
    if (at < 12) return `${cut.trimEnd()}…`;
    const kept = cut.slice(0, at);
    const dropped = whole
      .slice(at + 1)
      .split(",")
      .filter((part) => part.trim()).length;
    return dropped > 0 ? `${kept} and ${dropped} more` : kept;
  };
  const date = (v) =>
    /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : null;
  const out = [];
  for (const row of value.slice(0, 10)) {
    if (!row || typeof row !== "object") continue;
    const name = str(row.name, 80);
    const note = str(row.note, 400);
    if (name.length < 3 || note.length < 20) continue;
    const days = Number(row.opens_days_before);
    const fixed = date(row.opens_on);
    const known = Number.isFinite(days) && days >= 0 && days <= 730;
    if (!known && !fixed) continue;
    out.push({
      name,
      applies_to: listStr(row.applies_to, 90),
      // Which level this particular window belongs to. Kept, because the tip has
      // to be able to say why their date is not the date on the public page.
      // Dropped rather than trusted when it names a level this family does not
      // hold with anybody on this trip. The date survives; the claim about whose
      // date it is does not, because that is the part that misleads.
      applies_to_status: statusAllowed(str(row.applies_to_status, 60), allowed)
        ? str(row.applies_to_status, 60)
        : "",
      opens_days_before: known ? Math.round(days) : null,
      anchor: ANCHORS.has(row.anchor) ? row.anchor : "trip_start",
      opens_time: str(row.opens_time, 40),
      opens_on: fixed,
      closes_on: date(row.closes_on),
      note,
    });
  }
  return out;
}

// Kept here rather than in parse.js because nothing else needs a bare object.
function jsonObject(text) {
  const raw = typeof text === "string" ? text : "";
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (!depth) {
        try {
          return JSON.parse(body.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Ask the model for tips about one place, and keep the ones that clear the bar.
 *
 * @param {object} input  everything tipBrief needs, plus:
 * @param {object} input.place  {family_id, trip_id, itinerary_item_id, scope}
 * @param {string[]} input.avoid   things already written down
 * @param {string[]} input.known   fingerprints already in the database
 * @returns {{tips: Array, dropped: Array, model: string|null, searched: boolean}}
 */
// Below this there is not enough of the minute left to ask anything at all, so
// the timeout is reported instead of a second call being opened that the platform
// would cut off mid-sentence.
const UNSEARCHED_FLOOR_MS = 10000;

export async function tipsForPlace({
  place,
  avoid = [],
  known = [],
  deadline = undefined,
  ...brief
}) {
  const asked = { role: "user", text: tipBrief(brief) };
  // Most of the time goes to the search, but not all of it. A grounded look that
  // runs out of time used to be the end of the request, and the person was told
  // the model thinks too slowly and nothing else. Held back is enough for one
  // unsearched answer, which is worth less — every tip it produces is filed with
  // searched false, and the card says so — but is worth more than an apology.
  const searchShare = 0.7;
  const left = () => (deadline ? deadline - Date.now() : Infinity);
  const askFor = (grounded, until) =>
    callModel({
      system: TIP_SYSTEM,
      messages: [asked],
      temperature: 0.3,
      grounded,
      // Measured on the real packing list: thinking freely took 28 seconds and ran
      // no searches, low took 18 and ran four. The tips are better and the wait is
      // shorter, which is not a trade at all.
      thinking: "low",
      ...(until && Number.isFinite(until) ? { deadline: until } : {}),
    });

  let result;
  try {
    result = await askFor(
      true,
      deadline ? Date.now() + Math.round(left() * searchShare) : null,
    );
  } catch (error) {
    // Only a deadline is worth a second ask. A refusal, a quota, a bad key: those
    // answers do not change because the question is asked again without search.
    if (!error?.timedOut || left() < UNSEARCHED_FLOOR_MS) throw error;
    result = await askFor(false, deadline || null);
  }
  const { tips, dropped } = acceptTips({
    candidates: tipsFrom(result.text),
    today: brief.today,
    place,
    avoid,
    known,
    sources: result.sources,
    model: result.model || null,
    searched: Boolean(result.searched),
  });
  return {
    tips,
    dropped,
    model: result.model || null,
    searched: Boolean(result.searched),
  };
}

/** The app's own tips, which cost nothing and are not opinions. */
export function rulesTips(input) {
  return houseTips(input);
}
