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

// A fact sheet is worth keeping for a week. Sockets do not change; a road closure
// might, and a week is a fair compromise against Google's daily allowance.
export const FACTS_STALE_DAYS = 7;

const FACTS_SYSTEM = `You are answering four factual questions about one trip, for a travel planner that will do arithmetic on your answers. Search the web. Be literal and brief.

Reply with JSON and nothing else:

{"leaves_country":true|false,"countries":["…"],"mains_voltage":"…","plug_types":["…"],"coverage_note":"…","entry_note":"…"}

  leaves_country  true if any part of this trip is outside the United States, including a port of call, a border crossing, a connection, or a cruise embarkation. A cruise that sails from a foreign port leaves the country even if the destination is a US state.
  countries       every country the trip touches, common names, US included if applicable
  mains_voltage   like "230 V, 50 Hz". Empty string if the whole trip is in the US.
  plug_types      like ["Type C","Type F"]. Empty array if the whole trip is in the US.
  coverage_note   one sentence, only if there is a specific and notable cell coverage problem on this itinerary — name the road, park, valley or stretch of water. Empty string if coverage is unremarkable. Do not write a general caution.
  entry_note      one sentence on entry documents for US citizens, only if there is something beyond an ordinary passport. Empty string otherwise.

Say nothing you did not verify. An empty string is a better answer than a guess.`;

function factsBrief(trip, itinerary) {
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
export async function researchFacts({ trip, itinerary }) {
  const result = await callModel({
    system: FACTS_SYSTEM,
    messages: [{ role: "user", text: factsBrief(trip, itinerary) }],
    temperature: 0,
    grounded: true,
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
    },
    model: result.model || null,
    searched: Boolean(result.searched),
    sources: Array.isArray(result.sources) ? result.sources.slice(0, 6) : [],
  };
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
export async function tipsForPlace({
  place,
  avoid = [],
  known = [],
  ...brief
}) {
  const result = await callModel({
    system: TIP_SYSTEM,
    messages: [{ role: "user", text: tipBrief(brief) }],
    temperature: 0.3,
    grounded: true,
  });
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
