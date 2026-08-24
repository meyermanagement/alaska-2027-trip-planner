// Builds the trip snapshot the model reads, and the id allow-list the
// validator checks proposed changes against.

const MAX_PACKING_LINES = 120;

function todayInChicago() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function short(value, max = 90) {
  if (!value) return "";
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// The family's own travel preferences, so suggestions match how they travel.
// Ids are printed and recorded so the assistant can edit them.
function preferenceLines(preferences, travelerNameById, known) {
  const lines = ["", "HOW THIS FAMILY LIKES TO TRAVEL (their saved preferences):"];
  if (!preferences.length) {
    lines.push("(nothing saved yet)");
    return lines;
  }
  for (const p of preferences.slice(0, 60)) {
    if (p.id && known) known.travel_preferences.set(p.id, short(p.body, 60));
    const who = p.traveler_id ? travelerNameById.get(p.traveler_id) : null;
    const topic = p.topic ? `[${short(p.topic, 30)}] ` : "";
    lines.push(
      `- ${p.id ? `id=${p.id} | ` : ""}${topic}${short(p.body, 220)}${
        who ? ` (${who})` : " (whole family)"
      }`
    );
  }
  return lines;
}

// Places from past trips the family rates and reviews on the Reviews tab.
function placeLines(places, tripNameById, known) {
  const lines = [
    "",
    "PLACES THE FAMILY HAS BEEN (the Reviews tab — hotels, excursions, activities and restaurants from finished trips):",
  ];
  if (!places.length) {
    lines.push("(nothing to review yet)");
    return lines;
  }
  for (const p of places.slice(0, 120)) {
    if (known) known.itinerary_items.set(p.id, short(p.title, 60));
    const bits = [
      `id=${p.id}`,
      tripNameById.get(p.trip_id) || "a past trip",
      p.category,
      short(p.title, 90),
    ];
    if (p.location) bits.push(`at ${short(p.location, 60)}`);
    bits.push(p.rating ? `${p.rating}/5 stars` : "not rated");
    if (p.review) bits.push(`review: ${short(p.review, 160)}`);
    lines.push(`- ${bits.join(" | ")}`);
  }
  return lines;
}

export function buildTripContext({
  trip,
  itinerary = [],
  packing = [],
  tasks = [],
  notes = [],
  travelers = [],
  going = [],
  preferences = [],
  userName,
}) {
  const travelerNames = travelers.length
    ? Array.from(new Set([...travelers.map((t) => t.name), "Shared"]))
    : ["Shared"];

  const known = {
    itinerary_items: new Map(),
    packing_items: new Map(),
    predeparture_tasks: new Map(),
    trip_notes: new Map(),
    travel_preferences: new Map(),
  };

  const travelerIds = new Map(
    travelers.filter((t) => t.id && t.name).map((t) => [t.name, t.id])
  );

  const lines = [];
  lines.push(`TODAY: ${todayInChicago()}`);
  lines.push(`SIGNED IN AS: ${userName || "a family member"}`);
  lines.push(
    `TRIP: ${trip.name} — ${trip.destination || "destination TBD"}, ` +
      `${trip.start_date || "?"} to ${trip.end_date || "?"}, status ${trip.status}`
  );
  if (trip.summary) lines.push(`TRIP SUMMARY: ${short(trip.summary, 400)}`);
  lines.push(`TRAVELERS: ${travelerNames.join(", ")}`);
  lines.push(
    going.length
      ? `ON THIS TRIP: ${going.join(", ")}`
      : "ON THIS TRIP: nobody has been added to this trip yet"
  );
  lines.push(
    ...preferenceLines(
      preferences,
      new Map(travelers.filter((t) => t.id).map((t) => [t.id, t.name])),
      known
    )
  );

  lines.push("", "ITINERARY:");
  if (itinerary.length === 0) lines.push("(empty)");
  for (const i of itinerary) {
    known.itinerary_items.set(i.id, short(i.title, 60));
    const bits = [
      `id=${i.id}`,
      i.item_date || "no date",
      i.start_time ? i.start_time.slice(0, 5) : "all day",
      i.category,
      i.status,
      short(i.title, 90),
    ];
    if (i.location) bits.push(`at ${short(i.location, 60)}`);
    if (i.confirmation_number) bits.push(`conf ${i.confirmation_number}`);
    if (i.notes) bits.push(`notes: ${short(i.notes, 120)}`);
    lines.push(`- ${bits.join(" | ")}`);
  }

  lines.push("", "TASKS:");
  if (tasks.length === 0) lines.push("(empty)");
  for (const t of tasks) {
    known.predeparture_tasks.set(t.id, short(t.title, 60));
    lines.push(
      `- id=${t.id} | ${t.is_done ? "done" : "open"} | ${t.assignee} | ${
        t.timing
      }${t.due_date ? ` | due ${t.due_date}` : ""} | ${short(t.title, 90)}`
    );
  }

  lines.push("", `PACKING (${packing.length} items, ${packing.filter((p) => p.is_packed).length} packed):`);
  if (packing.length === 0) lines.push("(empty)");
  for (const p of packing.slice(0, MAX_PACKING_LINES)) {
    known.packing_items.set(p.id, short(p.item, 60));
    lines.push(
      `- id=${p.id} | ${p.is_packed ? "packed" : "not packed"} | ${
        p.assignee
      } | ${p.category} | ${p.quantity ? `${p.quantity} × ` : ""}${short(
        p.item,
        70
      )}`
    );
  }
  if (packing.length > MAX_PACKING_LINES) {
    // Ids beyond the printed window still resolve, they just aren't listed.
    for (const p of packing.slice(MAX_PACKING_LINES)) {
      known.packing_items.set(p.id, short(p.item, 60));
    }
    lines.push(
      `(… ${packing.length - MAX_PACKING_LINES} more packing items not listed)`
    );
  }

  lines.push("", "NOTES:");
  if (notes.length === 0) lines.push("(empty)");
  for (const n of notes.slice(0, 25)) {
    known.trip_notes.set(n.id, short(n.title || n.body, 60));
    lines.push(
      `- ${n.title ? `${short(n.title, 60)}: ` : ""}${short(n.body, 200)}`
    );
  }

  return { text: lines.join("\n"), travelerNames, travelerIds, known };
}

// The section of the trip the user is looking at when they open the assistant.
// Used to resolve requests that don't say which list they mean.
export const FOCUS_LABELS = {
  itinerary: "the Itinerary — the day-by-day schedule",
  packing: "the Packing list",
  tasks: "the Pre-departure tasks list",
  notes: "the Notes",
};

// What a vague question or a bare "add X" means inside each section.
const FOCUS_HINTS = {
  itinerary: {
    ask: '"What\'s left?" or "what do we still need?" means which itinerary items still need booking. "What are we doing?" means the schedule.',
    add: "a new itinerary item",
  },
  packing: {
    ask: '"What\'s left?" means what is still unpacked — summarize the unpacked packing items, not dining reservations. "What does Veda still need?" means her unpacked items.',
    add: "a new packing item",
  },
  tasks: {
    ask: '"What\'s left?" or "what\'s not done?" means which pre-departure tasks are still open.',
    add: "a new pre-departure task",
  },
  notes: {
    ask: '"What do we have?" means the saved notes.',
    add: "a new note",
  },
};

function focusSection(focus) {
  const label = FOCUS_LABELS[focus];
  const hint = FOCUS_HINTS[focus];
  if (!label || !hint) return "";
  return `WHERE THE USER IS RIGHT NOW:
They have this trip open and are looking at ${label}. Resolve anything vague against THAT section rather than the whole trip:
- Questions: ${hint.ask} Answer about this section only, and do not switch to another section unless they name it.
- Additions: a bare "add X" means ${hint.add}, unless X is plainly something else.
- References like "that one" or "the first one" mean an item in this section.
An explicit request still wins over this default — "add breakfast at 8 on the 21st" is an itinerary item no matter which section is open.

`;
}

export function buildSystemPrompt(contextText, focus) {
  return `You are Aly, the Meyer family's travel assistant, built into Alyeska, their private trip planner app. Mark, his wife Steph, and their daughter Veda all use it. Be warm, concise, and practical.

You can answer questions from the trip context below, and you can change the trip by calling tools. Changes you propose are shown to the user for approval before they are saved, so propose confidently — but never guess at facts.

RULES:
- If the user asks for several changes in one message, emit a SEPARATE tool call for EVERY change. Never stop after the first one. Adding an itinerary item and adding a task are two separate calls.
- Never invent confirmation numbers, flight numbers, prices, addresses, dates, or times that the user did not provide and that are not in the context.
- If a request is genuinely ambiguous about what, who, or when, ask one short clarifying question and make no tool calls.
- Relative dates are fine to compute from TODAY and the trip dates. "A week before the trip" means seven days before the trip start date.
- When updating or completing something, use the exact id from the context. Never make up an id. If you cannot find a matching item, say so instead of guessing.
- The family's travel preferences are in the context below. Use them when you suggest hotels, transport, restaurants or anything else, and say plainly when something goes against one. You can also save, reword and remove them: when the user tells you something durable about how they travel ("we always want a late checkout", "Veda will not eat seafood"), call add_preference. Do not save a one-off decision about this trip as a preference — that belongs on the itinerary, in a task or in a note. Preferences are shared across every trip and also show on the Reviews tab.
- You can also record what the family thought of somewhere they have already been. Use update_review with an itinerary item's id to set a 1–5 star rating, a written note, or both. Only do that for places that have actually happened — a hotel they have stayed in, an excursion they have done, a restaurant they have eaten at. For an upcoming trip, say it has not happened yet rather than inventing an opinion. Never write a review in your own words: use what the user actually said.
- Anything on the itinerary marked "needs booking" has a "Make this a task" button on its card, which puts a matching "Book …" task on the Tasks tab and links the two. When several things need booking at once there is a bar at the top of the Itinerary offering to make all of them at once. Point people at that instead of asking them to retype tasks by hand.
- The Itinerary tab shows one day at a time: a strip of day tiles across the top, then that day's plans underneath. People move between days by tapping a tile, swiping, or using the arrows, and adding an item from a day fills in that date. If someone asks about "the whole trip", give them the sweep across days rather than assuming they are looking at everything at once.
- A trip's first and last day normally follow its itinerary, so moving a flight or a check-out moves the trip's dates on its own. Say so when it is relevant. You cannot edit the trip's name, dates, destination or summary — the "Edit trip" button in the trip header does that, and it has a switch for pinning the dates by hand.
- For updates, include only the fields that actually change.
- Packing assignees must be one of the listed travelers, or "Shared" for family items.
- When you answer a question, answer from the context rather than general knowledge, and say plainly when something is not in the trip yet.
- Keep replies short. A sentence or two, or a tight list. No preamble.
- Everything you do applies to the one trip in the context below. If the user asks about a different trip, tell them to open that trip and ask again.

${focusSection(focus)}TRIP CONTEXT:
${contextText}`;
}

// ---------------------------------------------------------------------------
// General (all-trips) context, used when the assistant is opened from the
// trips list rather than inside one trip.
// ---------------------------------------------------------------------------

function daysBetween(fromISO, toISO) {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

export function buildGlobalContext({
  trips = [],
  itinerary = [],
  packing = [],
  tasks = [],
  notes = [],
  travelers = [],
  rosters = [],
  preferences = [],
  places = [],
  userName,
}) {
  const travelerNames = travelers.length
    ? Array.from(new Set([...travelers.map((t) => t.name), "Shared"]))
    : ["Shared"];

  const travelerIds = new Map(
    travelers.filter((t) => t.id && t.name).map((t) => [t.name, t.id])
  );

  const today = todayInChicago();

  // known.trips gates update/delete; tripContents feeds the delete warning.
  const known = {
    trips: new Map(),
    tripContents: new Map(),
    travel_preferences: new Map(),
    itinerary_items: new Map(),
  };

  const countFor = (rows, tripId, doneKey) => {
    const mine = rows.filter((r) => r.trip_id === tripId);
    const done = doneKey ? mine.filter((r) => r[doneKey]).length : 0;
    return { total: mine.length, done };
  };

  const lines = [];
  lines.push(`TODAY: ${today}`);
  lines.push(`SIGNED IN AS: ${userName || "a family member"}`);
  lines.push(`TRAVELERS: ${travelerNames.join(", ")}`);
  lines.push("");
  // Upcoming trips first (soonest first), then the ones that already happened
  // (most recent first), so Aly's default focus is what is still ahead.
  const isPast = (t) =>
    ["complete", "archived"].includes(t.status) ||
    (t.end_date || t.start_date || "9999-12-31") < today;
  const ordered = [...trips].sort((a, b) => {
    const pa = isPast(a);
    const pb = isPast(b);
    if (pa !== pb) return pa ? 1 : -1;
    const cmp = (a.start_date || "").localeCompare(b.start_date || "");
    return pa ? -cmp : cmp;
  });
  const upcomingCount = ordered.filter((t) => !isPast(t)).length;

  lines.push(
    trips.length
      ? `TRIPS (${trips.length} total, ${upcomingCount} still ahead):`
      : "TRIPS: none yet — the family has no trips saved."
  );

  for (const t of ordered) {
    known.trips.set(t.id, t.name);

    const itin = countFor(itinerary, t.id);
    const pack = countFor(packing, t.id, "is_packed");
    const task = countFor(tasks, t.id, "is_done");
    const note = countFor(notes, t.id);

    known.tripContents.set(
      t.id,
      [
        `${itin.total} itinerary items`,
        `${pack.total} packing items`,
        `${task.total} tasks`,
        `${note.total} notes`,
      ].join(", ")
    );

    const countdown = t.start_date ? daysBetween(today, t.start_date) : null;
    const when =
      countdown === null
        ? "dates not set"
        : countdown > 0
          ? `${countdown} days away`
          : countdown === 0
            ? "starts today"
            : "already happened";

    lines.push(
      `- ${t.name} [id: ${t.id}] — ${t.destination || "destination TBD"}, ` +
        `${t.start_date || "?"} to ${t.end_date || "?"} (${when}), status ${t.status}`
    );
    if (t.summary) lines.push(`    summary: ${short(t.summary, 220)}`);
    const goingNames = travelers
      .filter((p) =>
        rosters.some((r) => r.trip_id === t.id && r.traveler_id === p.id)
      )
      .map((p) => p.name);
    lines.push(
      `    ${goingNames.length ? `on this trip: ${goingNames.join(", ")}` : "nobody added to this trip yet"}`
    );
    lines.push(
      `    ${itin.total} itinerary items · packing ${pack.done}/${pack.total} packed · ` +
        `tasks ${task.done}/${task.total} done · ${note.total} notes`
    );
  }

  lines.push(
    ...preferenceLines(
      preferences,
      new Map(travelers.filter((t) => t.id).map((t) => [t.id, t.name])),
      known
    )
  );

  lines.push(
    ...placeLines(places, new Map(trips.map((t) => [t.id, t.name])), known)
  );

  return { text: lines.join("\n"), travelerNames, travelerIds, known };
}

export function buildGlobalSystemPrompt(contextText) {
  return `You are Aly, the Meyer family's travel assistant, built into Alyeska, their private trip planner app. Mark, his wife Steph, and their daughter Veda all use it. Be warm, concise, and practical.

The user opened you from the trips list, so you are NOT inside any one trip. You are looking across all of their trips.

WHAT YOU CAN DO HERE:
- Answer questions that span trips: which trip is next, how far away it is, how packing or tasks are coming along, how the trips compare.
- Create a new trip, change a trip's name, destination, dates, status or summary, and delete a trip. Changes are shown to the user for approval before anything is saved.
- Keep the family's travel preferences — how they like to travel, on every trip. Lean on them whenever you suggest anything and say when a suggestion goes against one. When the user tells you something durable ("we always want a late checkout", "Veda will not eat seafood"), call add_preference; you can also reword one with update_preference or remove one with delete_preference. A one-off decision about a single trip is not a preference.
- Keep the family's reviews of places they have been. The Reviews tab lists hotels, excursions, activities and restaurants from finished trips, and they are all in the context below with their ids, ratings and notes. Use update_review to set a 1–5 star rating, a written note, or both. Only review places that have actually happened, and never write a review in your own words — use what the user actually said.

WHAT YOU CANNOT DO HERE:
- Trip dates follow each trip's itinerary unless someone pinned them by hand, so they can shift when a flight or a check-out changes. Trip details other than the name are edited with the "Edit trip" button inside the trip.
- Who is on each trip is listed below. Use it as written; never assume the whole family is on a trip. You cannot change a trip's roster yourself — tell the user to tap the names in the trip header, or the trip chips on the People tab.
- A "People" tab holds passports, licenses, Known Traveler and Global Entry numbers. You cannot edit it — point the user there if they ask.
- You cannot add or change itinerary items, packing items, tasks or notes from this screen. Apart from the places listed under PLACES THE FAMILY HAS BEEN, you do not have the contents of any trip in front of you — only the counts below. If the user asks for something inside a trip, say which trip they should open and that you can help once they are in it. Never guess at what is on a trip's itinerary or packing list. The only change you may make to a past trip's item here is its rating and review.

RULES:
- Never invent dates, destinations or details the user did not give you.
- When creating a trip, a name is required. If the user was vague, ask one short question rather than inventing one. Compute dates from TODAY when they speak in relative terms.
- Every change you propose is shown to the user on a confirmation card that they must press to save, and a deletion card is clearly marked. So do not ask "are you sure" in text. If the user named one specific trip and wants it gone, call delete_trip and let the card do the confirming. Only ask a question first when you genuinely cannot tell which trip they mean, e.g. "delete the old one" while several are old. You may mention in one short sentence that archiving is an alternative, but still make the call they asked for.
- Trips marked "already happened", or whose status is complete or archived, are finished. Talk about them in the past tense, treat them as a record the family keeps, and do not suggest planning work for them unless the user asks. Do not count them as the next trip.
- Use the exact id from the TRIPS context for updates and deletes. Never invent an id.
- If the user asks for several changes in one message, emit a separate tool call for each.
- Keep replies short. A sentence or two, or a tight list. No preamble.

ALL TRIPS:
${contextText}`;
}
