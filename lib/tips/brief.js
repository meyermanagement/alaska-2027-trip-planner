// What the model is told before it is asked for tips.
//
// Two things are load-bearing here. The first is that the family's own opinions
// go in every single brief - their saved preferences and their own stars and
// reviews of places they have been - because a tip that ignores those is a
// travel article, and they can read one of those without us. The second is that
// the brief lists what is already written down, so the model can see that
// telling them to renew the passports would be telling them something they told
// themselves in March.
//
// Pure: takes rows, returns strings. No database, no model, no clock.

import { memberSection, MEMBER_RULE } from "./members";
import { topicsOf } from "../preferences/topics";
import { profileLines, aboutLines } from "../travelers/profile";
import { ageLines } from "../travelers/ages";
import { buildBudget, budgetBriefing } from "../budget/budget";
import {
  SHARED_LABEL,
  idsOf,
  prefsForTrip,
  ownerIds,
} from "../preferences/scope";

const clip = (value, max) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
};

export const TIP_SYSTEM = `You are the quiet, well-travelled friend of one family, writing pro tips for their trip planner.

A pro tip is something they would thank you for noticing and would not have thought of. It is NOT a travel article, a checklist item, or a fact they could read on any website. The test is whether a well-travelled friend who had read their whole itinerary would bother to mention it.

Every tip must clear all five of these. If it does not, do not write it:
1. It is specific to THIS family, and you can say which line of their record makes it apply — a saved preference, one of their own star ratings or reviews, a date, who is going, or something already on their itinerary.
2. It is actionable. There is something they could do, decide, book, ask about, or pack differently.
3. It is not already written down. Anything in their tasks, packing list or itinerary is not a tip.
4. It is possible for the people going. Check the ages above before you suggest anywhere to stay or anything to do: never an adults-only property, restaurant or ship area when somebody under 18 is coming, and check an age minimum against the youngest person going rather than against the family. A tip that cannot be acted on is worse than no tip.
5. It is not true of every trip. "Book early", "check the weather", "bring layers" and their cousins are banned.

Research before you answer. Take the named places, dates, and bookings below one at a time and go and find out what somebody who has been there recently would know about that exact place on those exact dates. You are not working through a list of topics — you are looking for whatever happens to be true and consequential here, and it will be different on every trip. Rules that turn people away at the door, timing that decides whether they wait twenty minutes or two hours, things that must be booked, entered, or asked for on a particular day, seasonal and local realities, and the specific ways people get this place wrong are all fair game, and so is anything else you find that fits. Do not restrict yourself to the kinds of things you have seen in examples.

${MEMBER_RULE}

Search rather than recall. Anything that changes — hours, seasons, closures, schedules, prices, rules, event dates, reservation systems, typical weather on those dates — has to be checked, and several of these change every year. If what you find contradicts what you were about to write, write what you found. If you cannot verify something, leave it out; an unverified specific is worse than silence.

Returning nothing is the correct and common answer. A day with no genuinely useful tip should produce an empty list. Never pad to fill the space.

Reply with JSON and nothing else, in this exact shape:

{"tips":[{"title":"…","body":"…","because":"…","urgency":"now|soon|whenever","act_by":"YYYY-MM-DD or null"}]}

  title    under 90 characters, plain, no exclamation marks
  body     one or two sentences, under 500 characters, second person, American spelling
  because  the line of their record this rests on, in your own words, under 200 characters
  urgency  "now" only if delay genuinely costs them something — a window closing, a price rising, a permit selling out
  act_by   a real date when there is one, otherwise null. Only put a date here if the date is in the record or you verified it.

At most three tips. Two good ones beat three.`;

function peopleLine(travelers) {
  const names = (travelers || [])
    .filter((t) => t && t.is_person !== false && t.name)
    .map((t) => t.name);
  return names.length ? names.join(", ") : "not recorded";
}

// Only the preferences this trip is actually about: everything shared, plus the
// preferences of the people on this roster. Veda will not eat seafood is a real
// fact and a useless one on a trip Veda is not on, and a tip built on it would be
// advice for nobody.
function preferenceLines(preferences, travelers) {
  const byId = new Map((travelers || []).map((t) => [t.id, t.name]));
  const rows = prefsForTrip(
    (preferences || []).filter((p) => p && p.body),
    idsOf(travelers),
  ).map((p) => {
    const who =
      ownerIds(p)
        .map((id) => byId.get(id))
        .filter(Boolean)
        .join(" & ") || null;
    const topic = clip(topicsOf(p).join(", "), 90) || "general";
    return `- ${who || SHARED_LABEL} \u2014 ${topic}: ${clip(p.body, 260)}`;
  });
  return rows.length
    ? rows
    : ["- nothing saved yet, so do not pretend to know what they like"];
}

function reviewLines(reviews) {
  const rated = (reviews || [])
    .filter((i) => i && (i.rating || i.review))
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 24);
  if (!rated.length) {
    return [
      "- nothing rated or reviewed yet, so you have no evidence of taste to lean on",
    ];
  }
  return rated.map((i) => {
    const bits = [clip(i.title, 80)];
    if (i.tripName) bits.push(clip(i.tripName, 40));
    if (i.location) bits.push(clip(i.location, 60));
    bits.push(i.rating ? `${i.rating}/5` : "no stars");
    const said = i.review ? ` — their words: "${clip(i.review, 200)}"` : "";
    return `- ${bits.join(" | ")}${said}`;
  });
}

function itineraryLines(items) {
  const rows = (items || []).slice(0, 60).map((i) => {
    const bits = [i.item_date || "no date", clip(i.title, 80)];
    if (i.category) bits.push(i.category);
    if (i.location) bits.push(clip(i.location, 60));
    if (i.status) bits.push(i.status);
    if (i.confirmation_number) bits.push("confirmed");
    return `- ${bits.join(" | ")}`;
  });
  return rows.length ? rows : ["- nothing on the itinerary yet"];
}

/**
 * The brief for one place tips can appear.
 *
 * @param {object} input
 * @param {"trip"|"item"|"packing"} input.scope
 * @param {string} input.today       ISO date
 * @param {object} input.trip        the trip row
 * @param {object} [input.item]      the itinerary item, when scope is "item"
 * @param {Array} input.itinerary    that trip's items
 * @param {Array} input.tasks        that trip's open tasks
 * @param {Array} input.packing      that trip's packing list
 * @param {Array} input.travelers    who is going
 * @param {Array} input.costs        trip_costs rows, for the money section
 * @param {Array} input.preferences  travel_preferences rows
 * @param {Array} input.reviews      rated or reviewed items from any trip,
 *                                   each optionally carrying tripName
 * @param {string[]} [input.already] titles of tips already offered for this
 *                                   place, the cleared ones included
 * @returns {string}
 */
function moneyLines({ trip, itinerary, costs }) {
  const budget = buildBudget({ trip, itinerary, costs });
  const briefing = budgetBriefing(budget);
  if (!briefing) return [];
  return [
    "WHAT THIS TRIP COSTS, and what they hoped it would. Aim your suggestions at this level: prefer things within reach of it, and when you name a place or a booking, say roughly what it runs. If the trip is already over the figure, a tip may name the one line a concession could come from and what it would save \u2014 but never tell them what they can or cannot afford, and never make being over the budget the tip.",
    briefing,
  ];
}

export function tipBrief({
  scope = "trip",
  today,
  trip,
  item = null,
  itinerary = [],
  tasks = [],
  packing = [],
  costs = [],
  travelers = [],
  preferences = [],
  reviews = [],
  memberships = [],
  already = [],
}) {
  const lines = [];
  lines.push(`TODAY IS ${today}.`);
  lines.push("");
  lines.push(
    `THE TRIP: ${clip(trip?.name, 80) || "untitled"} — ${clip(trip?.destination, 80) || "destination not recorded"}, ${trip?.start_date || "no start date"} to ${trip?.end_date || "no end date"}. Status: ${trip?.status || "planning"}.`,
  );
  if (trip?.summary) lines.push(`In their words: ${clip(trip.summary, 300)}`);
  lines.push(`WHO IS GOING: ${peopleLine(travelers)}.`);
  // How old each of them will be on the first day, not today. This is the fact
  // that rules whole categories in or out, and the one most easily got wrong for
  // a trip a year and a half away.
  lines.push(...ageLines(travelers, trip?.start_date));
  // Their phones, their equipment and their languages. This is the difference
  // between "check your roaming" and "your Verizon plan charges by the day
  // there, and Steph's iPhone will take an eSIM instead."
  const profile = profileLines(travelers);
  if (profile.length) {
    lines.push("");
    lines.push(...profile);
  }
  // Their own words about themselves, above the saved preferences rather than
  // below them: a ticked preference says what they want booked, and this says
  // what sort of afternoon they were hoping for.
  const about = aboutLines(travelers);
  if (about.length) {
    lines.push("");
    lines.push(...about);
  }
  lines.push("");
  lines.push(
    "WHAT THEY LIKE \u2014 their own saved preferences. Shared ones are true of the family; a name means it is that person\u2019s alone, and only the people going on this trip are listed:",
  );
  lines.push(...preferenceLines(preferences, travelers));
  lines.push("");
  lines.push(
    "WHAT THEY THOUGHT OF PLACES THEY HAVE BEEN — their own stars and their own words. Lean on these, quote them rather than paraphrasing, and treat a low score as something not to repeat:",
  );
  lines.push(...reviewLines(reviews));
  lines.push("");
  lines.push(
    ...memberSection({
      programs: memberships,
      travelers,
      trip,
      itinerary,
    }),
  );
  lines.push("");
  // What the trip is costing, and what they said they wanted it to cost. A tip
  // is a suggestion to spend money nine times out of ten, and one written
  // without this either aims at the wrong end of the market or cheerfully adds
  // a helicopter to a trip already over. The preferred budget is a preference,
  // not a cap, and the wording says so both here and on the screen -- the model
  // is being told what to aim at, not given a veto to enforce.
  const moneySection = moneyLines({ trip, itinerary, costs });
  if (moneySection.length) {
    lines.push(...moneySection);
    lines.push("");
  }

  if (scope === "item" && item) {
    lines.push(
      `THE ONE THING YOU ARE ADVISING ON: ${clip(item.title, 100)} — ${item.category || "no category"}, on ${item.item_date || "no date"}${item.start_time ? ` at ${item.start_time}` : ""}${item.location ? `, at ${clip(item.location, 80)}` : ""}. Status: ${item.status || "none"}.`,
    );
    if (item.notes) lines.push(`Their notes on it: ${clip(item.notes, 300)}`);
    lines.push(
      "Every tip must be about THIS booking or activity. Advice about the trip in general belongs somewhere else and will be thrown away.",
    );
    lines.push("");
    lines.push("THE REST OF THAT TRIP, for context only:");
    lines.push(...itineraryLines(itinerary));
  } else if (scope === "packing") {
    lines.push(
      "YOU ARE ADVISING ON WHAT THEY ARE TAKING. Every tip must be about what to pack, what to leave behind, or how to carry it — informed by where they are going, the dates, who is going, and what is on the itinerary. Anything else will be thrown away.",
    );
    lines.push("");
    lines.push(
      `WHAT IS ALREADY ON THE PACKING LIST (${packing.length} items):`,
    );
    lines.push(
      packing.length
        ? (packing || [])
            .slice(0, 120)
            .map(
              (p) =>
                `- ${clip(p.item, 60)}${p.assignee ? ` (${p.assignee})` : ""}${p.category ? ` [${p.category}]` : ""}`,
            )
            .join("\n")
        : "- the list is empty",
    );
    lines.push("");
    lines.push("WHAT THE ITINERARY SAYS THEY WILL BE DOING:");
    lines.push(...itineraryLines(itinerary));
    lines.push("");
    // Packing is one of the few places where the research is bounded, and saying
    // so keeps the whole look inside a minute. Left open, the model checks every
    // line of the itinerary in turn, which on a full trip is thirty searches and
    // an answer that arrives after the request has been cut off.
    lines.push(
      "WHAT TO GO AND CHECK, and not much more: the weather where they will be on these exact dates, any dress code or gear rule at the places named above, and anything the airline, park, ship, or lodge forbids or hands out. A few checks is enough — do not research every line of the itinerary in turn.",
    );
  } else {
    lines.push(
      "YOU ARE ADVISING ON THE TRIP AS A WHOLE — the shape of it, the gaps in it, the things that have to happen in an order, and anything about these particular dates in this particular place.",
    );
    lines.push("");
    lines.push("THE ITINERARY:");
    lines.push(...itineraryLines(itinerary));
  }

  lines.push("");
  lines.push(
    `WHAT THEY HAVE ALREADY WRITTEN DOWN AS THINGS TO DO (${tasks.length} still open). None of these can be a tip:`,
  );
  lines.push(
    tasks.length
      ? (tasks || [])
          .slice(0, 60)
          .map(
            (t) =>
              `- ${clip(t.title, 90)}${t.assignee ? ` (${t.assignee})` : ""}${t.due_date ? ` due ${t.due_date}` : ""}`,
          )
          .join("\n")
      : "- nothing open",
  );

  if (already.length) {
    lines.push("");
    lines.push(
      "TIPS THEY HAVE ALREADY BEEN OFFERED HERE. They have put all of these away, and saying any of them again would be worse than saying nothing:",
    );
    lines.push(...already.slice(0, 40).map((t) => `- ${clip(t, 100)}`));
  }

  lines.push("");
  lines.push(
    'Now: is there anything here worth telling them that clears all four rules? If not, reply {"tips":[]}.',
  );
  return lines.join("\n");
}
