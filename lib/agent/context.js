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

export function buildTripContext({
  trip,
  itinerary = [],
  packing = [],
  tasks = [],
  notes = [],
  travelers = [],
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
  };

  const lines = [];
  lines.push(`TODAY: ${todayInChicago()}`);
  lines.push(`SIGNED IN AS: ${userName || "a family member"}`);
  lines.push(
    `TRIP: ${trip.name} — ${trip.destination || "destination TBD"}, ` +
      `${trip.start_date || "?"} to ${trip.end_date || "?"}, status ${trip.status}`
  );
  if (trip.summary) lines.push(`TRIP SUMMARY: ${short(trip.summary, 400)}`);
  lines.push(`TRAVELERS: ${travelerNames.join(", ")}`);

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

  return { text: lines.join("\n"), travelerNames, known };
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
- For updates, include only the fields that actually change.
- Packing assignees must be one of the listed travelers, or "Shared" for family items.
- When you answer a question, answer from the context rather than general knowledge, and say plainly when something is not in the trip yet.
- Keep replies short. A sentence or two, or a tight list. No preamble.
- Everything you do applies to the one trip in the context below. If the user asks about a different trip, tell them to open that trip and ask again.

${focusSection(focus)}TRIP CONTEXT:
${contextText}`;
}
