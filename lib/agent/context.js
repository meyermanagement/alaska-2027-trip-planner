// Builds the snapshot the model reads, and the id allow-list the validator
// checks proposed changes against.
//
// There is one context for the whole app. Aly sees every trip and everything
// inside it no matter where the user opened her from; when a trip is open it is
// the FOCUS, which only changes what a vague request defaults to.

const PACKING_LINES_FOCUS = 200;
const PACKING_LINES_OTHER = 90;

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

function daysBetween(fromISO, toISO) {
  const a = new Date(`${fromISO}T00:00:00Z`).getTime();
  const b = new Date(`${toISO}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

function groupByTrip(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.trip_id)) map.set(row.trip_id, []);
    map.get(row.trip_id).push(row);
  }
  return map;
}

// The family's own travel preferences, so suggestions match how they travel.
// Ids are printed and recorded so the assistant can edit them.
function preferenceLines(preferences, travelerNameById, known) {
  const lines = [
    "",
    "HOW THIS FAMILY LIKES TO TRAVEL (their saved preferences, shared across every trip):",
  ];
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
      }`,
    );
  }
  return lines;
}

export function buildContext({
  trips = [],
  focusTripId = null,
  itinerary = [],
  packing = [],
  tasks = [],
  notes = [],
  travelers = [],
  rosters = [],
  preferences = [],
  userName,
}) {
  const travelerNames = travelers.length
    ? Array.from(new Set([...travelers.map((t) => t.name), "Shared"]))
    : ["Shared"];
  const travelerIds = new Map(
    travelers.filter((t) => t.id && t.name).map((t) => [t.name, t.id]),
  );
  const travelerNameById = new Map(
    travelers.filter((t) => t.id).map((t) => [t.id, t.name]),
  );

  // Every id the user is allowed to touch, and which trip each row sits in.
  const known = {
    trips: new Map(),
    tripContents: new Map(),
    travel_preferences: new Map(),
    itinerary_items: new Map(),
    packing_items: new Map(),
    predeparture_tasks: new Map(),
    trip_notes: new Map(),
    rowTrip: new Map(),
  };

  const today = todayInChicago();
  const isPast = (t) =>
    ["complete", "archived"].includes(t.status) ||
    (t.end_date || t.start_date || "9999-12-31") < today;

  const itinByTrip = groupByTrip(itinerary);
  const packByTrip = groupByTrip(packing);
  const taskByTrip = groupByTrip(tasks);
  const noteByTrip = groupByTrip(notes);

  // Focus trip first, then what is still ahead, then the finished trips.
  const ordered = [...trips].sort((a, b) => {
    if (a.id === focusTripId) return -1;
    if (b.id === focusTripId) return 1;
    const pa = isPast(a);
    const pb = isPast(b);
    if (pa !== pb) return pa ? 1 : -1;
    const cmp = (a.start_date || "").localeCompare(b.start_date || "");
    return pa ? -cmp : cmp;
  });
  const focusTrip = trips.find((t) => t.id === focusTripId) || null;

  const lines = [];
  lines.push(`TODAY: ${today}`);
  lines.push(`SIGNED IN AS: ${userName || "a family member"}`);
  lines.push(`TRAVELERS: ${travelerNames.join(", ")}`);
  lines.push(
    focusTrip
      ? `OPEN RIGHT NOW: ${focusTrip.name} [id: ${focusTrip.id}]. Anything the user does not pin to another trip belongs to this one.`
      : "OPEN RIGHT NOW: no single trip — the user is on a screen that spans every trip. Work out which trip they mean from what they say, and ask if you genuinely cannot tell.",
  );

  lines.push(...preferenceLines(preferences, travelerNameById, known));

  const upcomingCount = trips.filter((t) => !isPast(t)).length;
  lines.push("");
  lines.push(
    trips.length
      ? `TRIPS (${trips.length} total, ${upcomingCount} still ahead):`
      : "TRIPS: none yet — the family has no trips saved.",
  );

  for (const t of ordered) {
    known.trips.set(t.id, t.name);
    const itin = itinByTrip.get(t.id) || [];
    const pack = packByTrip.get(t.id) || [];
    const task = taskByTrip.get(t.id) || [];
    const note = noteByTrip.get(t.id) || [];

    known.tripContents.set(
      t.id,
      [
        `${itin.length} itinerary items`,
        `${pack.length} packing items`,
        `${task.length} tasks`,
        `${note.length} notes`,
      ].join(", "),
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
        `${t.start_date || "?"} to ${t.end_date || "?"} (${when}), status ${
          t.status
        }${t.id === focusTripId ? " ← OPEN" : ""}`,
    );
    if (t.summary) lines.push(`    summary: ${short(t.summary, 220)}`);
    const goingNames = travelers
      .filter((p) =>
        rosters.some((r) => r.trip_id === t.id && r.traveler_id === p.id),
      )
      .map((p) => p.name);
    lines.push(
      `    ${
        goingNames.length
          ? `on this trip: ${goingNames.join(", ")}`
          : "nobody added to this trip yet"
      }`,
    );
    lines.push(
      `    ${itin.length} itinerary items · packing ${
        pack.filter((p) => p.is_packed).length
      }/${pack.length} packed · tasks ${
        task.filter((k) => k.is_done).length
      }/${task.length} done · ${note.length} notes`,
    );
  }

  // Then the contents of every trip, so a change can be made from anywhere.
  for (const t of ordered) {
    const focused = t.id === focusTripId;
    const past = isPast(t);
    const itin = (itinByTrip.get(t.id) || [])
      .slice()
      .sort(
        (a, b) =>
          (a.item_date || "").localeCompare(b.item_date || "") ||
          (a.sort_order || 0) - (b.sort_order || 0),
      );
    const pack = packByTrip.get(t.id) || [];
    const task = taskByTrip.get(t.id) || [];
    const note = noteByTrip.get(t.id) || [];

    lines.push("");
    lines.push(
      `===== ${t.name.toUpperCase()} [trip id: ${t.id}]${
        focused ? " — THE TRIP THAT IS OPEN" : past ? " — already happened" : ""
      } =====`,
    );

    lines.push(`ITINERARY (${itin.length}):`);
    if (itin.length === 0) lines.push("(empty)");
    for (const i of itin) {
      known.itinerary_items.set(i.id, short(i.title, 60));
      known.rowTrip.set(i.id, t.id);
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
      if (i.rating) bits.push(`rated ${i.rating}/5`);
      if (i.review) bits.push(`review: ${short(i.review, 160)}`);
      lines.push(`- ${bits.join(" | ")}`);
    }

    lines.push(
      `TASKS (${task.length}, ${task.filter((k) => k.is_done).length} done):`,
    );
    if (task.length === 0) lines.push("(empty)");
    for (const k of task) {
      known.predeparture_tasks.set(k.id, short(k.title, 60));
      known.rowTrip.set(k.id, t.id);
      lines.push(
        `- id=${k.id} | ${k.is_done ? "done" : "open"} | ${k.assignee} | ${
          k.timing
        }${k.due_date ? ` | due ${k.due_date}` : ""} | ${short(k.title, 90)}`,
      );
    }

    const cap = focused ? PACKING_LINES_FOCUS : PACKING_LINES_OTHER;
    lines.push(
      `PACKING (${pack.length} items, ${
        pack.filter((p) => p.is_packed).length
      } packed):`,
    );
    if (pack.length === 0) lines.push("(empty)");
    for (const p of pack.slice(0, cap)) {
      known.packing_items.set(p.id, short(p.item, 60));
      known.rowTrip.set(p.id, t.id);
      lines.push(
        `- id=${p.id} | ${p.is_packed ? "packed" : "not packed"} | ${
          p.assignee
        } | ${p.category} | ${p.quantity ? `${p.quantity} × ` : ""}${short(
          p.item,
          70,
        )}`,
      );
    }
    if (pack.length > cap) {
      // Ids past the printed window still resolve, they just aren't listed.
      for (const p of pack.slice(cap)) {
        known.packing_items.set(p.id, short(p.item, 60));
        known.rowTrip.set(p.id, t.id);
      }
      lines.push(`(… ${pack.length - cap} more packing items not listed)`);
    }

    lines.push(`NOTES (${note.length}):`);
    if (note.length === 0) lines.push("(empty)");
    for (const n of note.slice(0, 25)) {
      known.trip_notes.set(n.id, short(n.title || n.body, 60));
      known.rowTrip.set(n.id, t.id);
      lines.push(
        `- id=${n.id} | ${n.title ? `${short(n.title, 60)}: ` : ""}${short(
          n.body,
          200,
        )}`,
      );
    }
  }

  return {
    text: lines.join("\n"),
    travelerNames,
    travelerIds,
    known,
    focusTripId: focusTrip ? focusTrip.id : null,
    focusTripName: focusTrip ? focusTrip.name : null,
  };
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

function focusSection(focus, tripName) {
  const label = FOCUS_LABELS[focus];
  const hint = FOCUS_HINTS[focus];
  if (!label || !hint || !tripName) return "";
  return `WHERE THE USER IS RIGHT NOW:
They have ${tripName} open and are looking at ${label}. Resolve anything vague against THAT section of THAT trip rather than the whole app:
- Questions: ${hint.ask} Answer about this section only, and do not switch to another section unless they name it.
- Additions: a bare "add X" means ${hint.add} on ${tripName}, unless X is plainly something else.
- References like "that one" or "the first one" mean an item in this section.
An explicit request still wins over this default — "add breakfast at 8 on the 21st" is an itinerary item no matter which section is open, and a request that names another trip goes to that trip.

`;
}

export function buildSystemPrompt(contextText, focus, focusTripName) {
  const placeNote = focusTripName
    ? `The user opened you from inside ${focusTripName}, so that trip is the default for anything they do not pin elsewhere. You can still see and change every other trip.`
    : "The user opened you from a screen that spans every trip, so nothing is the default. You can see and change every trip.";

  return `You are Aly, the Meyer family's travel assistant, built into Alyeska, their private trip planner app. Mark, his wife Steph, and their daughter Veda all use it. Be warm, concise, and practical.

${placeNote}

WHAT YOU CAN CHANGE, FROM ANYWHERE IN THE APP:
- Trips themselves: create one, change its name, destination, dates, status or summary, and delete one.
- Anything inside any trip: itinerary items, packing items, pre-departure tasks and notes. Say which trip when you add something and the user has not made it obvious, using the trip's exact name from the context.
- Replacing a whole list, not editing it. When the user says to replace the packing list, or pastes a new list to use instead of the old one, call clear_packing_list once for that trip and then add_packing_item for each item on the new list. Never clear a list by calling delete_packing_item for every row; that is slow enough to fail. delete_packing_item is for taking out one or two named things.
- A new trip and everything that goes in it, in one reply. When the user says "make a trip for Italy" and pastes an old itinerary or packing list with it, call create_trip and then the add_ calls for its contents in the same reply, passing the new trip's exact name as the trip on each one. Do not ask them to create the trip first and paste again.
- The family's travel preferences — how they like to travel, on every trip. Lean on them whenever you suggest anything and say plainly when a suggestion goes against one. When the user tells you something durable ("we always want a late checkout", "Veda will not eat seafood"), save it. A one-off decision about a single trip is not a preference: that belongs on the itinerary, in a task or in a note.
- The family's ratings and reviews of places they have already been — hotels, excursions, activities and restaurants. Set a 1–5 star rating, a written note, or both. Only review something that has actually happened, and never write a review in your own words: use what the user actually said.

Every change you propose is shown to the user on a confirmation card that they must press to save, and a deletion card is clearly marked. So propose confidently and do not ask "are you sure" in text.

WHAT YOU CANNOT CHANGE:
- Who is on each trip. The roster is listed with each trip below; use it as written and never assume the whole family is going. Tell the user to tap the names in the trip header, or the trip chips on the People tab.
- The People tab: passports, licenses, Known Traveler and Global Entry numbers. Point the user there if they ask.

RULES:
- If the user asks for several changes in one message, emit a SEPARATE tool call for EVERY change. Never stop after the first one. Adding an itinerary item and adding a task are two separate calls.
- Never invent confirmation numbers, flight numbers, prices, addresses, dates, or times that the user did not provide and that are not in the context.
- If a request is genuinely ambiguous about what, who, when, or which trip, ask one short clarifying question and make no tool calls.
- Relative dates are fine to compute from TODAY and the trip's dates. "A week before the trip" means seven days before that trip's start date.
- Use the exact id from the context for every update, completion and deletion. Never make up an id. If you cannot find a matching row, say so instead of guessing.
- For updates, include only the fields that actually change.
- Packing and task assignees must be one of the listed travelers, or "Shared" for family items.
- A trip's first and last day normally follow its itinerary, so moving a flight or a check-out can move the trip's dates on its own. Say so when it is relevant. The "Edit trip" button in the trip header has a switch for pinning dates by hand.
- Anything on an itinerary marked "needs booking" has a "Make this a task" button on its card, which puts a matching "Book …" task on the Tasks tab and links the two. When several things need booking at once there is a bar at the top of the Itinerary offering to make all of them. Point people at that instead of asking them to retype tasks by hand.
- The Itinerary tab shows one day at a time: a strip of day tiles across the top, then that day's plans underneath. People move between days by tapping a tile, swiping, or using the arrows, and adding an item from a day fills in that date.
- Trips marked "already happened", or whose status is complete or archived, are finished. Talk about them in the past tense, treat them as the record the family keeps, and do not suggest planning work for them unless the user asks. Do not count them as the next trip. The "Preferences & Reviews" tab is built from their hotels, excursions, activities and restaurants, and it is also where the family's standing travel preferences live — point people there for either.
- The conversation you are shown is the saved record of this thread, kept in the app itself, so lean on it: earlier turns tell you who "her" is and which trip "the same one" means. Lines like "Saved 2 changes." or "Nothing was saved." are receipts written after the user pressed the card, and they are the truth about what actually happened. When someone asks whether something went through, answer from the receipt in plain words instead of proposing the change over again — only propose it again if they ask you to.
- Answer questions from the context below rather than general knowledge, and say plainly when something is not saved yet.
- When a question does not name a trip and no trip is open, answer across all of them, newest plans first.
- Keep replies short. A sentence or two, or a tight list. No preamble.

${focusSection(focus, focusTripName)}THE FAMILY'S TRIPS:
${contextText}`;
}
