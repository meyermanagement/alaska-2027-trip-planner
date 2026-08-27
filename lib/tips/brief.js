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

const clip = (value, max) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
};

export const TIP_SYSTEM = `You are the quiet, well-travelled friend of one family, writing pro tips for their trip planner.

A pro tip is something they would thank you for noticing and would not have thought of. It is NOT a travel article, a checklist item, or a fact they could read on any website.

Every tip must clear all four of these. If it does not, do not write it:
1. It is specific to THIS family, and you can say which line of their record makes it apply — a saved preference, one of their own star ratings or reviews, a date, who is going, or something already on their itinerary.
2. It is actionable. There is something they could do, decide, book, ask about, or pack differently.
3. It is not already written down. Anything in their tasks, packing list or itinerary is not a tip.
4. It is not true of every trip. "Book early", "check the weather", "bring layers" and their cousins are banned.

Use web search to check anything that changes with time — opening times, seasons, closures, ferry and train schedules, permit windows, park rules, event dates, typical weather for those exact dates. Prefer what you can verify over what you remember. If searching contradicts what you were going to say, say the verified thing.

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

function preferenceLines(preferences, travelers) {
  const byId = new Map((travelers || []).map((t) => [t.id, t.name]));
  const rows = (preferences || [])
    .filter((p) => p && p.body)
    .map((p) => {
      const who = p.traveler_id ? byId.get(p.traveler_id) : null;
      const topic = clip(p.topic, 60) || "general";
      return `- ${who ? `${who} — ` : ""}${topic}: ${clip(p.body, 260)}`;
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
 * @param {Array} input.preferences  travel_preferences rows
 * @param {Array} input.reviews      rated or reviewed items from any trip,
 *                                   each optionally carrying tripName
 * @param {string[]} [input.already] titles of tips already offered for this
 *                                   place, cleared or ignored included
 * @returns {string}
 */
export function tipBrief({
  scope = "trip",
  today,
  trip,
  item = null,
  itinerary = [],
  tasks = [],
  packing = [],
  travelers = [],
  preferences = [],
  reviews = [],
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
  lines.push("");
  lines.push("WHAT THEY LIKE — their own saved preferences:");
  lines.push(...preferenceLines(preferences, travelers));
  lines.push("");
  lines.push(
    "WHAT THEY THOUGHT OF PLACES THEY HAVE BEEN — their own stars and their own words. Lean on these, quote them rather than paraphrasing, and treat a low score as something not to repeat:",
  );
  lines.push(...reviewLines(reviews));
  lines.push("");

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
      "TIPS THEY HAVE ALREADY BEEN OFFERED HERE. Some of these they cleared and some they ignored, and either way saying them again would be worse than saying nothing:",
    );
    lines.push(...already.slice(0, 40).map((t) => `- ${clip(t, 100)}`));
  }

  lines.push("");
  lines.push(
    'Now: is there anything here worth telling them that clears all four rules? If not, reply {"tips":[]}.',
  );
  return lines.join("\n");
}
